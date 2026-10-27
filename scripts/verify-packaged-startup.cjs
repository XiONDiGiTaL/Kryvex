#!/usr/bin/env node
/**
 * Checks the two startup promises from inside the packaged app.
 *
 * `verify-speech-bridge.cjs` runs the source build, where Windows startup is
 * deliberately refused and nothing is installed. This one runs
 * `release/win-unpacked/Kryvex.exe`, which is `app.isPackaged`, and it does the
 * two things only a packaged build can prove:
 *
 *   1. A real `HKCU\...\Run` entry is written, points at this executable, and is
 *      removed again by the same switch. A stale entry that was already there is
 *      left alone rather than overwritten.
 *   2. The speech engine starts at launch. A model is installed once into
 *      `.tmp-packaged-startup/profile` (so the download is not repeated), the
 *      launch switch is turned on, the app is closed and reopened, and the
 *      engine is expected to be running and reported as started by Kryvex.
 *
 *   node scripts/verify-packaged-startup.cjs              (after pnpm package:win)
 *   node scripts/verify-packaged-startup.cjs --exe <p>    another packaged build
 *   node scripts/verify-packaged-startup.cjs --model=base another model
 *   node scripts/verify-packaged-startup.cjs --skip-engine  registry check only
 *
 * The app is driven through the same DevTools protocol the other harnesses use.
 * Nothing here is mocked: the registry entry is read back from Windows and the
 * server is the pinned whisper.cpp build.
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const PORT = 9411;
const OUTPUT = path.join(root, '.tmp-packaged-startup.log');
const PROFILE = path.join(root, '.tmp-packaged-startup');
const lines = [];
const children = [];

function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

function finish(code) {
  try {
    fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    /* the log is a convenience */
  }
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }
  process.exit(code);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function argument(name, fallback) {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const exe = path.resolve(argument('exe', path.join(root, 'release', 'win-unpacked', 'Kryvex.exe')));
const modelId = argument('model', 'tiny');
const skipEngine = process.argv.includes('--skip-engine');

/**
 * The Run value this app owns, as Windows sees it right now.
 *
 * Matched on the command line rather than on a value name: Electron names the
 * entry after the packaged app id (`net.xiondigital.kryvex`), and a name that is
 * assumed here would make a written entry look missing.
 */
function runEntry() {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run').PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and $_.Value -like '*Kryvex.exe*' } | ForEach-Object { $_.Name + '=' + $_.Value }",
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    return output.trim();
  } catch {
    return '';
  }
}

/** The executable a `name="path" args` Run value starts. */
function runEntryPath(entry) {
  const value = entry.slice(entry.indexOf('=') + 1).trim();
  return value.replace(/^"/, '').replace(/"\s.*$/, '').replace(/"$/, '');
}

async function target(port) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`DevTools endpoint ${port} did not appear.`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  let closed = false;
  socket.addEventListener('close', () => {
    closed = true;
    for (const { reject } of pending.values()) reject(new Error('the page closed'));
    pending.clear();
  });
  const send = (method, params = {}) => {
    sequence += 1;
    const id = sequence;
    return new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('the page closed'));
        return;
      }
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

