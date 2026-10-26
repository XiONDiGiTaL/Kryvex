/* eslint-disable no-console */
/**
 * End-to-end check that a service sign-in ends inside the service frame.
 *
 * The failure this covers: a service's sign-in opens a popup, the user finishes
 * the flow there, and the popup is left standing on the product page while the
 * module stays where it was. Two loopback origins stand in for Gmail and
 * Google's account host:
 *
 *   127.0.0.1  the service module (`/product`)
 *   127.0.0.2  the sign-in host  (`/account`, which returns to the module)
 *
 * The harness clicks the module's own sign-in button, then asserts that the
 * popup window is gone and that the module itself is showing the returned page.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-service-signin-fold.cjs`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-signin-fold-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9351);
const fixturePort = Number(process.env.KRYVEX_FIXTURE_PORT || 8149);
const origin = `http://127.0.0.1:${fixturePort}`;
const accountOrigin = `http://127.0.0.2:${fixturePort}`;
let child = null;

const PRODUCT = `<!doctype html>
<html><head><meta charset="utf-8"><title>Product</title></head>
<body>
<h1>signed out</h1>
<script>
  sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') || 0) + 1));
  window.__loads = Number(sessionStorage.getItem('loads'));
  window.__signIn = () =>
    Boolean(window.open(${JSON.stringify(`${accountOrigin}/account`)}, 'kx-signin'));
  window.__loadsSeen = window.__loads;
</script>
</body></html>`;

const SIGNED_IN = `<!doctype html>
<html><head><meta charset="utf-8"><title>Signed in</title></head>
<body><h1 id="state">Welcome back</h1></body></html>`;

const ACCOUNT = `<!doctype html>
<html><head><meta charset="utf-8"><title>Account</title></head>
<body>
<h1>account</h1>
<script>
  // The return leg a Google sign-in performs once the account step is done.
  setTimeout(() => { location.href = ${JSON.stringify(`${origin}/signed-in`)}; }, 600);
</script>
</body></html>`;

const fixture = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const send = (body) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(body);
  };
  if (url.pathname === '/account') return send(ACCOUNT);
  if (url.pathname === '/signed-in') return send(SIGNED_IN);
  return send(PRODUCT);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seedState() {
  const dir = path.join(profile, 'Kryvex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: [
        {
          id: 's-fold',
          name: 'Fixture',
          url: `${origin}/product`,
          category: 'communication',
          color: '#38BDF8',
          letter: 'F',
          pinned: true,
          createdAt: 1,
        },
      ],
      bookmarks: [],
      history: [],
      settings: { themeId: 'kryvex-dark' },
      recent: [],
      browser: { tabs: [], activeTabId: null },
    }),
  );
}

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
  child.stderr.on('data', (data) => process.stderr.write(`[app:err] ${data}`));
}

async function targets() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json(),
      );
      if (list.length > 0) return list;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Electron DevTools endpoint did not appear.');
}

async function target(predicate = (item) => item.type === 'page' && item.url.includes('index.html')) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const list = await targets().catch(() => []);
    const found = list.find(predicate) || list.find((item) => item.type === 'page');
    if (found) return found;
    await sleep(250);
  }
  throw new Error('No matching Electron target.');
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
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
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || 'Renderer evaluation failed.',
      );
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression).catch(() => null);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const guest = (expression) =>
  `(() => { const w = document.querySelector('.service-frame[data-service="s-fold"] webview'); if (!w) return null; return w.executeJavaScript(${JSON.stringify(
    expression,
  )}); })()`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

fixture.listen(fixturePort, '0.0.0.0');
seedState();

(async () => {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
    if (!ok) failures += 1;
  };

  try {
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');
    await cdp.evaluate(`location.hash = '#/service/s-fold'; true`);
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('.service-frame.is-active webview'); if (!w) return null; try { return !w.isLoading() && w.getURL().startsWith(${JSON.stringify(
        origin,
      )}); } catch { return null; } })()`,
      'service webview',
    );

    const before = await cdp.evaluate(
      guest(`({ url: location.href, title: document.title, text: document.body.innerText.trim() })`),
    );
    console.log('module before:', JSON.stringify(before));
    check('the module starts signed out', /signed out/.test(before.text), before.url);

    // The module's own sign-in button, exactly as Gmail's behaves.
    const opened = await cdp.evaluate(guest(`window.__signIn()`));
    check('the sign-in button opened a popup', opened === true);

    const popupTarget = await waitFor(
      async () => (await targets()).find((item) => item.url.includes('/account')) || null,
      (value) => value,
      'sign-in popup target',
      40,
    ).catch(() => null);
    check('the popup rendered on the sign-in host', Boolean(popupTarget), popupTarget?.url || 'none');

    const landed = await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('.service-frame[data-service="s-fold"] webview'); if (!w) return null; let url = ''; try { url = w.getURL(); } catch { return null; } if (!url.endsWith('/signed-in')) return null; return w.executeJavaScript('({ url: location.href, title: document.title, text: document.body.innerText.trim() })'); })()`,
      'the module showing the returned page',
      120,
    ).catch(() => null);
    const after =
      landed ||
      (await cdp.evaluate(
        guest(`({ url: location.href, title: document.title, text: document.body.innerText.trim() })`),
      ));
    console.log('module after:', JSON.stringify(after));
    check(
      'the module itself shows the page the sign-in returned to',
      after.url.endsWith('/signed-in') && /Welcome back/.test(after.text),
      `${after.url} · ${after.text.slice(0, 60)}`,
    );

    await sleep(1500);
    const leftover = (await targets()).filter((item) => item.url.includes('/account'));
    check(
      'no sign-in window is left standing',
      leftover.length === 0,
      leftover.map((item) => item.url).join(', ') || 'none',
    );

    await cdp.evaluate(`window.close(); true`).catch(() => undefined);
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
    check('every check passed', failures === 0, `${failures} failure(s)`);
    await stop();
    process.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    console.error('fold probe failed:', error && error.stack ? error.stack : error);
    await stop();
    process.exit(1);
  }
})();
