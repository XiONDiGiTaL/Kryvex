/* eslint-disable no-console */
/**
 * The service sign-in pop-up, proven in the window it really uses.
 *
 * The bug this covers: a service's "Sign in with Google" button calls
 * `window.open('')` and writes the provider's address into the window
 * afterwards — Google Identity Services, Apple and most OAuth SDKs do exactly
 * this. Kryvex required an http(s) URL before it would create the window, so the
 * window never existed, the navigation that followed had no target, and the
 * button looked dead. A unit test proves the rule; only the real window proves
 * the button.
 *
 * The harness runs the built app against a loopback service module and checks:
 *
 * - `window.open('')` from a service module produces a real window;
 * - that window starts at `about:blank`, shares the module's session (it reads
 *   the module's own cookie) and can be navigated by its opener — the three
 *   things the SDK path depends on;
 * - Google's own sign-in page loads in that window, keeps the browser, and
 *   shows its identifier field;
 * - Microsoft's own sign-in page loads in the same kind of window;
 * - a pop-up to a non-web address is still refused.
 *
 * The provider steps need the internet by design, which is why this file is not
 * in a push batch: it runs from `pnpm verify:signin-popup` or the opt-in CI job.
 * No credentials are used: the flow is followed as far as the identifier field,
 * which is as far as an unauthenticated run can honestly go.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-signin-popup.cjs`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-signin-popup-profile');
const cdpPort = Number(process.env.KRYVEX_CDP_PORT || 9357);
const fixturePort = Number(process.env.KRYVEX_POPUP_PORT || 8157);
const origin = `http://127.0.0.1:${fixturePort}`;

const GOOGLE = 'https://accounts.google.com/ServiceLogin?service=mail';
const MICROSOFT = 'https://login.live.com/';
const PROVIDER_TIMEOUT = 75_000;

let child = null;
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const OPENERS = `<!doctype html>
<html><head><meta charset="utf-8"><title>Service fixture</title></head>
<body style="margin:0;padding:40px;background:#0b0e12;color:#eaf2ff;font:16px sans-serif">
<h1>Signed out</h1>
<button id="signin" style="padding:12px 20px;font:16px sans-serif">Sign in</button>
<p id="state">ready</p>
<script>
  document.cookie = 'kx_popup=shared; path=/';
  window.__opens = 0;
  window.__openBlank = name => {
    window.__opens += 1;
    return window.open('', name, 'width=480,height=720');
  };
  window.__refused = url => window.open(url, 'kx-refused');
  document.getElementById('signin').onclick = () => {
    window.__blank = window.__openBlank('kx-fixed-name');
    document.getElementById('state').textContent = window.__blank ? 'window open' : 'window refused';
  };
</script>
</body></html>`;

const fixture = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(OPENERS);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

function seedState() {
  const dir = path.join(profile, 'Kryvex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: [
        {
          id: 's-popup',
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
  child = spawn(electron, ['.', `--remote-debugging-port=${cdpPort}`], {
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  return response.json();
}

async function waitForTarget(predicate, label, attempts = 200) {
  let last = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      last = await listTargets();
      const found = last.find(predicate);
      if (found) return found;
    } catch {
      /* the app is still starting */
    }
    await sleep(250);
  }
  throw new Error(
    `Target not found: ${label} (saw ${last.map(item => `${item.type}:${item.url}`).join(', ') || 'nothing'})`,
  );
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

