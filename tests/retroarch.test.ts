import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RETROARCH_CORES,
  RETROARCH_NETPLAY_PORT,
  candidateCores,
  cleanNick,
  parseJoinAddress,
  retroarchArgs,
  retroarchCoreFile,
  retroarchSearchPaths,
  safeRomName,
} from '../electron/retroarch-catalogue';
import {
  RetroArchSidecar,
  localAddress,
  normalizeRetroarchStart,
} from '../electron/retroarch';

/** A throwaway profile, so a test never touches the real userData. */
function profile(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-netplay-'));
}

/** A fake install: the executable and one core, both empty files. */
function fakeInstall(): { home: string; executable: string } {
  const home = profile();
  const install = profile();
  fs.writeFileSync(path.join(install, 'retroarch.exe'), '');
  fs.mkdirSync(path.join(install, 'cores'));
  fs.writeFileSync(path.join(install, 'cores', 'flycast_libretro.dll'), '');
  return { home, executable: path.join(install, 'retroarch.exe') };
}

describe('RetroArch netplay arguments', () => {
  it('hosts and joins with the documented flags', () => {
    const host = retroarchArgs({
      corePath: 'C:\\RA\\cores\\fceumm_libretro.dll',
      romPath: 'C:\\RA-roms\\Mega Man 2.nes',
      role: 'host',
      nick: 'XiØN',
    });
    expect(host).toEqual([
      '-L',
      'C:\\RA\\cores\\fceumm_libretro.dll',
      '-H',
      '--port',
      '55435',
      '--nick',
      'XiØN',
      'C:\\RA-roms\\Mega Man 2.nes',
    ]);

    const join = retroarchArgs({
      corePath: 'C:\\RA\\cores\\fceumm_libretro.dll',
      romPath: 'C:\\RA-roms\\Mega Man 2.nes',
      role: 'join',
      host: '10.0.0.4',
      port: 55436,
      nick: 'Player 2',
    });
    expect(join).toEqual([
      '-L',
      'C:\\RA\\cores\\fceumm_libretro.dll',
      '-C',
      '10.0.0.4',
      '--port',
      '55436',
      '--nick',
      'Player 2',
      'C:\\RA-roms\\Mega Man 2.nes',
    ]);
  });

  it('runs on Kryvex’s own config and log, in that order', () => {
    const args = retroarchArgs({
      corePath: 'C:\\RA\\cores\\fceumm_libretro.dll',
      romPath: 'C:\\RA-roms\\Mega Man 2.nes',
      role: 'host',
      nick: 'XiØN',
      configPath: 'C:\\Users\\x\\AppData\\Roaming\\Kryvex\\retroarch\\retroarch.cfg',
      logPath: 'C:\\Users\\x\\AppData\\Roaming\\Kryvex\\retroarch\\session.log',
    });
    expect(args.slice(0, 2)).toEqual([
      '-c',
      'C:\\Users\\x\\AppData\\Roaming\\Kryvex\\retroarch\\retroarch.cfg',
    ]);
    // The log needs both switches: `--log-file` alone writes nothing on 1.22.2.
    expect(args).toContain('-v');
    expect(args).toContain('--log-file=C:\\Users\\x\\AppData\\Roaming\\Kryvex\\retroarch\\session.log');
    expect(args[args.length - 1]).toBe('C:\\RA-roms\\Mega Man 2.nes');
  });

  it('keeps a nickname printable, short and never empty', () => {
    expect(cleanNick('  XiØN  ')).toBe('XiØN');
    expect(cleanNick('a\u0000b\u001fc\nd')).toBe('abcd');
    expect(cleanNick('')).toBe('Kryvex');
    expect(cleanNick(undefined)).toBe('Kryvex');
    expect(cleanNick('x'.repeat(80)).length).toBe(24);
  });

  it('names a core file the way RetroArch stores it', () => {
    expect(retroarchCoreFile('fceumm')).toBe('fceumm_libretro.dll');
    expect(candidateCores('dreamcast')).toEqual(['flycast']);
    expect(candidateCores('snes')[0]).toBe('snes9x');
    expect(candidateCores('nonexistent')).toEqual([]);
    // Every console Kryvex offers has at least one candidate core.
    expect(Object.keys(RETROARCH_CORES).length).toBeGreaterThan(15);
  });
});

