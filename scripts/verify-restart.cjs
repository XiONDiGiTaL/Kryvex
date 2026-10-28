/* eslint-disable no-console */
/**
 * End-to-end persistence check against the real Electron app.
 *
 * Launches the built app in an isolated profile, changes a theme, the start
 * view and a browser tab through the renderer, closes the window, relaunches,
 * and verifies the saved workspace comes back. A final pass changes a setting
 * and closes immediately to prove the debounced writer still flushes.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-restart.cjs`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-restart-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9333);
let child = null;

const fixture = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><title>Restart fixture</title><h1>Restart fixture</h1>');
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch(extra = []) {
  child = spawn(electron, ['.', `--remote-debugging-port=${port}`, ...extra], {
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
}

async function closeWindow(cdp) {
  await cdp.evaluate(`window.close(); true`).catch(() => undefined);
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  await stop();
}

function findState(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findState(full);
      if (nested) return nested;
    } else if (entry.name === 'kryvex-state.json') {
      return full;
    }
  }
  return null;
}

async function pickTheme(cdp, name) {
  await cdp.evaluate(`location.hash = '#/settings'; true`);
  await waitFor(cdp.evaluate, `Boolean(document.querySelector('.theme-grid'))`, 'settings view');
  const clicked = await cdp.evaluate(`(() => {
    const card = [...document.querySelectorAll('.theme-card')]
      .find(item => item.textContent.includes(${JSON.stringify(name)}));
    if (!card) return false;
    card.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`${name} theme card was not found.`);
}

fixture.listen(8123, '127.0.0.1');

(async () => {
  try {
    launch();
    let page = await target();
    let cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'first window');

    await pickTheme(cdp, 'Kryvex Light');
    await waitFor(
      cdp.evaluate,
      `document.documentElement.dataset.theme === 'kryvex-light'`,
      'light theme',
    );
    await cdp.evaluate(`(() => {
      const select = document.querySelector('select[aria-label="Start view"]');
      if (!select) return false;
      select.value = 'services';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    // The save is debounced, so a fixed pause is a race against the disk on a
    // slow runner: wait for the file that carries the choice rather than for a
    // duration, which is what the check actually needs.
    let stateFile = null;
    let pending = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      stateFile = findState(path.join(profile, 'Kryvex'));
      if (stateFile) {
        try {
          pending = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          if (pending.settings?.themeId === 'kryvex-light' && pending.settings?.startView === 'services') {
            break;
          }
        } catch {
          /* the write may be mid-flight */
        }
      }
      await sleep(200);
    }
    if (!stateFile || !pending) throw new Error('State file was not written.');
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    console.log(
      'state before restart:',
      JSON.stringify({ themeId: saved.settings.themeId, startView: saved.settings.startView }),
    );

    await cdp.evaluate(
      `location.hash = '#/browser?url=' + encodeURIComponent('http://127.0.0.1:8123/'); true`,
    );
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.tab'))`, 'browser tab');
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); if (!w) return false; try { return !w.isLoading() && w.getURL().startsWith('http://127.0.0.1:8123/'); } catch { return false; } })()`,
      'fixture page',
    );
    await sleep(700);
    const tab = await cdp.evaluate(
      `({ count: document.querySelectorAll('.tab').length, title: document.querySelector('.tab-title')?.textContent })`,
    );
    console.log('tab before restart:', JSON.stringify(tab));

    await closeWindow(cdp);

    launch();
    page = await target();
    cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'second window');
    const restored = await cdp.evaluate(`({
      theme: document.documentElement.dataset.theme,
      hash: location.hash,
    })`);
    console.log('state after restart:', JSON.stringify(restored));
    if (restored.theme !== 'kryvex-light') throw new Error('Theme did not survive restart.');
    if (!restored.hash.startsWith('#/services')) throw new Error('Start view did not survive restart.');

    // Change a setting and close immediately: the debounced writer must flush.
    await pickTheme(cdp, 'Kryvex Dark');
    await closeWindow(cdp);

    launch();
    page = await target();
    cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'third window');
    const fastClose = await cdp.evaluate(`document.documentElement.dataset.theme`);
    console.log('theme after immediate close:', fastClose);
    if (fastClose !== 'kryvex-dark') throw new Error('State was lost when the window closed quickly.');

    await cdp.evaluate(`location.hash = '#/browser'; true`);
    const tabs = await waitFor(
      cdp.evaluate,
      `(() => { const rows = [...document.querySelectorAll('.tab')]; return rows.length ? { count: rows.length, title: rows[0].querySelector('.tab-title')?.textContent } : null; })()`,
      'restored browser tab',
    );
    console.log('tab after restart:', JSON.stringify(tabs));
    if (tabs.count !== 1) throw new Error('Saved browser tab did not survive restart.');
    if (tabs.title !== 'Restart fixture') throw new Error('Saved tab title did not survive restart.');

    // A URL handed in by Windows must open alongside the restored tab, not
    // replace it. This is the installed-app default-browser path.
    await stop();
    launch(['http://127.0.0.1:8123/?handoff=1']);
    page = await target();
    cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'fourth window');
    const handoff = await waitFor(
      cdp.evaluate,
      `(() => { const rows = [...document.querySelectorAll('.tab')]; if (rows.length < 2) return null; const active = document.querySelector('.tab.is-active .tab-title')?.textContent; return { count: rows.length, active }; })()`,
      'handed-off URL tab',
    );
    console.log('handoff tabs:', JSON.stringify(handoff));
    if (handoff.count !== 2) throw new Error('Handed-off URL replaced the restored tab.');

    cdp.close();
    await stop();
    console.log('restart persistence harness: PASS');
  } catch (error) {
    console.error('restart persistence harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    fixture.close();
  }
})();
