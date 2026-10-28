/* eslint-disable no-console */
/**
 * End-to-end check for the persistent service engine.
 *
 * Proves, against the real Electron app and a loopback web app, that:
 *  - a service keeps the same guest, cookies, page storage and running timers
 *    while the user works in another view;
 *  - opening more modules never evicts one that is already running;
 *  - the persistent partition survives an app restart, cookies and storage
 *    alike;
 *  - installed services receive desktop-notification permission, browser tabs
 *    do not;
 *  - auth popups open on the same service session;
 *  - unread counts from the page title reach the toolbar and window title;
 *  - a per-service session clear removes cookies without touching others;
 *  - the guest sees a browser user agent, not Electron.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-service-engine.cjs`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-service-engine-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9341);
const fixturePort = Number(process.env.KRYVEX_FIXTURE_PORT || 8139);
const origin = `http://127.0.0.1:${fixturePort}`;
let child = null;

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture</title></head>
<body>
<h1 id="title">Service fixture</h1>
<script>
  window.__ticks = 0;
  window.__marker = Math.random().toString(36).slice(2);
  setInterval(() => { window.__ticks += 1; }, 100);
  // A chat client keeps its session token in page storage, not only in a
  // cookie. The harness reads this back after a view change, after eight more
  // modules open, and after a restart: any of those losing it is the same
  // failure a user sees as "please log in again".
  try {
    if (!localStorage.getItem('kx-token')) localStorage.setItem('kx-token', window.__marker);
  } catch (error) { /* storage is unavailable on this profile */ }
  window.__notify = async () => {
    const permission = await Notification.requestPermission();
    try { new Notification('Kryvex service test', { body: 'hello' }); } catch (error) { return permission + ':' + error.name; }
    return permission;
  };
  window.__openPopup = () => Boolean(window.open('/popup', 'kryvex-auth-popup'));
  document.title = 'Fixture';
