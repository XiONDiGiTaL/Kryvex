/* eslint-disable no-console */
/**
 * End-to-end check for the restored torrent queue.
 *
 * Seeds an isolated profile with a saved magnet row whose path is inside the
 * real Downloads torrent root, launches the built app, opens the Downloads hub
 * and verifies the row renders as paused with a Resume action. No transfer is
 * started. Run `pnpm build` first, or use `pnpm verify:torrent-restore-ui`.
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const port = Number(process.env.KRYVEX_CDP_PORT || 9444);
const profile = path.join(os.tmpdir(), `kryvex-torrent-ui-${Date.now()}`);
const userData = path.join(profile, 'Kryvex');
const hash = '0123456789abcdef0123456789abcdef01234567';
const id = 'tr-11111111-2222-3333-4444-555555555555';

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

const savePath = path.join(downloadsDir(), 'Kryvex Torrents', 'Restored UI Test-01234567');
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(
  path.join(userData, 'kryvex-torrents.json'),
  JSON.stringify([
    {
      id,
      name: 'Restored Paused Test',
      infoHash: hash,
      magnetURI: `magnet:?xt=urn:btih:${hash}&dn=Restored%20Paused%20Test`,
      source: 'magnet',
      savePath,
      state: 'downloading',
      length: 1000,
      downloaded: 400,
      uploaded: 0,
      downloadSpeed: 1200,
      uploadSpeed: 0,
      ratio: 0,
      progress: 0.4,
      timeRemaining: 1000,
      peers: 3,
      seeders: 1,
      leechers: 2,
      protocols: ['TCP', 'DHT'],
      trackers: [],
      files: [
        { name: 'restored.bin', path: 'restored.bin', length: 1000, downloaded: 400, progress: 0.4 },
      ],
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 500,
    },
  ]),
);

const packagedApp = process.env.KRYVEX_APP ? path.resolve(process.env.KRYVEX_APP) : null;
const child = spawn(packagedApp ?? electron, packagedApp ? [`--remote-debugging-port=${port}`] : ['.', `--remote-debugging-port=${port}`], {
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

(async () => {
  try {
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'window');
    await cdp.evaluate(`location.hash = '#/browser?newtab=1&panel=downloads'; true`);
    const row = await waitFor(
      cdp.evaluate,
      `(() => {
        const item = document.querySelector('.torrent-item');
        if (!item) return null;
        const buttons = [...item.querySelectorAll('button')].map(button => button.textContent.trim());
        return { text: item.innerText, buttons };
      })()`,
      'restored torrent row',
    );
    if (!row.text.includes('Restored Paused Test')) throw new Error('Restored name is missing.');
    if (!row.text.includes('Paused')) throw new Error('Restored row is not paused.');
    if (!row.buttons.includes('Resume')) throw new Error('Restored row has no Resume action.');
    if (row.text.includes('Downloading')) throw new Error('Restored row still looks active.');
    cdp.close();
    console.log('torrent restore UI harness: PASS');
    console.log(JSON.stringify({ name: 'Restored Paused Test', savePath, buttons: row.buttons }));
  } catch (error) {
    console.error('torrent restore UI harness: FAIL', error.stack || error);
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