async function waitFor(evaluate, expression, label, attempts = 160) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await evaluate(expression);
      last = value;
      if (value) return value;
    } catch (error) {
      last = String(error);
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

/** What the pop-up is showing right now, or null while it is navigating. */
async function pageState(popup) {
  return popup
    .evaluate(
      `(() => ({
        url: location.href,
        title: document.title,
        ready: document.readyState,
        text: (document.body ? document.body.innerText : '').slice(0, 4000),
        input: Boolean(document.querySelector('input[type="email"], input#identifierId, input[type="text"], input[type="tel"]')),
      }))()`,
    )
    .catch(() => null);
}

async function untilPage(popup, host, label) {
  const deadline = Date.now() + PROVIDER_TIMEOUT;
  let last = null;
  while (Date.now() < deadline) {
    const state = await pageState(popup);
    if (state) {
      last = state;
      if (state.ready === 'complete' && host.test(new URL(state.url).hostname) && state.text.trim()) {
        return state;
      }
    }
    await sleep(400);
  }
  throw new Error(`${label} never finished loading in the pop-up: ${JSON.stringify(last)}`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const PROVIDERS = [
  {
    id: 'google',
    label: 'Google',
    url: GOOGLE,
    host: /^accounts\.google\.com$/i,
    refusal: /may not be secure|disallowed_useragent|try using a different browser|couldn.t sign you in/i,
    // Google's identifier step is an email field; that is the proof the sign-in
    // page itself rendered rather than an error page on the right host.
    wantsInput: true,
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    url: MICROSOFT,
    host: /(^|\.)(live\.com|microsoftonline\.com)$/i,
    refusal: /unsupported browser|try using a different browser|update your browser/i,
    wantsInput: false,
  },
];

fixture.listen(fixturePort, '127.0.0.1');

(async () => {
  let guest = null;
  try {
    seedState();
    launch();

    const shellTarget = await waitForTarget(
      item => item.type === 'page' && item.title === 'Kryvex',
      'Kryvex shell',
    );
    const shell = await connect(shellTarget.webSocketDebuggerUrl);
    await waitFor(shell.evaluate, `Boolean(document.querySelector('.app'))`, 'the shell');

    await shell.evaluate(`window.location.hash = '#/service/s-popup'; true`);
    const guestTarget = await waitForTarget(
      item => typeof item.url === 'string' && item.url.startsWith(`${origin}/`),
      'the service module',
    );
    guest = await connect(guestTarget.webSocketDebuggerUrl);
    await waitFor(guest.evaluate, `Boolean(document.getElementById('signin'))`, 'the fixture page');

    // 1. The window a sign-in SDK opens first, with no address at all.
    const opened = await guest.evaluate(
      `Boolean(window.__blank = window.__blank || window.__openBlank('kx-blank-first'))`,
    );
    check('a service may open a window with no page yet', opened === true, String(opened));

    const blankTarget = await waitForTarget(
      item => item.type === 'page' && item.url === 'about:blank',
      'the blank pop-up',
    );
    const blank = await connect(blankTarget.webSocketDebuggerUrl);
    const href = await waitFor(blank.evaluate, `location.href`, 'the blank window address');
    check('the window starts at about:blank', href === 'about:blank', href);

    // 2. The window shares the module's session: this is what makes a sign-in
    //    performed in the pop-up sign the module in.
    const cookie = await blank.evaluate(`document.cookie`);
    check(
      "the pop-up shares the module's session",
      typeof cookie === 'string' && cookie.includes('kx_popup=shared'),
      String(cookie) || 'no cookie visible',
    );

    // 3. The opener may write the provider's address into it afterwards.
    const written = await guest.evaluate(
      `(() => {
        try { window.__blank.location.replace(${JSON.stringify(GOOGLE)}); return true; }
        catch (error) { return String(error); }
      })()`,
    );
    check('the opener can navigate that window afterwards', written === true, String(written));

    // 4. Each provider, in its own blank window, opened the way an SDK opens it.
    const report = {};
    for (const provider of PROVIDERS) {
      const name = `kx-${provider.id}`;
      const created = await guest.evaluate(
        `Boolean(window['__${provider.id}'] = window['__${provider.id}'] || window.__openBlank(${JSON.stringify(name)}))`,
      );
      if (!created) {
        check(`the ${provider.label} pop-up was created`, false, 'window.open returned nothing');
        continue;
      }

      // A second blank window exists now; find the one that is not the Google
      // window already in flight.
      const target = await waitForTarget(
        item =>
          item.type === 'page' &&
          item.url === 'about:blank' &&
          item.webSocketDebuggerUrl !== blankTarget.webSocketDebuggerUrl,
        `the ${provider.label} pop-up`,
      );
      const popup = await connect(target.webSocketDebuggerUrl);
      await guest.evaluate(
        `window['__${provider.id}'].location.replace(${JSON.stringify(provider.url)}); true`,
      );

      const state = await untilPage(popup, provider.host, provider.label);
      report[provider.id] = { url: state.url, title: state.title, input: state.input, chars: state.text.length };
      console.log(`[${provider.id}] ${state.url} · ${state.title}`);

      check(
        `${provider.label}'s own sign-in host answered`,
        provider.host.test(new URL(state.url).hostname),
        state.url,
      );
      check(
        `the ${provider.label} page kept the browser`,
        !provider.refusal.test(state.text),
        state.text.split('\n')[0]?.slice(0, 140) ?? '',
      );
      check(
        `the ${provider.label} sign-in surface rendered`,
        state.text.trim().length > 40 && (!provider.wantsInput || state.input),
        `${state.text.trim().length} characters${state.input ? ', with an input' : ', no input'}`,
      );

      await popup.evaluate(`window.close(); true`).catch(() => undefined);
      popup.close();
    }

    // 5. The window that was allowed is still only allowed to show a web page.
    const refused = await guest.evaluate(
      `Boolean(window.__refused('file:///C:/Windows/win.ini'))`,
    );
    check('a pop-up to a non-web address is still refused', refused === false, String(refused));

    const passed = checks.every(item => item.ok);
    console.log(passed ? 'sign-in pop-up harness: PASS' : 'sign-in pop-up harness: FAIL');
    console.log(JSON.stringify({ providers: report, checks: checks.length }, null, 2));
    guest.close();
    shell.close();
    if (!passed) process.exitCode = 1;
  } finally {
    await stop();
    fixture.close();
  }
})().catch(error => {
  console.error('sign-in pop-up harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