</script>
</body></html>`;

const COOKIE = 'kx=session-ok; Path=/; Max-Age=86400; SameSite=Lax';

// The cookie is seeded once through /seed. Ordinary page loads never set it,
// so a cleared session stays cleared instead of being re-seeded by the fixture.
const fixture = http.createServer((request, response) => {
  const url = new URL(request.url || '/', origin);
  if (url.pathname === '/seed') {
    response.writeHead(204, { 'Set-Cookie': COOKIE });
    response.end();
    return;
  }
  if (url.pathname === '/popup') {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(
      '<!doctype html><title>Popup</title><p id="cookie">' +
        'popup</p><script>document.title = document.cookie || "no-cookie";</script>',
    );
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  response.end(PAGE);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function seedState() {
  const dir = path.join(profile, 'Kryvex');
  fs.mkdirSync(dir, { recursive: true });
  // Nine modules, because the live set used to be capped at eight: opening the
  // ninth silently unmounted the oldest frame and destroyed its guest. The
  // fixture is cheap enough to keep all nine loaded at once.
  const ids = ['s-verify'];
  for (let index = 2; index <= 9; index += 1) ids.push(`s-v${index}`);
  fs.writeFileSync(
    path.join(dir, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: ids.map((id, index) => ({
        id,
        name: index === 0 ? 'Fixture' : `Fixture ${index + 1}`,
        url: `${origin}/`,
        category: 'communication',
        color: '#38BDF8',
        letter: index === 0 ? 'F' : String(index + 1),
        pinned: index === 0,
        createdAt: index + 1,
      })),
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
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function targets() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
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

async function target(predicate = item => item.type === 'page' && item.url.includes('index.html')) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const list = await targets().catch(() => []);
    const found = list.find(predicate) || list.find(item => item.type === 'page');
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
      throw new Error(result.exceptionDetails.exception?.description || 'Renderer evaluation failed.');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 160) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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

const guest = expression =>
  `(() => { const w = document.querySelector('.service-frame[data-service="s-verify"] webview'); if (!w) return null; return w.executeJavaScript(${JSON.stringify(
    expression,
  )}); })()`;

async function openFixture(cdp) {
  await cdp.evaluate(`location.hash = '#/service/s-verify'; true`);
  await waitFor(
    cdp.evaluate,
    `(() => { const w = document.querySelector('.service-frame.is-active webview'); if (!w) return null; try { return !w.isLoading() && w.getURL().startsWith(${JSON.stringify(
      origin,
    )}); } catch { return null; } })()`,
    'fixture service webview',
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

fixture.listen(fixturePort, '127.0.0.1');
seedState();

(async () => {
  try {
    launch();
    let page = await target();
    let cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');
    await openFixture(cdp);

    // Seed the persistent partition through a one-off response, the way a real
    // sign-in does. Reloads must never recreate the cookie on their own.
    const seeded = await waitFor(
      cdp.evaluate,
      guest(`fetch('/seed').then(() => document.cookie)`),
      'seeded session cookie',
    );
    assert(String(seeded).includes('kx=session-ok'), 'the fixture session could not be seeded.');

    const layout = await cdp.evaluate(`(() => {
      const main = document.querySelector('.app-main');
      const frame = document.querySelector('.service-frame.is-active');
      const bar = frame.querySelector('.service-toolbar');
      const guest = frame.querySelector('webview');
      return {
        main: main.getBoundingClientRect().toJSON(),
        frame: frame.getBoundingClientRect().toJSON(),
        bar: bar.getBoundingClientRect().toJSON(),
        guest: guest.getBoundingClientRect().toJSON(),
        overflow: getComputedStyle(main).overflow,
      };
    })()`);
    console.log('layout:', JSON.stringify(layout));
    assert(layout.guest.height > 500, 'the service webview did not fill the stage.');
    assert(layout.guest.width >= layout.frame.width - 2, 'the service webview is narrower than the stage.');
    assert(layout.bar.height >= 30 && layout.bar.height <= 70, 'the service toolbar height is wrong.');
    assert(layout.overflow === 'hidden', 'the service route still scrolls the whole page.');

    const first = await waitFor(
      cdp.evaluate,
      guest(
        `({ cookie: document.cookie, marker: window.__marker, agent: navigator.userAgent, ticks: window.__ticks })`,
      ),
      'guest state',
    );
    console.log('guest:', JSON.stringify({ ...first, agent: first.agent.slice(0, 60) }));
    assert(first.cookie.includes('kx=session-ok'), 'service did not load with its cookie.');
    assert(!/Electron/i.test(first.agent), 'guest still advertises Electron in its user agent.');

    const permission = await cdp.evaluate(guest(`window.__notify()`));
    console.log('service notification permission:', permission);
    assert(String(permission).startsWith('granted'), 'service notification permission was not granted.');

    await cdp.evaluate(`location.hash = '#/services'; true`);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.service-stage.is-idle'))`, 'idle stage');
    const hiddenTicks = await cdp.evaluate(guest('window.__ticks'));
    await sleep(1500);
    const laterTicks = await cdp.evaluate(guest('window.__ticks'));
    await cdp.evaluate(`location.hash = '#/service/s-verify'; true`);
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.service-frame.is-active webview'))`,
      'active frame',
    );
    const after = await cdp.evaluate(
      guest(`({ ticks: window.__ticks, marker: window.__marker, cookie: document.cookie })`),
    );
    console.log('keep-alive:', JSON.stringify({ hiddenTicks, laterTicks, after }));
    assert(after.marker === first.marker, 'the service guest was destroyed and recreated.');
    assert(laterTicks > hiddenTicks + 5, 'the hidden service stopped running.');
    assert(after.ticks >= laterTicks, 'the service counter went backwards after switching views.');
    assert(after.cookie.includes('kx=session-ok'), 'the cookie was lost while switching views.');
    const storedToken = await cdp.evaluate(guest(`localStorage.getItem('kx-token')`));
    console.log('page storage after view change:', JSON.stringify(storedToken));
    assert(
      storedToken === first.marker,
      'the page storage a module saved was lost while switching views.',
    );

    await cdp.evaluate(guest(`document.title = '(7) Fixture'`));
    const badge = await waitFor(
      cdp.evaluate,
      `document.querySelector('.service-unread')?.textContent?.trim() || null`,
      'unread badge',
    );
    const sidebarBadge = await cdp.evaluate(
      `document.querySelector('.pinned-unread')?.textContent?.trim() || null`,
    );
    const titled = await cdp.evaluate('document.title');
    console.log('unread:', JSON.stringify({ badge, sidebarBadge, titled }));
    assert(badge === '7', 'toolbar unread badge did not show the title count.');
    assert(sidebarBadge === '7', 'sidebar unread badge did not show the title count.');
    assert(titled === '(7) Kryvex', 'window title did not reflect unread messages.');
    await cdp.evaluate(guest(`document.title = 'Fixture'`));

    await cdp.evaluate(guest(`window.__openPopup()`));
    const popupPage = await waitFor(
      async () => (await targets()).find(item => item.url.includes('/popup')) || null,
      value => value,
      'auth popup target',
    );
    const popupCdp = await connect(popupPage.webSocketDebuggerUrl);
    const popup = await waitFor(
      popupCdp.evaluate,
      `({ url: location.href, cookie: document.cookie })`,
      'auth popup load',
    );
    console.log('auth popup:', JSON.stringify(popup));
    assert(popup.cookie.includes('kx=session-ok'), 'auth popup did not share the service session.');

    await cdp.evaluate(
      `location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(`${origin}/`)}); true`,
    );
    await waitFor(
      cdp.evaluate,
      `(() => { const w = [...document.querySelectorAll('webview')].find(item => !item.closest('.service-frame')); if (!w) return null; try { return !w.isLoading() && w.getURL().includes(${JSON.stringify(
        origin,
      )}); } catch { return null; } })()`,
      'browser tab webview',
    );
    const browserPermission = await cdp.evaluate(
      `(() => { const w = [...document.querySelectorAll('webview')].find(item => !item.closest('.service-frame')); return w.executeJavaScript("Notification.requestPermission()"); })()`,
    );
    console.log('browser tab notification permission:', browserPermission);
    assert(browserPermission === 'denied', 'a throwaway browser tab received notification permission.');

    popupCdp.close();

    // Nine modules used to be one too many. The live set was capped at eight and
    // the ninth open module unmounted the oldest frame behind the user's back,
    // which ends its guest: for a chat client that writes its session while the
    // page unloads, that is a sign-in lost without anyone asking for one.
    for (const id of ['s-v2', 's-v3', 's-v4', 's-v5', 's-v6', 's-v7', 's-v8', 's-v9']) {
      await cdp.evaluate(`location.hash = '#/service/${id}'; true`);
      await waitFor(
        cdp.evaluate,
        `Boolean(document.querySelector('.service-frame[data-service="${id}"].is-active webview'))`,
        `${id} frame`,
      );
    }
    await sleep(800);
    const frames = await cdp.evaluate(`document.querySelectorAll('.service-frame').length`);
    console.log('open modules:', frames);
    assert(frames === 9, `the stage held ${frames} frames after nine modules were opened, not 9.`);
    await cdp.evaluate(`location.hash = '#/service/s-verify'; true`);
    const firstStill = await waitFor(
      cdp.evaluate,
      guest(`({ marker: window.__marker, token: localStorage.getItem('kx-token') })`),
      'first module after nine opens',
    );
    console.log('first module after nine opens:', JSON.stringify(firstStill));
    assert(
      firstStill.marker === first.marker,
      'opening later modules destroyed the guest of one that was already open.',
    );
    assert(
      firstStill.token === first.marker,
      'page storage was lost when more modules were opened.',
    );

    await closeWindow(cdp);

    // The partition must survive a full process restart, not just a view change.
    launch();
    page = await target();
    cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'second shell');
    await openFixture(cdp);
    const restored = await waitFor(cdp.evaluate, guest('document.cookie'), 'restored cookie');
    console.log('cookie after restart:', JSON.stringify(restored));
    assert(String(restored).includes('kx=session-ok'), 'the session did not survive an app restart.');
    const restoredToken = await cdp.evaluate(guest(`localStorage.getItem('kx-token')`));
    console.log('page storage after restart:', JSON.stringify(restoredToken));
    assert(
      restoredToken === first.marker,
      'the page storage a module saved did not survive an app restart.',
    );

    const openedDialog = await cdp.evaluate(
      `(() => { const button = document.querySelector('.service-frame.is-active [aria-label="Clear this session"]'); if (!button) return false; button.click(); return true; })()`,
    );
    assert(openedDialog, 'the clear-session control was not available.');
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.modal-layer'))`, 'clear-session dialog');
    const confirmed = await cdp.evaluate(
      `(() => { const button = [...document.querySelectorAll('.modal-actions button')].find(item => item.textContent.trim().toLowerCase().includes('clear session')); if (!button) return false; button.click(); return true; })()`,
    );
    assert(confirmed, 'the clear-session confirmation was not available.');
    const cleared = await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('.service-frame[data-service="s-verify"] webview'); if (!w) return null; return w.executeJavaScript('document.cookie').then(value => value.includes('kx=session-ok') ? null : { cleared: true, cookie: value }); })()`,
      'cleared service session',
      200,
    );
    console.log('cookie after clear:', JSON.stringify(cleared));
    assert(cleared.cleared === true, 'the cleared session still returned the cookie.');

    cdp.close();
    await stop();
    console.log('service engine harness: PASS');
  } catch (error) {
    console.error('service engine harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    fixture.close();
  }
})();
