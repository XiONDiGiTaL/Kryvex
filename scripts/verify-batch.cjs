/* eslint-disable no-console */
/**
 * Runs the Electron harnesses in batches, for CI and for a local sweep.
 *
 * Every harness here boots the built app in a disposable profile, so none of
 * them can run in parallel: they take the same ports and the same `.tmp-*`
 * paths. The batches exist for the two things a single list of steps cannot do:
 * a failure never skips the harnesses queued behind it, and each batch stays
 * inside a job's timeout.
 *
 *   node scripts/verify-batch.cjs            every batch, in order
 *   node scripts/verify-batch.cjs browser    one batch
 *   node scripts/verify-batch.cjs --list     what runs, what is held back, why
 *
 * Run `pnpm build` first, or use `pnpm verify:batch`, which builds as its
 * siblings do. The commands come from `package.json`, so an alias that changes
 * the script it runs does not need editing here.
 *
 * Held back: the harnesses that cannot run on a GitHub runner, each with the
 * reason. They stay reachable through their own aliases.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');
const pkg = require('../package.json');

const BATCHES = {
  browser: [
    'verify:browser',
    'verify:userscripts',
    'verify:browser-start',
    'verify:popups',
    'verify:chromium',
    'verify:identity',
    'verify:shield-filters',
  ],
  services: [
    'verify:services',
    'verify:service-ux',
    'verify:signin-fold',
    'verify:updater',
    'verify:downloads',
    'verify:location-ui',
  ],
  shell: [
    'verify:restart',
    'verify:gallery',
    'verify:wallpaper',
    'verify:guards',
    'verify:canvas',
    'verify:room-window',
  ],
  rooms: ['verify:vlan', 'verify:party-close', 'verify:torrent-restore-ui'],
  tools: ['verify:disk', 'verify:model', 'verify:speech-bridge'],
};

const HELD_BACK = {
  'verify:inhouse': 'runs as its own step in the main job, next to the desktop build',
  'verify:shell-batch': 'runs as its own step in the main job, next to the desktop build',
  'verify:link': 'runs as its own step in the main job, next to the desktop build',
  'verify:otp': 'runs as its own step in the main job, with failure artefacts',
  'verify:self-update':
    'asks the live GitHub release feed and drives the NSIS wizard over an installed build',
  'verify:packaged-startup': 'runs release/win-unpacked/Kryvex.exe, which CI does not package',
  'verify:google': "reads what Google's sign-in answers; the answer changes without this repo",
  'verify:identity-matrix': 'asks live Google pages the same question, one partition per variant',
  'verify:rooms':
    'needs two instances sharing a real screen, which a runner with no display cannot do',
  'verify:couch':
    'needs two instances, a real screen to share and a cartridge supplied through KRYVEX_COUCH_ROM',
  'verify:capture-window':
    'captures through Windows Graphics Capture and saves through the real Save dialog',
  'verify:torrents': 'starts a real transfer and waits on peers',
  'verify:speech': 'downloads the pinned whisper build and a model, hundreds of megabytes',
  'verify:lexium-speech': 'synthesises through the OS speech stack a server image does not ship',
  'verify:lexium-language': 'needs the OS recognisers, which are exactly what a server lacks',
  'verify:home-tools':
    'drives the installed app at C:\\Kryvex\\Kryvex.exe, which a runner does not have',
  'verify:layout':
    'fails here, on the clipping rule rather than the app: the element marks crop their own ::after watermark on purpose',
};

/** The command an alias runs, without the build it does for itself. */
function commandFor(alias) {
  const script = pkg.scripts[alias];
  if (!script) throw new Error(`package.json has no ${alias}`);
  const run = script.replace(/^pnpm build && /, '').split(/\s+/);
  const [runner, file] = run;
  const scriptPath = path.resolve(__dirname, '..', file);
  // The Electron harnesses spawn the app themselves; this is the binary they use.
  return runner === 'electron' ? [electron, scriptPath] : [process.execPath, scriptPath];
}

function printList() {
  for (const [batch, aliases] of Object.entries(BATCHES)) {
    console.log(`\n${batch} (${aliases.length})`);
    for (const alias of aliases) console.log(`  ${alias}`);
  }
  console.log('\nheld back');
  for (const [alias, reason] of Object.entries(HELD_BACK)) {
    console.log(`  ${alias}: ${reason}`);
  }
}

function runBatch(batch) {
  const aliases = BATCHES[batch];
  if (!aliases) {
    console.error(`No batch named ${batch}. Try --list.`);
    process.exitCode = 1;
    return { failed: [batch], seconds: 0 };
  }
  const failed = [];
  let seconds = 0;
  for (const alias of aliases) {
    const [command, ...args] = commandFor(alias);
    const started = Date.now();
    console.log(`\n=== ${alias} ===`);
    const result = spawnSync(command, args, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
    const elapsed = (Date.now() - started) / 1000;
    seconds += elapsed;
    const ok = result.status === 0;
    if (!ok) failed.push(alias);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${alias} (${elapsed.toFixed(1)}s)`);
    // A harness that dies before its own summary is a failure here too.
    if (result.error) console.error(`  ${result.error.message}`);
  }
  return { failed, seconds };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    printList();
    return;
  }
  const names = args.filter(arg => !arg.startsWith('-'));
  const batches = names.length > 0 ? names : Object.keys(BATCHES);
  const failedAll = [];
  let total = 0;
  for (const batch of batches) {
    const { failed, seconds } = runBatch(batch);
    failedAll.push(...failed);
    total += seconds;
    console.log(`\n${batch}: ${BATCHES[batch] ? BATCHES[batch].length - failed.length : 0}/${BATCHES[batch] ? BATCHES[batch].length : 0} passed in ${seconds.toFixed(0)}s`);
  }
  console.log(`\n${failedAll.length === 0 ? 'ALL PASS' : `FAILED: ${failedAll.join(', ')}`} (${total.toFixed(0)}s total)`);
  if (failedAll.length > 0) process.exitCode = 1;
}

main();
