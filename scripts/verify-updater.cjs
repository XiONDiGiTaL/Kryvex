/* eslint-disable no-console */
/**
 * End-to-end updater check against the real Electron app and a local feed.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-updater.cjs`.
 *
 * The harness impersonates a GitHub release feed on loopback, downloads a fake
 * installer, proves a bad checksum is rejected, proves a good checksum lands in
 * the updates folder, and confirms a source checkout never downloads.
 */
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-update-profile');
const port = Number(process.env.KRYVEX_UPDATE_TEST_PORT || 9444);
const cdpPort = Number(process.env.KRYVEX_UPDATE_CDP_PORT || 9445);
const assetName = 'Kryvex-Setup-9.9.9-x64.exe';
const assetBytes = crypto.randomBytes(256 * 1024);
const assetHash = crypto.createHash('sha256').update(assetBytes).digest('hex');
const badHash = '0'.repeat(64);
let feedMode = 'release';
let checksum = badHash;
let child = null;
let serverPort = port;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function payload() {
  return {
    tag_name: 'v9.9.9',
    name: 'Kryvex 9.9.9 test feed',
    body: 'A local release used by the updater harness.',
    published_at: new Date().toISOString(),
    html_url: 'https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v9.9.9',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: assetName,
        browser_download_url: `http://127.0.0.1:${serverPort}/${assetName}`,
        size: assetBytes.length,
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: `http://127.0.0.1:${serverPort}/SHA256SUMS.txt`,
        size: 120,
      },
    ],
  };
}

