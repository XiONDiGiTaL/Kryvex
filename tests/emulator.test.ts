import { describe, expect, it } from 'vitest';
import {
  MAX_ROM_BYTES,
  ROM_SYSTEMS,
  coreFor,
  detectRomSystem,
  emulatorGameId,
  emulatorHostDocument,
  extensionOf,
  identifyRomSystem,
  romValidation,
  systemLabel,
  systemsForFile,
} from '../src/lib/emulator';

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