describe('RetroArch join addresses', () => {
  it('accepts an IP or a name, with or without a port', () => {
    expect(parseJoinAddress('10.0.0.4')).toEqual({
      host: '10.0.0.4',
      port: RETROARCH_NETPLAY_PORT,
      shown: '10.0.0.4:55435',
    });
    expect(parseJoinAddress('  192.168.1.20:55436 ')).toEqual({
      host: '192.168.1.20',
      port: 55436,
      shown: '192.168.1.20:55436',
    });
    expect(parseJoinAddress('my-host.example')).toEqual({
      host: 'my-host.example',
      port: RETROARCH_NETPLAY_PORT,
      shown: 'my-host.example:55435',
    });
    // A bare IPv6 literal keeps its own colons.
    expect(parseJoinAddress('fe80::1')?.host).toBe('fe80::1');
    expect(parseJoinAddress('[fe80::1]:55435')?.host).toBe('fe80::1');
  });

  it('refuses what it cannot dial instead of guessing', () => {
    for (const bad of [
      '',
      '   ',
      'http://10.0.0.4',
      '10.0.0.4/netplay',
      '10.0.0.4 55435',
      '10.0.0.4:0',
      '10.0.0.4:70000',
      ':55435',
      '.10.0.0.4',
      '10.0.0.4.',
      42,
      null,
      { host: '10.0.0.4' },
    ]) {
      expect(parseJoinAddress(bad)).toBeNull();
    }
  });
});

describe('RetroArch cartridge files', () => {
  it('keeps the system extension and drops anything path-like', () => {
    expect(safeRomName('Sonic Adventure.cdi', 'cdi')).toBe('Sonic Adventure.cdi');
    expect(safeRomName('../../evil.exe', 'nes')).toBe('evil.nes');
    expect(safeRomName('C:\\roms\\game.nes', 'nes')).toBe('game.nes');
    expect(safeRomName('', 'gba')).toBe('game.gba');
    expect(safeRomName('a:b*c?', 'smc')).toBe('a-b-c-.smc');
  });

  it('finds the usual Windows installs', () => {
    const paths = retroarchSearchPaths({
      ProgramFiles: 'D:\\Apps',
      'ProgramFiles(x86)': 'D:\\Apps32',
      LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local',
    });
    expect(paths.every(entry => entry.toLowerCase().endsWith('retroarch.exe'))).toBe(true);
    expect(paths).toContain('D:\\Apps\\RetroArch-Win64\\retroarch.exe');
    expect(paths).toContain('D:\\Apps32\\Steam\\steamapps\\common\\RetroArch\\retroarch.exe');
    expect(paths).toContain('C:\\Users\\x\\AppData\\Local\\RetroArch\\retroarch.exe');
  });
});

