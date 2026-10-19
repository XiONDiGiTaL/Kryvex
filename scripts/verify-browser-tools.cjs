/* eslint-disable no-console */
/**
 * Find-in-page and page-zoom check against the real Electron browser.
 *
 * Serves a local page with three matches, drives the toolbar buttons and the
 * find bar through the renderer, and reads the match counter and the live
 * <webview> zoom factor. Run `pnpm build` first.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-browser-tools-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9341);
let child = null;

const server = http.createServer((request, response) => {
  const body =
    request.url === '/find'
      ? 'alpha<br>alpha<br>alpha'
      : '<h1>Zoom fixture</h1><p>Kryvex zoom check</p>';
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><title>Browser tools fixture</title><body>${body}</body>`);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch() {
  child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Failed.');
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
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
}

server.listen(8124, '127.0.0.1');

(async () => {
  try {
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');

    await cdp.evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('http://127.0.0.1:8124/find'); true`,
    );
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); if (!w) return false; try { return !w.isLoading() && w.getURL().includes('/find'); } catch { return false; } })()`,
      'find fixture',
    );

    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('button[aria-label="Find in page"]'))`,
      'find button',
    );
    await sleep(1500);
    await cdp.evaluate(`document.querySelector('button[aria-label="Find in page"]').click(); true`);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.find-bar input'))`, 'find bar');
    await cdp.evaluate(`document.querySelector('.find-bar input').focus(); true`);
    await cdp.send('Input.insertText', { text: 'alpha' });
    const count = await waitFor(
      cdp.evaluate,
      `(() => { const text = document.querySelector('.find-count')?.textContent ?? ''; return text.includes('1 of 3') ? text : null; })()`,
      'find matches',
    );
    console.log('find count:', count);

    await cdp.evaluate(`document.querySelector('button[aria-label="Zoom in"]').click(); true`);
    const zoomLabel = await waitFor(
      cdp.evaluate,
      `(() => { const value = document.querySelector('.zoom-value')?.textContent?.trim() ?? ''; return value === '110%' ? value : null; })()`,
      'zoom label',
    );
    const factor = await cdp.evaluate(`document.querySelector('webview').getZoomFactor()`);
    console.log('zoom:', zoomLabel, 'webview factor:', factor);
    if (Math.abs(factor - 1.1) > 0.01) throw new Error('Page zoom was not applied.');

    await cdp.evaluate(`document.querySelector('button[aria-label="Reset zoom"]').click(); true`);
    const reset = await waitFor(
      cdp.evaluate,
      `(() => { const current = document.querySelector('webview').getZoomFactor(); return Math.abs(current - 1) < 0.01 ? document.querySelector('.zoom-value').textContent?.trim() : null; })()`,
      'zoom reset',
    );
    console.log('zoom reset:', reset);

    await cdp.evaluate(`document.querySelector('button[aria-label="Close find"]').click(); true`);
    const closed = await waitFor(
      cdp.evaluate,
      `!document.querySelector('.find-bar')`,
      'find bar closed',
    );
    if (!closed) throw new Error('Find bar did not close.');

    cdp.close();
    await stop();
    console.log('browser tools harness: PASS');
  } catch (error) {
    console.error('browser tools harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
