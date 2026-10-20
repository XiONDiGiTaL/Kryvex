/* eslint-disable no-console */
/**
 * End-to-end check for the download-location setting.
 *
 * Seeds an isolated profile with a non-default folder, launches the built app,
 * checks the Settings row and resets it to the real Downloads folder. The
 * native folder picker is not automated; the main-process picker is covered by
 * the download history harness through the same setDownloadLocation path.
 *
 * Run `pnpm build` first, or use `pnpm verify:location-ui`.
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const port = Number(process.env.KRYVEX_CDP_PORT || 9445);
const profile = path.join(os.tmpdir(), `kryvex-location-ui-${Date.now()}`);
const userData = path.join(profile, 'Kryvex');
const customDir = path.join(profile, 'Custom Downloads');

function downloadsDir() {
  if (process.platform === 'win32') {
    try {
      const value = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path",
        ],
        { encoding: 'utf8', timeout: 5000 },
      ).trim();
      if (value) return value;
    } catch {
      /* fall back to the conventional location */
    }
  }
  return path.join(os.homedir(), 'Downloads');
}

const defaultDir = path.resolve(downloadsDir());
fs.mkdirSync(customDir, { recursive: true });
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(
  path.join(userData, 'kryvex-storage.json'),
  JSON.stringify({
    version: 1,
    downloadDir: customDir,
    downloadRoots: [customDir],
    torrentRoots: [path.join(customDir, 'Kryvex Torrents')],
  }),
);

const packagedApp = process.env.KRYVEX_APP ? path.resolve(process.env.KRYVEX_APP) : null;
const command = packagedApp ?? electron;
const commandArgs = packagedApp
  ? [`--remote-debugging-port=${port}`]
  : ['.', `--remote-debugging-port=${port}`];
const child = spawn(command, commandArgs, {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    KRYVEX_USER_DATA: userData,
    APPDATA: profile,
    LOCALAPPDATA: path.join(profile, 'local'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function target() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
        response.json(),
      );
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('DevTools endpoint did not appear.');
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
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => {
    const requestId = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  };
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function samePath(left, right) {
  const normalize = value => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

(async () => {
  try {
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'window');
    await cdp.evaluate(`location.hash = '#/settings'; true`);
    const row = await waitFor(
      cdp.evaluate,
      `(() => {
        const code = document.querySelector('.download-location-path');
        if (!code || code.textContent.includes('Reading location')) return null;
        const container = code.closest('.setting-row');
        return {
          path: code.textContent.trim(),
          text: container ? container.innerText : '',
          buttons: container
            ? [...container.querySelectorAll('button')].map(button => button.textContent.trim())
            : [],
        };
      })()`,
      'download location row',
    );
    if (!row.text.includes('Download location')) throw new Error('Location label is missing.');
    if (!samePath(row.path, customDir)) throw new Error(`Location row shows ${row.path}.`);
    if (!row.buttons.includes('Change folder')) throw new Error('Change folder action is missing.');
    if (!row.buttons.includes('Use the Downloads folder')) {
      throw new Error('Reset action is missing.');
    }

    await cdp.evaluate(
      `(() => {
        const code = document.querySelector('.download-location-path');
        const container = code && code.closest('.setting-row');
        const reset = container
          ? [...container.querySelectorAll('button')].find(
              button => button.textContent.trim() === 'Use the Downloads folder',
            )
          : null;
        reset?.click();
        return Boolean(reset);
      })()`,
    );
    const resetPath = await waitFor(
      cdp.evaluate,
      `(() => {
        const code = document.querySelector('.download-location-path');
        const value = code ? code.textContent.trim() : '';
        return value && value !== ${JSON.stringify(customDir)} ? value : '';
      })()`,
      'reset location',
    );
    if (!samePath(resetPath, defaultDir)) {
      throw new Error(`Reset location is ${resetPath}, expected ${defaultDir}.`);
    }
    const bridgePath = await cdp.evaluate(`window.kryvex.downloadsLocation()`);
    if (!bridgePath || !samePath(bridgePath.path, defaultDir)) {
      throw new Error('The bridge did not report the reset location.');
    }

    cdp.close();
    console.log('download location UI harness: PASS');
    console.log(JSON.stringify({ customDir, resetPath, bridgePath: bridgePath.path }));
  } catch (error) {
    console.error('download location UI harness: FAIL', error.stack || error);
    process.exitCode = 1;
  } finally {
    child.kill();
    await sleep(500);
    if (child.exitCode === null) child.kill('SIGKILL');
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* the OS will clear its temp directory later */
    }
  }
})();