describe('The netplay sidecar', () => {
  it('reports what is on the machine before it starts anything', () => {
    const sidecar = new RetroArchSidecar(profile());
    const status = sidecar.status();
    expect(status.defaultPort).toBe(RETROARCH_NETPLAY_PORT);
    expect(status.phase).toBe('idle');
    expect(status.session).toBeNull();
    expect(status.supported).toBe(process.platform === 'win32');
    // The profile is empty, so nothing is found and no core is present.
    expect(status.cores.every(core => core.present === false)).toBe(true);
    const address = localAddress();
    expect(address === null || /^[\d.]+:55435$/.test(address)).toBe(true);
  });

  it('remembers a real RetroArch and refuses anything else', () => {
    const sidecar = new RetroArchSidecar(profile());
    expect(sidecar.useExecutable('/tmp/not-retroarch.exe').found).toBe(false);
    expect(sidecar.status().error).toBe('not-found');

    const { home, executable } = fakeInstall();
    const remembered = new RetroArchSidecar(home);
    const status = remembered.useExecutable(executable);
    expect(status.found).toBe(true);
    expect(status.directory).toBe(path.dirname(executable));
    // The fake install has Flycast only, so Dreamcast is ready and NES is not.
    const dreamcast = status.cores.find(core => core.system === 'dreamcast');
    expect(dreamcast?.present).toBe(true);
    expect(dreamcast?.file).toBe('flycast_libretro.dll');
    expect(status.cores.find(core => core.system === 'nes')?.present).toBe(false);

    // A fresh sidecar on the same profile reads the remembered path back.
    const reopened = new RetroArchSidecar(home);
    expect(reopened.status().found).toBe(true);
  });

  it('runs on its own configuration instead of the user’s', async () => {
    const { home, executable } = fakeInstall();
    const install = path.dirname(executable);
    // The user's own file, complete with the netplay state a previous session
    // would have left in it.
    fs.writeFileSync(
      path.join(install, 'retroarch.cfg'),
      'video_driver = "gl"\nnetplay_nickname = "Stale"\nnetplay_public_announce = "true"\nconfig_save_on_exit = "true"\n',
    );
    const sidecar = new RetroArchSidecar(home);
    sidecar.useExecutable(executable);
    // The fake executable is an empty file, so the spawn fails; the session
    // configuration is still written before that, which is what this checks.
    await sidecar.start({
      role: 'join',
      system: 'dreamcast',
      address: '10.0.0.4:55535',
      rom: { bytes: new Uint8Array([1, 2, 3]), extension: 'cdi' },
    });
    const session = fs.readFileSync(path.join(home, 'retroarch.cfg'), 'utf8');
    expect(session).toContain('video_driver');
    expect(session).not.toContain('netplay_nickname');
    expect(session).toContain('config_save_on_exit = "false"');
    expect(session).toContain('netplay_public_announce = "false"');
    // Only a host maps a port through the router.
    expect(session).toContain('netplay_nat_traversal = "false"');
    // Saves and states belong to Kryvex's profile, not to the install.
    expect(session).toContain('savefile_directory');
    const user = fs.readFileSync(path.join(install, 'retroarch.cfg'), 'utf8');
    expect(user).toContain('netplay_nickname = "Stale"');
  });

  it('refuses a session it cannot run, and says why', async () => {
    const sidecar = new RetroArchSidecar(profile());
    const missing = await sidecar.start({ role: 'host', system: 'nes', rom: { bytes: new Uint8Array([1]) } });
    expect(missing.error).toBe('not-found');

    sidecar.useExecutable(fakeInstall().executable);
    const noCore = await sidecar.start({
      role: 'host',
      system: 'nes',
      rom: { bytes: new Uint8Array([1]), extension: 'nes' },
    });
    expect(noCore.error).toBe('no-core');
    expect(noCore.missing).toContain('fceumm_libretro.dll');

    const noRom = await sidecar.start({ role: 'host', system: 'dreamcast', rom: { bytes: new Uint8Array() } });
    expect(noRom.error).toBe('rom');

    const badAddress = await sidecar.start({
      role: 'join',
      system: 'dreamcast',
      address: 'not an address',
      rom: { bytes: new Uint8Array([1]), extension: 'cdi' },
    });
    expect(badAddress.error).toBe('address');
    // A refused start leaves nothing running.
    expect(sidecar.status().phase).toBe('idle');
    expect(sidecar.status().session).toBeNull();
  });

  it('re-derives whatever the renderer sent', () => {
    expect(normalizeRetroarchStart({ role: 'join', system: 'snes' })).toMatchObject({
      role: 'join',
      system: 'snes',
    });
    expect(normalizeRetroarchStart({ role: 'admin', system: 7 }).role).toBe('host');
    expect(normalizeRetroarchStart({ system: 7 }).system).toBe('');
    expect(normalizeRetroarchStart(null).rom?.bytes).toBeUndefined();
    const bytes = new Uint8Array([1, 2, 3]);
    expect(normalizeRetroarchStart({ rom: { bytes } }).rom?.bytes).toBe(bytes);
  });
});
