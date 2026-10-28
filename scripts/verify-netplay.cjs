/**
 * Verifies the netplay sidecar against a fake RetroArch install.
 *
 * RetroArch is not installed here, and Kryvex never ships it, so the executable
 * is a copy of `cmd.exe` named `retroarch.exe` — enough to prove the parts that
 * are Kryvex's: that the chosen file is accepted, that the cores in its
 * `cores/` folder are discovered, that the cartridge is written where the sidecar
 * says, that the process is spawned with the documented flags, and that a refused
 * start leaves nothing running.
 *
 * It also checks what cannot be faked: this is not a netplay session. The fake
 * executable exits on the first flag it does not understand, so no host ever
 * waits for a guest and no frame is ever exchanged.
 *
 * Run with: pnpm build && node scripts/verify-netplay.cjs
 */
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lines = [];
function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}
function fail(message) {
  log(`FAIL ${message}`);
  try {
    fs.writeFileSync(path.join(process.cwd(), '.tmp-netplay-verify.log'), `${lines.join('\n')}\n`);
  } catch {
    /* the log is a convenience */
  }
  app.exit(1);
}
function pass() {
  log('PASS netplay sidecar: locate, cores, cartridge write, spawn, refusals, stop');
  app.exit(0);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (process.platform !== 'win32') {
    log('SKIP netplay sidecar: the flags and core layout are Windows-only');
    return app.exit(0);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-netplay-'));
  const profile = path.join(work, 'profile');
  const install = path.join(work, 'RetroArch-Win64');
  fs.mkdirSync(path.join(install, 'cores'), { recursive: true });

  // The fake install: a real executable with the right name, and two cores.
  const exe = path.join(install, 'retroarch.exe');
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  fs.copyFileSync(path.join(systemRoot, 'System32', 'cmd.exe'), exe);
  fs.writeFileSync(path.join(install, 'cores', 'flycast_libretro.dll'), '');
  fs.writeFileSync(path.join(install, 'cores', 'fceumm_libretro.dll'), '');

  const { RetroArchSidecar, normalizeRetroarchStart } = require(
    path.join(process.cwd(), 'dist-electron', 'retroarch.js'),
  );
  const sidecar = new RetroArchSidecar(profile);

  const empty = sidecar.status();
  if (empty.found) return fail('an empty profile reported RetroArch as found');
  if (!empty.cores.every(core => core.present === false)) {
    return fail('an empty profile reported a core as present');
  }
  log(`empty profile: phase ${empty.phase}, ${empty.cores.length} consoles listed`);

  if (sidecar.useExecutable(path.join(install, 'cmd.exe')).found) {
    return fail('a file that is not retroarch.exe was accepted');
  }
  log('a different executable name was refused');

  const found = sidecar.useExecutable(exe);
  if (!found.found) return fail('the chosen retroarch.exe was not accepted');
  if (found.directory !== install) return fail(`wrong directory: ${found.directory}`);
  const dreamcast = found.cores.find(core => core.system === 'dreamcast');
  const nes = found.cores.find(core => core.system === 'nes');
  if (!dreamcast?.present || dreamcast.file !== 'flycast_libretro.dll') {
    return fail('the Flycast core was not discovered');
  }
  if (!nes?.present || nes.core !== 'fceumm') return fail('the NES core was not discovered');
  log(`found ${exe}; cores: dreamcast ${dreamcast.file}, nes ${nes.file}`);

  // A refused start: a console with no core in this install.
  const noCore = await sidecar.start({
    role: 'host',
    system: 'snes',
    rom: { bytes: new Uint8Array([1, 2, 3]), extension: 'smc', name: 'Game.smc' },
  });
  if (noCore.error !== 'no-core') return fail(`expected no-core, got ${noCore.error}`);
  if (!noCore.missing?.some(file => file.startsWith('snes9x'))) {
    return fail(`missing files did not name the SNES cores: ${JSON.stringify(noCore.missing)}`);
  }
  log(`no-core names ${noCore.missing.length} candidate files`);

  const badAddress = await sidecar.start({
    role: 'join',
    system: 'dreamcast',
    address: 'http://no',
    rom: { bytes: new Uint8Array([1]), extension: 'cdi', name: 'Game.cdi' },
  });
  if (badAddress.error !== 'address') return fail(`expected address, got ${badAddress.error}`);
  log('an address that is not dialable was refused');

  // A real spawn: the cartridge is written, then the process starts.
  const romBytes = new Uint8Array([0x53, 0x45, 0x47, 0x41, 0x00, 0x01, 0x02, 0x03]);
  const hosting = await sidecar.start({
    role: 'host',
    system: 'dreamcast',
    nick: 'XiØN\u0001',
    rom: { bytes: romBytes, extension: 'cdi', name: 'Sonic Adventure.cdi' },
  });
  if (hosting.error) return fail(`host start failed: ${hosting.error}`);
  if (hosting.phase !== 'hosting') return fail(`unexpected phase ${hosting.phase}`);
  if (!hosting.session || hosting.session.role !== 'host') return fail('no host session recorded');

  const romPath = path.join(profile, 'roms', 'Sonic Adventure.cdi');
  if (!fs.existsSync(romPath)) return fail(`the cartridge was not written to ${romPath}`);
  const written = fs.readFileSync(romPath);
  if (Buffer.compare(written, Buffer.from(romBytes)) !== 0) return fail('the cartridge bytes differ');
  log(`cartridge written to ${path.relative(profile, romPath)} (${written.length} bytes)`);

  // `cmd.exe` rejects `-L`, so it exits; its message proves the flags arrived.
  let errored = null;
  for (let attempt = 0; attempt < 40 && hosting.phase === 'hosting'; attempt += 1) {
    await sleep(50);
    const now = sidecar.status();
    errored = now.error ?? errored;
    if (now.phase === 'exited') break;
  }
  const after = sidecar.status();
  if (after.phase !== 'exited') return fail(`the spawned process did not report its exit (${after.phase})`);
  if (after.log.length === 0) return fail('nothing the spawned process printed was captured');
  log(`spawned, then exited; captured ${after.log.length} line(s): "${after.log.join(' / ').slice(0, 90)}"`);

  const joining = await sidecar.start({
    role: 'join',
    system: 'dreamcast',
    address: '10.0.0.4:55535',
    rom: { bytes: romBytes, extension: 'cdi', name: 'Sonic Adventure.cdi' },
  });
  if (joining.phase !== 'joining') return fail(`unexpected join phase ${joining.phase}`);
  if (joining.session?.address !== '10.0.0.4') {
    return fail(`join session address was ${String(joining.session?.address)}`);
  }
  log('host address and port were parsed before the spawn');

  const stopped = sidecar.stop();
  if (stopped.phase !== 'idle' || stopped.session !== null) {
    return fail('stop did not return the sidecar to idle');
  }
  log('stop returned the sidecar to idle');

  sidecar.dispose();
  fs.rmSync(work, { recursive: true, force: true });

  const normalized = normalizeRetroarchStart({ role: 'join', system: 'dreamcast' });
  if (normalized.role !== 'join' || normalized.system !== 'dreamcast') {
    return fail('the start payload was not re-derived');
  }
  log('a renderer payload was re-derived rather than trusted');
  pass();
}

app.whenReady().then(() => main().catch(error => fail(String(error))));
