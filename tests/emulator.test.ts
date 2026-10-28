import { describe, expect, it } from 'vitest';
import {
  MAX_DISC_BYTES,
  MAX_ROM_BYTES,
  ROM_SYSTEMS,
  coreFor,
  detectRomSystem,
  emulatorGameId,
  emulatorHostDocument,
  emulatorStartMessage,
  engineFor,
  extensionOf,
  identifyRomSystem,
  isDiscSystem,
  offeredSystems,
  romAccept,
  romValidation,
  systemLabel,
  systemsForFile,
} from '../src/lib/emulator';

/** The second engine is on, as the panel reports it once it is installed. */
const SECOND_ENGINE = { flycast: true } as const;

describe('emulator ROM rules', () => {
  it('maps every supported extension to a system', () => {
    expect(detectRomSystem('game.nes')).toBe('nes');
    expect(detectRomSystem('game.SMC')).toBe('snes');
    expect(detectRomSystem('game.sfc')).toBe('snes');
    expect(detectRomSystem('game.gb')).toBe('gb');
    expect(detectRomSystem('game.gbc')).toBe('gb');
    expect(detectRomSystem('game.gba')).toBe('gba');
    expect(detectRomSystem('game.sms')).toBe('sms');
    expect(detectRomSystem('game.gg')).toBe('gg');
    expect(detectRomSystem('game.md')).toBe('genesis');
    expect(detectRomSystem('game.gen')).toBe('genesis');
    expect(detectRomSystem('game.smd')).toBe('genesis');
    expect(detectRomSystem('game.32x')).toBe('sega32x');
    expect(detectRomSystem('game.sg')).toBe('sg1000');
    expect(detectRomSystem('game.a26')).toBe('atari2600');
    expect(detectRomSystem('game.a78')).toBe('atari7800');
    expect(detectRomSystem('game.lnx')).toBe('lynx');
    expect(detectRomSystem('game.pce')).toBeNull();
    expect(systemsForFile('game.pce')).toEqual(['pce', 'sgx']);
    expect(detectRomSystem('game.sgx')).toBe('sgx');
    expect(detectRomSystem('game.ngc')).toBe('ngpc');
    expect(detectRomSystem('game.vb')).toBe('vb');
    expect(detectRomSystem('game.n64')).toBe('n64');
    expect(detectRomSystem('game.z64')).toBe('n64');
    expect(detectRomSystem('game.V64')).toBe('n64');
    expect(detectRomSystem('disc.chd')).toBe('psx');
    expect(detectRomSystem('disc.PBP')).toBe('psx');
    expect(detectRomSystem('manual.pdf')).toBeNull();
    expect(extensionOf('no-extension')).toBe('no-extension');
  });

  it('rejects unsupported, empty and oversized ROMs', () => {
    expect(romValidation('game.nes', 1024)).toBeNull();
    expect(romValidation('game.bin', 1024)).toBeNull();
    expect(romValidation('game.zip', 1024)).toMatch(/not a supported ROM/);
    expect(romValidation('game.nes', 0)).toMatch(/empty/);
    expect(romValidation('game.nes', MAX_ROM_BYTES + 1)).toMatch(/larger than/);
  });

  it('measures a disc image against the disc cap, not the cartridge one', () => {
    // A CD is an order of magnitude larger than any cartridge, so the slot has
    // to accept it before the core can open it; the formats offered are the
    // self-contained ones, because a bare .cue carries no picture data.
    expect(isDiscSystem('psx')).toBe(true);
    expect(isDiscSystem('snes')).toBe(false);
    expect(ROM_SYSTEMS.find(system => system.id === 'psx')?.core).toBe('psx');
    expect(romValidation('disc.chd', MAX_ROM_BYTES * 4)).toBeNull();
    expect(romValidation('disc.chd', MAX_DISC_BYTES)).toBeNull();
    expect(romValidation('disc.chd', MAX_DISC_BYTES + 1)).toMatch(/disc image is larger/);
    // The cartridge cap is unchanged, so a 300 MB "cartridge" is still refused.
    expect(romValidation('game.nes', MAX_ROM_BYTES * 4)).toMatch(/larger than 64 MB/);
    // A bare .cue would be a manifest with no data, so it is not accepted.
    expect(romValidation('disc.cue', 2048)).toMatch(/not a supported ROM/);
  });

  it('offers N64 on the core the CDN actually ships', () => {
    // Measured against the CDN's own manifest: `mupen64plus_next` and
    // `parallel_n64` are both published, and EmulatorJS maps `n64` to them.
    const entry = ROM_SYSTEMS.find(system => system.id === 'n64');
    expect(entry?.core).toBe('n64');
    expect(entry?.disc).toBeUndefined();
    expect(entry?.note).toMatch(/memory/);
    // A .z64, a .v64 and a .n64 are one dump with different byte order, so all
    // three reach the same console and none of them asks which one it is.
    for (const name of ['game.n64', 'game.v64', 'game.z64']) {
      expect(systemsForFile(name)).toEqual(['n64']);
    }
    // Cartridges, not discs: the N64 cap is the cartridge cap.
    expect(romValidation('game.z64', MAX_ROM_BYTES)).toBeNull();
    expect(romValidation('game.z64', MAX_ROM_BYTES + 1)).toMatch(/larger than 64 MB/);
  });

  it('asks for a console when an extension is shared', () => {
    expect(systemsForFile('game.bin')).toEqual([
      'genesis',
      'sega32x',
      'sms',
      'gg',
      'sg1000',
      'atari2600',
      'atari7800',
    ]);
    expect(systemsForFile('game.ws')).toEqual(['ws', 'wsc']);
    expect(systemsForFile('game.ngp')).toEqual(['ngp', 'ngpc']);
    expect(detectRomSystem('game.bin')).toBeNull();
  });

  it('maps systems to EmulatorJS cores and display names', () => {
    for (const system of ROM_SYSTEMS) {
      expect(coreFor(system.id)).toBe(system.core);
      expect(systemLabel(system.id)).toBe(system.label);
    }
  });

  it('gives each game a stable numeric id', () => {
    expect(emulatorGameId('Contra (USA).nes')).toBe(emulatorGameId('Contra (USA).nes'));
    expect(Number.isInteger(emulatorGameId('Contra (USA).nes'))).toBe(true);
    expect(emulatorGameId('Contra (USA).nes')).toBeGreaterThan(0);
  });

  it('reads shared Sega and Atari headers instead of guessing', () => {
    const header = (text: string, offset: number, size = 0x8000) => {
      const bytes = new Uint8Array(size);
      for (let index = 0; index < text.length; index += 1) {
        bytes[offset + index] = text.charCodeAt(index);
      }
      return bytes.buffer;
    };
    expect(identifyRomSystem(header('SEGA MEGA DRIVE', 0x100))).toBe('genesis');
    expect(identifyRomSystem(header('SEGA GENESIS', 0x100))).toBe('genesis');
    expect(identifyRomSystem(header('SEGA 32X', 0x100))).toBe('sega32x');

    const sms = new Uint8Array(header('TMR SEGA', 0x7ff0));
    sms[0x7fff] = 0x40;
    expect(identifyRomSystem(sms.buffer)).toBe('sms');
    sms[0x7fff] = 0x50;
    expect(identifyRomSystem(sms.buffer)).toBe('gg');

    const a78 = header('ATARI7800', 1, 128);
    new Uint8Array(a78)[0] = 1;
    expect(identifyRomSystem(a78)).toBe('atari7800');
    expect(identifyRomSystem(new Uint8Array(0x8000).buffer)).toBeNull();
  });

  it('reads WonderSwan and Neo Geo Pocket color headers', () => {
    // WonderSwan keeps its boot header in the final 16 bytes of the image.
    const ws = new Uint8Array(0x8000);
    ws.set([0xea, 0, 0, 0, 0, 0, 0, 0x00, 0, 0, 0x02], 0x7ff0);
    expect(identifyRomSystem(ws.buffer)).toBe('ws');
    expect(systemsForFile('game.ws')).toContain(identifyRomSystem(ws.buffer));
    ws[0x7ff7] = 0x01;
    expect(identifyRomSystem(ws.buffer)).toBe('wsc');
    ws[0x7ff7] = 0x02;
    expect(identifyRomSystem(ws.buffer)).toBeNull();
    ws[0x7ff7] = 0x00;
    ws[0x7ffa] = 0x01;
    expect(identifyRomSystem(ws.buffer)).toBeNull();
    ws[0x7ffa] = 0x02;
    ws[0x7ff0] = 0x00;
    expect(identifyRomSystem(ws.buffer)).toBeNull();

    // Neo Geo Pocket headers begin with the SNK copyright and flag color at 0x23.
    const ngp = new Uint8Array(0x1000);
    const licence = 'COPYRIGHT BY SNK CORPORATION';
    for (let index = 0; index < licence.length; index += 1) {
      ngp[index] = licence.charCodeAt(index);
    }
    ngp[0x23] = 0x00;
    expect(identifyRomSystem(ngp.buffer)).toBe('ngp');
    expect(systemsForFile('game.ngp')).toContain(identifyRomSystem(ngp.buffer));
    ngp[0x23] = 0x10;
    expect(identifyRomSystem(ngp.buffer)).toBe('ngpc');
    ngp[0x23] = 0x01;
    expect(identifyRomSystem(ngp.buffer)).toBeNull();
    ngp[0x23] = 0x10;
    ngp[0x1b] = 0x00;
    expect(identifyRomSystem(ngp.buffer)).toBeNull();
  });

  it('routes the core’s save buttons through the shell, not Downloads', () => {
    const html = emulatorHostDocument('');
    // Loader hooks: registering one makes EmulatorJS skip its own handler, so
    // the core's Save/Load State buttons act on Kryvex's store.
    expect(html).toContain('EJS_onSaveState');
    expect(html).toContain('EJS_onLoadState');
    expect(html).toContain('EJS_onSaveSave');
    expect(html).toContain('EJS_onLoadSave');
    expect(html).toContain('gameManager.getState()');
    expect(html).toContain('gameManager.loadState(new Uint8Array(data))');
    // The message protocol the panel speaks.
    for (const type of [
      'kryvex-save-state',
      'kryvex-state-thumb',
      'kryvex-load-state',
      'kryvex-battery-load',
      'kryvex-pause',
      'kryvex-resume',
      'kryvex-mute',
    ]) {
      expect(html).toContain(type);
    }
    // Muting is a volume change, not a pause: the game keeps running.
    expect(html).toContain('setVolume(0)');
    expect(html).toContain('ejs.pause(true)');
  });

  it('offers exactly the cartridge engine until the second engine is on', () => {
    // The whole point of the gate: a default install behaves as it did before
    // the feature existed. Dreamcast is not in the list, no Dreamcast format is
    // accepted, and nothing was downloaded.
    expect(offeredSystems().some(system => system.id === 'dreamcast')).toBe(false);
    expect(offeredSystems(SECOND_ENGINE).map(system => system.id)).toContain('dreamcast');
    expect(ROM_SYSTEMS.map(system => system.id)).toContain('dreamcast');
    expect(romAccept()).not.toContain('.cdi');
    expect(romAccept(SECOND_ENGINE)).toContain('.cdi');
    expect(engineFor('nes')).toBe('emulatorjs');
    expect(engineFor('dreamcast')).toBe('flycast');
    expect(coreFor('dreamcast')).toBe('flycast');
  });

  it('keeps a Dreamcast file unsupported while the engine is off', () => {
    expect(detectRomSystem('game.cdi')).toBeNull();
    expect(systemsForFile('game.cdi')).toEqual([]);
    expect(romValidation('game.cdi', 4096)).toMatch(/not a supported ROM/);
    expect(romValidation('game.cdi', 4096, SECOND_ENGINE)).toBeNull();
    expect(detectRomSystem('game.cdi', SECOND_ENGINE)).toBe('dreamcast');
  });

  it('asks which console a .chd belongs to only when both engines are on', () => {
    // A CHD is a PlayStation image and a Dreamcast one. With the cartridge
    // engine alone the answer stays PlayStation; with the second engine on the
    // format is genuinely ambiguous and the chooser has to ask.
    expect(systemsForFile('disc.chd')).toEqual(['psx']);
    expect(detectRomSystem('disc.chd')).toBe('psx');
    // Table order, which is the order the chooser offers them in.
    expect(systemsForFile('disc.chd', SECOND_ENGINE)).toEqual(['dreamcast', 'psx']);
    expect(detectRomSystem('disc.chd', SECOND_ENGINE)).toBeNull();
    // `.zip` was never a ROM before this batch; it is a Dreamcast set now.
    expect(romValidation('set.zip', 4096)).toMatch(/not a supported ROM/);
    expect(detectRomSystem('set.zip', SECOND_ENGINE)).toBe('dreamcast');
  });

  it('measures a Dreamcast image against the disc cap', () => {
    expect(isDiscSystem('dreamcast')).toBe(true);
    expect(romValidation('disc.cdi', MAX_DISC_BYTES, SECOND_ENGINE)).toBeNull();
    expect(romValidation('disc.cdi', MAX_DISC_BYTES + 1, SECOND_ENGINE)).toMatch(
      /disc image is larger/,
    );
    // A bare .gdi is a manifest and carries no picture data, so it is not
    // offered; a zipped set is.
    expect(romValidation('disc.gdi', 1024, SECOND_ENGINE)).toMatch(/not a supported ROM/);
  });

  it('hands the packed core to the frame only when one was passed', () => {
    const start = emulatorStartMessage({
      name: 'game.cdi',
      data: new ArrayBuffer(8),
      system: 'dreamcast',
      gamepad: true,
      bios: null,
    });
    expect(start.core).toBe('flycast');
    expect(start.coreZip).toBeNull();

    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const withCore = emulatorStartMessage({
      name: 'game.cdi',
      data: new ArrayBuffer(8),
      system: 'dreamcast',
      gamepad: true,
      bios: null,
      coreZip: zip,
    });
    expect(withCore.coreZip).toBe(zip);
  });

  it('serves a second engine from an overridden core path, never from disk', () => {
    const html = emulatorHostDocument();
    // The frontend looks a core up in its data path; EJS_paths redirects that
    // one file to the blob the shell packed, so Kryvex serves no core itself.
    expect(html).toContain("'flycast-wasm.data': coreZipUrl");
    expect(html).toContain("'flycast-legacy-wasm.data': coreZipUrl");
    expect(html).toContain('message.coreZip');
    // The WebGL2 choice comes from the setting, not from a report blob: the
    // frontend reads a blob download as bytes and never parses it.
    expect(html).toContain("webgl2Enabled: 'enabled'");
    expect(html).not.toContain('flycast.json');
  });

  it('builds a host document with no bridge access and no remote core path override', () => {
    const html = emulatorHostDocument('');
    expect(html).toContain('kryvex-emulator-ready');
    expect(html).toContain('kryvex-rom');
    expect(html).toContain('EJS_pathtodata');
    expect(html).toContain('URL.createObjectURL');
    // Flex avoids the auto-grid-row ResizeObserver loop that grows the canvas.
    expect(html).toContain('#game { width: 100%; height: 100%; display: flex;');
    // Both storage APIs throw in a same-origin-less sandbox; the host shims them.
    expect(html).toContain("Object.defineProperty(window, 'localStorage'");
    expect(html).toContain("Object.defineProperty(window, 'indexedDB'");
    expect(html).not.toContain('window.kryvex');
    // The iframe is sandboxed at the React layer; the document itself never
    // assumes same-origin access to the shell.
    expect(html).not.toContain('parent.kryvex');
  });
});