const fixture = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${serverPort}`);
  if (url.pathname === '/latest') {
    if (feedMode === 'missing') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"message":"Not Found"}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload()));
    return;
  }
  if (url.pathname === '/SHA256SUMS.txt') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end(`${checksum}  ${assetName}\n`);
    return;
  }
  if (url.pathname === `/${assetName}`) {
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': assetBytes.length,
    });
    response.end(assetBytes);
    return;
  }
  response.writeHead(404);
  response.end('missing');
});

function launch(extraEnv = {}) {
  child = spawn(electron, ['.', `--remote-debugging-port=${cdpPort}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
      KRYVEX_UPDATE_FEED: `http://127.0.0.1:${serverPort}`,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => process.stdout.write(`[app] ${data}`));
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function target() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(response =>
        response.json(),
      );
      const page = list.find(
        item => item.type === 'page' && item.webSocketDebuggerUrl && !item.url.startsWith('devtools'),
      );
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Electron DevTools endpoint did not appear.');
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
  const send = (method, params = {}) => {
    sequence += 1;
    const id = sequence;
    return new Promise((resolve, reject) => {
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
      throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed.');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
  child = null;
}

async function freshApp(extraEnv) {
  launch(extraEnv);
  const page = await target();
  const cdp = await connect(page.webSocketDebuggerUrl);
  await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'first window');
  await waitFor(cdp.evaluate, `Boolean(window.kryvex && window.kryvex.updateCheck)`, 'update bridge');
  return cdp;
}

async function main() {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
  const updatesDir = path.join(profile, 'Kryvex', 'updates');
  fs.mkdirSync(updatesDir, { recursive: true });
  fs.writeFileSync(path.join(updatesDir, 'Kryvex-Setup-1.0.0-x64.exe'), 'stale');

  await new Promise(resolve => fixture.listen(port, '127.0.0.1', resolve));
  const address = fixture.address();
  serverPort = typeof address === 'object' && address ? address.port : port;

  // Installed build: check, reject a bad checksum, accept a good one.
  let cdp = await freshApp({ KRYVEX_UPDATE_MODE: 'installed' });
  const initial = await waitFor(
    cdp.evaluate,
    `(async () => {
      const status = await window.kryvex.updateStatus();
      return status && status.phase !== 'checking' ? status : null;
    })()`,
    'an initial update state',
  );
  console.log('initial status:', JSON.stringify({ phase: initial.phase, mode: initial.mode }));

  let status;
  if (initial.phase !== 'available' || initial.mode !== 'installed') {
    status = await cdp.evaluate(`window.kryvex.updateCheck()`);
  } else {
    status = initial;
  }
  console.log(
    'check:',
    JSON.stringify({
      phase: status.phase,
      mode: status.mode,
      latest: status.latestVersion,
      asset: status.assetName,
      error: status.error,
    }),
  );
  if (status.phase !== 'available') throw new Error('Expected an available update.');
  if (status.mode !== 'installed') throw new Error('Expected installed update mode.');
  if (status.latestVersion !== '9.9.9') throw new Error('Wrong latest version.');
  if (status.assetName !== assetName) throw new Error('Wrong installer asset.');

  const rejected = await cdp.evaluate(`window.kryvex.updateDownload()`);
  console.log('bad checksum:', JSON.stringify({ phase: rejected.phase, error: rejected.error }));
  if (rejected.phase !== 'error' || rejected.error !== 'checksum-failed') {
    throw new Error('A bad checksum was not rejected.');
  }

  checksum = assetHash;
  const downloaded = await cdp.evaluate(`window.kryvex.updateDownload()`);
  console.log(
    'good checksum:',
    JSON.stringify({
      phase: downloaded.phase,
      progress: downloaded.progress,
      received: downloaded.receivedBytes,
    }),
  );
  if (downloaded.phase !== 'ready') throw new Error('A valid download did not become ready.');
  if (downloaded.progress !== 1) throw new Error('Download did not report completion.');

  const rechecked = await cdp.evaluate(`window.kryvex.updateCheck()`);
  if (rechecked.phase !== 'ready') {
    throw new Error('A routine check discarded the verified installer.');
  }

  await cdp.evaluate(`location.hash = '#/settings?section=updates'; true`);
  await waitFor(
    cdp.evaluate,
    `Boolean(document.querySelector('.updates-panel'))`,
    'the updates panel',
  );
  const readyUi = await waitFor(
    cdp.evaluate,
    `(() => {
      const panel = document.querySelector('.updates-panel');
      const actions = panel ? panel.querySelector('.update-actions')?.textContent || '' : '';
      const header = document.querySelector('.header-tool.is-update');
      if (!panel || !actions.includes('Install and restart')) return null;
      return {
        header: Boolean(header),
        title: panel.querySelector('.update-status strong')?.textContent,
        actions,
      };
    })()`,
    'the ready UI',
  );
  console.log('ready UI:', JSON.stringify(readyUi));

  const file = path.join(profile, 'Kryvex', 'updates', assetName);
  if (!fs.existsSync(file)) throw new Error('Downloaded installer is missing.');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest !== assetHash) throw new Error('Stored installer hash does not match.');
  if (fs.existsSync(path.join(updatesDir, 'Kryvex-Setup-1.0.0-x64.exe'))) {
    throw new Error('An old downloaded installer was not pruned.');
  }

  const installed = await cdp.evaluate(`window.kryvex.updateInstall()`);
  if (installed !== false) {
    throw new Error('The harness must not launch an installer from an unpackaged build.');
  }
  const revealed = await cdp.evaluate(`window.kryvex.updateReveal()`);
  if (revealed !== true) throw new Error('Reveal did not find the downloaded installer.');

  cdp.close();
  await stop();

  // Source checkout: report the release, never download over git.
  feedMode = 'release';
  checksum = assetHash;
  cdp = await freshApp({});
  const source = await cdp.evaluate(`window.kryvex.updateCheck()`);
  console.log(
    'source check:',
    JSON.stringify({
      phase: source.phase,
      mode: source.mode,
      asset: source.assetName,
      error: source.error,
    }),
  );
  if (source.phase !== 'available') throw new Error('Source check missed the release.');
  if (source.mode !== 'source') throw new Error('Source mode was not detected.');
  if (source.assetName) throw new Error('Source mode must not select a binary asset.');
  const unsupported = await cdp.evaluate(`window.kryvex.updateDownload()`);
  if (unsupported.error !== 'unsupported') {
    throw new Error('Source mode attempted a binary download.');
  }

  feedMode = 'missing';
  const missing = await cdp.evaluate(`window.kryvex.updateCheck()`);
  console.log('missing release:', JSON.stringify({ phase: missing.phase, error: missing.error }));
  if (missing.phase !== 'error' || missing.error !== 'no-release') {
    throw new Error('A missing release was not reported.');
  }

  cdp.close();
  await stop();
  console.log('updater harness: PASS');
}

main().catch(async error => {
  console.error('updater harness: FAIL', error.stack || error);
  await stop();
  process.exitCode = 1;
}).finally(() => {
  fixture.close();
});