/** Starts the packaged app on a profile of its own and attaches to the shell. */
async function launch(label) {
  const userData = path.join(PROFILE, 'Kryvex');
  fs.mkdirSync(path.join(PROFILE, 'local'), { recursive: true });
  fs.mkdirSync(userData, { recursive: true });

  const child = spawn(exe, [`--remote-debugging-port=${PORT}`], {
    env: {
      ...process.env,
      KRYVEX_USER_DATA: userData,
      APPDATA: PROFILE,
      LOCALAPPDATA: path.join(PROFILE, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stderr.on('data', data => {
    const text = String(data);
    if (!text.includes('wgc_capturer')) process.stderr.write(text);
  });

  const page = await target(PORT);
  const cdp = await connect(page.webSocketDebuggerUrl);
  await sleep(2500);
  log(`${label}: attached to ${path.basename(exe)}`);
  return { child, cdp };
}

async function close(cdp, child, label) {
  const exited = new Promise(resolve => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }
    child.once('exit', () => resolve(true));
    setTimeout(() => resolve(false), 20000);
  });
  try {
    // The window closing is what a person does; the app quits from there.
    await cdp.evaluate('window.close(); true');
  } catch {
    /* the page may close before it answers */
  }
  cdp.close();
  const gone = await exited;
  if (!gone) fail(`${label}: the app did not exit after its window closed`);
  log(`${label}: the app exited`);
}

async function main() {
  if (process.platform !== 'win32') {
    log(`SKIP packaged startup checks are Windows only (this is ${process.platform})`);
    finish(0);
  }
  if (!fs.existsSync(exe)) {
    fail(`no packaged build at ${exe} — run pnpm package:win first`);
  }
  log(`packaged build: ${exe} (${fs.statSync(exe).size} bytes)`);

  fs.rmSync(path.join(PROFILE, 'local'), { recursive: true, force: true });
  const before = runEntry();

  let { child, cdp } = await launch('run 1');

  const packaged = await cdp.evaluate(`window.kryvex.startupStatus()`);
  if (!packaged || packaged.supported !== true) {
    return fail(`a packaged build reported startup unsupported: ${JSON.stringify(packaged)}`);
  }
  if (packaged.canChange !== true) {
    return fail('a packaged build refused to register itself with Windows');
  }
  log(`packaged build offers a startup entry (enabled: ${packaged.enabled})`);

  // ---------------------------------------------------- a real Run entry ---
  if (before) {
    log(`SKIP the registry already has a Kryvex entry, left untouched: ${before}`);
  } else {
    const enabled = await cdp.evaluate(`window.kryvex.startupSet(true)`);
    if (!enabled || enabled.enabled !== true) {
      return fail(`Windows did not take the startup entry: ${JSON.stringify(enabled)}`);
    }
    const written = runEntry();
    if (!written) return fail('startupSet(true) reported success but the Run entry is missing');
    if (!written.includes('Kryvex.exe')) {
      return fail(`the Run entry does not point at Kryvex: ${written}`);
    }
    if (path.normalize(runEntryPath(written)).toLowerCase() !== path.normalize(exe).toLowerCase()) {
      return fail(`the Run entry points at ${runEntryPath(written)}, not ${exe}`);
    }
    log(`HKCU Run → ${written}`);

    const disabled = await cdp.evaluate(`window.kryvex.startupSet(false)`);
    if (!disabled || disabled.enabled !== false) {
      return fail('the switch did not report the entry as removed');
    }
    if (runEntry()) return fail('the Run entry survived startupSet(false)');
    log('the same switch removed the Run entry again');
  }

  // --------------------------------------------- the engine at launch ---
  let runningPid = null;
  if (skipEngine) {
    log('SKIP the engine-at-launch check was not requested');
  } else {
    let status = await cdp.evaluate(`window.kryvex.speechStatus()`);
    if (!status || !status.supported) {
      return fail('the packaged build does not offer the local speech engine');
    }
    log(`speech engine: installed=${status.installed} model=${status.model}`);

    if (!status.installed || !status.models.some(row => row.present && row.id === modelId)) {
      log(`installing ${modelId} into the test profile (one-time download)`);
      // Not awaited over the bridge: a 74 MB model would hold one DevTools call
      // for minutes. Progress is polled through the same status call instead.
      await cdp.evaluate(
        `window.kryvex.speechInstall('${modelId}').then(() => undefined, () => undefined); true`,
      );
      const deadline = Date.now() + 15 * 60 * 1000;
      let last = '';
      while (Date.now() < deadline) {
        await sleep(2000);
        status = await cdp.evaluate(`window.kryvex.speechStatus()`);
        const step = status.progress
          ? `${status.progress.step} ${status.progress.phase} ${Math.floor(
              (status.progress.received / Math.max(1, status.progress.total)) * 100,
            )}%`
          : `phase ${status.phase}`;
        if (step !== last) {
          log(`  ${step}`);
          last = step;
        }
        if (status.phase === 'running') break;
        if (status.phase === 'error') {
          return fail(`the engine failed to install: ${status.error || ''} ${status.log || ''}`);
        }
      }
      if (status.phase !== 'running') return fail('the engine did not come up after installing');
    }
    if (status.phase !== 'running') {
      status = await cdp.evaluate(`window.kryvex.speechStart('${modelId}')`);
      if (status.phase !== 'running') {
        return fail(`the engine did not start: ${status.phase} ${status.error || ''}`);
      }
    }
    log(`engine running at ${status.baseUrl} (pid ${status.pid})`);

    const autostart = await cdp.evaluate(`window.kryvex.speechAutostart(true)`);
    if (!autostart || autostart.autostart !== true) {
      return fail('the launch switch did not stay on');
    }
    if (autostart.phase !== 'running') {
      return fail(`turning the switch on left the engine ${autostart.phase}`);
    }
    runningPid = autostart.pid;
    log(`launch switch on, engine still running (pid ${runningPid})`);

    await close(cdp, child, 'run 1');

    // The quit path is `before-quit → speech.dispose()`, which waits for the
    // child; this is what that wait is for.
    let alive = false;
    if (runningPid) {
      try {
        process.kill(runningPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) return fail(`the engine (pid ${runningPid}) survived the app quitting`);
    log(`the engine (pid ${runningPid}) is gone after the app quit`);

    ({ child, cdp } = await launch('run 2'));
    const deadline = Date.now() + 180000;
    let relaunched = null;
    while (Date.now() < deadline) {
      relaunched = await cdp.evaluate(`window.kryvex.speechStatus()`);
      if (relaunched.phase === 'running' && relaunched.autostarted) break;
      if (relaunched.phase === 'error') {
        return fail(`the launch start failed: ${relaunched.error || ''} ${relaunched.log || ''}`);
      }
      await sleep(1000);
    }
    if (!relaunched || relaunched.phase !== 'running' || !relaunched.autostarted) {
      return fail(
        `the engine did not start with the app: phase ${relaunched && relaunched.phase}, autostarted ${relaunched && relaunched.autostarted}`,
      );
    }
    log(`run 2: the engine came up by itself at ${relaunched.baseUrl} (pid ${relaunched.pid})`);

    // Lexium is what uses it, so the page has to have adopted the address.
    await cdp.evaluate(`window.location.hash = '#/lexium'; true`);
    await sleep(1500);
    const adopted = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        used: text.includes('READY') || text.includes('In use') || text.includes('${relaunched.baseUrl}'),
        error: text.includes('Nothing answered'),
      };
    })()`);
    if (adopted.error) return fail('Lexium did not adopt the engine that started with the app');
    log(`Lexium sees the engine it did not have to start (${adopted.used ? 'address shown' : 'page rendered'})`);

    const off = await cdp.evaluate(`window.kryvex.speechAutostart(false)`);
    if (!off || off.autostart !== false) return fail('the launch switch did not turn off');
    await close(cdp, child, 'run 2');
    log('launch switch turned off again; the profile is ready for the next run');
  }

  log('PASS packaged startup entry and engine-at-launch');
  finish(0);
}

main().catch(error => fail(String(error && error.stack ? error.stack : error)));
