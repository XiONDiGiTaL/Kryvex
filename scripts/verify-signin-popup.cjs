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
 * Two halves, and they prove different things.
 *
 * **The provider half** loads Google's and Microsoft's own sign-in pages in a
 * window a service reserved. It needs the internet, so it is neither in the
 * push batch nor implied by a local run: `pnpm verify:signin-popup`, or the CI
 * `signin_popup` input. No credentials are used, so it stops where an
 * unauthenticated run honestly must — at the identifier field.
 *
 * **The return half** is a provider fixture on loopback, and it runs the whole
 * flow: a test account, a consent step, a code handed back to the module by the
 * window that closed itself, the module exchanging that code for a session, a
 * session that survives the module reloading, and the two refusals the boundary
 * owes (a replay, a forged state). It needs no network, so it runs on every
 * push: `pnpm verify:signin-return`, or the Windows job's own step.
 *
 * Run `pnpm build` first.
 *   node scripts/verify-signin-popup.cjs              both halves
 *   node scripts/verify-signin-popup.cjs --local-only return half only
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
/** The provider half reaches the internet; the return half never leaves this box. */
const LOCAL_ONLY = process.argv.includes('--local-only') || process.env.KRYVEX_SIGNIN_LOCAL === '1';
/** Check the loopback provider's routes without launching the app. */
const SELF_TEST = process.argv.includes('--self-test');

/**
 * The fixture account. Not a secret and not a credential: it exists only in this
 * file and only the loopback provider started below accepts it.
 */
const ACCOUNT = { email: 'fixture@example.test', password: 'fixture-password-2026' };

let child = null;
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * The service module: it holds a session, reserves a window for a provider, and
 * exchanges the code that comes back. Everything a real module does around a
 * sign-in lives here, in one page, because the point is to test Kryvex's window
 * and session plumbing rather than to write an OAuth library.
 */
const MODULE_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Service fixture</title></head>
<body style="margin:0;padding:40px;background:#0b0e12;color:#eaf2ff;font:16px sans-serif">
<h1 id="headline" style="font-size:20px">Signed out</h1>
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

  // The SDK flow: reserve a window, send it to the provider, and let the
  // provider hand a code back here. This page is the module, so the exchange
  // below is the module's own return leg, not the provider's.
  // The pending state lives in this tab's sessionStorage. A provider hands its
  // code back by navigating this page, which replaces the instance that asked
  // for it; any other page — a pop-up of its own — must not be able to claim
  // that code merely by being in the same session.
  const PENDING = 'kx-signin-state';
  const pendingState = () => {
    try { return sessionStorage.getItem(PENDING); } catch { return null; }
  };
  window.__flow = {
    state: pendingState(),
    code: null,
    token: null,
    error: null,
    exchanges: 0,
    attempted: false,
    callbackState: null,
  };
  window.__startSignIn = () => {
    const state = 'st-' + Math.random().toString(36).slice(2, 10);
    window.__flow.state = state;
    try { sessionStorage.setItem(PENDING, state); } catch { /* no storage */ }
    window.__signinPopup = window.__openBlank('kx-oauth');
    if (!window.__signinPopup) return null;
    window.__signinPopup.location.replace('/authorize?client=fixture&state=' + encodeURIComponent(state));
    return state;
  };
  window.__exchange = async (code, state) => {
    window.__flow.exchanges += 1;
    if (code) window.__flow.code = String(code);
    // The state is the one this page instance started the sign-in with, and it
    // is what the exchange is checked against: a callback carrying any other
    // state is refused here, not silently traded for a session.
    const expected = window.__flow.state;
    if (!expected) {
      window.__flow.error = 'no-state';
      return false;
    }
    if (state && String(state) !== String(expected)) {
      // A code minted for another sign-in is not this page's to spend.
      window.__flow.error = 'state-mismatch';
      return false;
    }
    const url = '/token?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(expected);
    window.__flow.lastToken = url;
    const response = await fetch(url);
    window.__flow.lastStatus = response.status;
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.access_token) {
      document.cookie = 'kx_module=' + body.access_token + '; path=/';
      try { sessionStorage.removeItem(PENDING); } catch { /* no storage */ }
      window.__flow.token = body.access_token;
      window.__flow.error = null;
      document.getElementById('headline').textContent = 'Signed in';
      document.getElementById('state').textContent = 'signed in';
      return true;
    }
    // A refused exchange leaves the session that already exists alone: a module
    // reloading with a spent code must not sign its user out.
    window.__flow.error = body.error || ('HTTP ' + response.status);
    return false;
  };
  const stored = document.cookie.match(/(?:^|; )kx_module=([^;]+)/);
  if (stored) {
    window.__flow.token = stored[1];
    document.getElementById('headline').textContent = 'Signed in';
    document.getElementById('state').textContent = 'signed in';
  }
  window.__exchangeOnce = (code, state) => {
    // A provider spends a code once. Three transports carry it here, so a page
    // instance must attempt the exchange at most once or it refuses its own
    // second arrival.
    if (!code || window.__flow.attempted || window.__flow.token) return;
    if (window.__flow.exchanges >= 3) return;
    window.__flow.attempted = true;
    // A refused code reopens the attempt: the module's own backend lookup asks
    // by state, so it can still hand over the code that belongs to this page.
    void window.__exchange(String(code), String(state || '')).then(ok => {
      if (!ok && !window.__flow.token) window.__flow.attempted = false;
    });
  };
  // Whichever instance won that exchange, every instance reads the session from
  // the module's own cookie, which is where a session lives.
  setInterval(() => {
    if (window.__flow.token) return;
    const match = document.cookie.match(/(?:^|; )kx_module=([^;]+)/);
    if (!match) return;
    window.__flow.token = match[1];
    window.__flow.code = window.__flow.code || match[1].replace('kx-access-', '');
    document.getElementById('headline').textContent = 'Signed in';
    document.getElementById('state').textContent = 'signed in';
  }, 300);
  // A pop-up that has the code can hand it over three ways, and a real SDK may
  // use any of them: navigating this window, a same-origin message, or nothing
  // at all — in which case the module asks its own backend for the outcome. All
  // three are wired, so the harness tests the session, not one transport.
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const data = event.data || {};
    if (data.kind === 'kx-signin') window.__flow.messaged = String(data.code || '');
  });
  window.__askForResult = () => {
    if (window.__flow.token) return true;
    if (!window.__flow.state) return false;
    fetch('/flow?state=' + encodeURIComponent(window.__flow.state))
      .then(response => {
        const seen = window.__flow.poll || { count: 0, status: 0 };
        window.__flow.poll = { count: seen.count + 1, status: response.status };
        return response.ok ? response.json() : null;
      })
      .then(body => {
        if (body && body.code) window.__exchangeOnce(body.code, window.__flow.state);
      })
      .catch(error => {
        window.__flow.poll = { count: 1, status: String(error).slice(0, 80) };
      });
    return Boolean(window.__flow.token);
  };
  const params = new URLSearchParams(location.search);
  if (params.get('code')) {
    window.__flow.code = params.get('code');
    window.__flow.callbackState = params.get('state');
    // The code is recorded here and spent in exactly one place: this page's own
    // lookup by state. A pop-up inherits a copy of this tab's sessionStorage, so
    // if it also received the code, whoever exchanged first would spend it and
    // the other would be refused a code it was handed.
    if (!window.__flow.state) window.__flow.error = 'no-pending-state';
  }
  setInterval(window.__askForResult, 400);
</script>
</body></html>`;

function providerPage(state, error = '') {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture provider</title></head>
<body style="margin:0;padding:40px;background:#fff;color:#111;font:16px sans-serif">
<h1 style="font-size:20px">Sign in</h1>
<p style="font-size:13px">Fixture provider · the test account only</p>
<form id="provider-form" method="post" action="/authorize?state=${encodeURIComponent(state)}">
  <p><label for="account">Email</label><br>
    <input id="account" name="account" type="email" autocomplete="off" style="width:280px;padding:8px"></p>
  <p><label for="password">Password</label><br>
    <input id="password" name="password" type="password" style="width:280px;padding:8px"></p>
  <button type="submit" style="padding:10px 18px">Continue</button>
</form>
<p id="error" style="color:#b00020">${error}</p>
</body></html>`;
}

function consentPage(state) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Allow access</title></head>
<body style="margin:0;padding:40px;background:#fff;color:#111;font:16px sans-serif">
<h1 style="font-size:20px">Allow this module?</h1>
<p style="font-size:13px">The fixture account would share its name with this module.</p>
<button id="allow" style="padding:10px 18px" onclick="location.href='/approve?state=${encodeURIComponent(state)}'">Allow</button>
</body></html>`;
}

/**
 * The window's last page. A real SDK's pop-up does not navigate the module back
 * itself: it hands the code to its opener and closes, and the opener — which is
 * same-origin here — is the one that ends up at the callback.
 */
const RETURN_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Returning to the module</title></head>
<body style="margin:0;padding:40px;font:16px sans-serif">
<p id="state">Handing the code back…</p>
<script>
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '';
  const state = params.get('state') || '';
  try {
    if (window.opener) {
      location.replace(
        '/product?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state),
      );
    }
  } catch (error) { /* the module may already have gone */ }
  try {
    if (window.opener) {
      // Nothing is pushed at the module: the code is finished here, and the
      // module reads the result from the session or asks for it by state.
    }
  } catch (error) { /* same */ }
  document.getElementById('state').textContent = 'Handed back';
  // Closing in the same task as the navigation cancels it, so the window stays
  // long enough for its opener to have the code by both routes.
  setTimeout(() => window.close(), 1200);
</script>
</body></html>`;

/** Issued codes, and whether they have been spent. */
const codes = new Map();
/** state -> code, so a module can ask for the result without a transport. */
const flows = new Map();
let codeSequence = 0;
/** What the fixture saw, newest last: a refusal has to be able to name itself. */
const flowLog = [];
function logFlow(entry) {
  flowLog.push(entry);
  if (flowLog.length > 12) flowLog.shift();
}

function readBody(request) {
  return new Promise(resolve => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) request.destroy();
    });
    request.on('end', () => resolve(body));
  });
}

function html(response, body, status = 200, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

const fixture = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', origin);
  const state = url.searchParams.get('state') ?? '';

  if (url.pathname === '/authorize') {
    if (request.method === 'POST') {
      const form = new URLSearchParams(await readBody(request));
      if (form.get('account') === ACCOUNT.email && form.get('password') === ACCOUNT.password) {
        // A real provider keeps this HttpOnly; the harness leaves it readable so
        // the module can prove it shares the pop-up's session, which is the
        // property Kryvex has to get right.
        response.writeHead(303, {
          Location: `/consent?state=${encodeURIComponent(state)}`,
          'Set-Cookie': 'kx_provider=fixture; Path=/',
          'Cache-Control': 'no-store',
        });
        response.end();
        return;
      }
      html(response, providerPage(state, 'That account was not recognised.'), 401);
      return;
    }
    html(response, providerPage(state));
    return;
  }

  if (url.pathname === '/consent') {
    html(response, consentPage(state));
    return;
  }

  if (url.pathname === '/approve') {
    codeSequence += 1;
    const code = `code-${codeSequence}`;
    codes.set(code, { state, used: false });
    flows.set(state, code);
    logFlow({ at: 'approve', state, code, codes: codes.size });
    response.writeHead(303, {
      Location: `/return?code=${code}&state=${encodeURIComponent(state)}`,
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }

  if (url.pathname === '/return') {
    html(response, RETURN_PAGE);
    return;
  }

  if (url.pathname === '/flow') {
    const code = flows.get(state);
    const issued2 = code ? codes.get(code) : null;
    // A spent code is not a result: the page that earned it already holds the
    // session, and handing it out again only offers another page a refusal.
    const ready = Boolean(code && issued2 && !issued2.used);
    if (!ready) {
      logFlow({ at: 'flow', state, code: code ?? null, spent: Boolean(issued2 && issued2.used) });
      json(response, 404, { error: 'not_ready' });
      return;
    }
    json(response, 200, { code });
    return;
  }

  if (url.pathname === '/token') {
    const code = url.searchParams.get('code') ?? '';
    const issued = codes.get(code);
    if (!issued || issued.used || issued.state !== state) {
      logFlow({
        at: 'token',
        code,
        state,
        verdict: 'invalid_grant',
        issued: issued ? { state: issued.state, used: issued.used } : null,
        codes: codes.size,
      });
      json(response, 400, { error: 'invalid_grant' });
      return;
    }
    logFlow({ at: 'token', code, state, verdict: 'ok' });
    issued.used = true;
    json(response, 200, { access_token: `kx-access-${code}` });
    return;
  }

  // Everything else is the module, so a callback lands on the page that owns
  // the exchange.
  html(response, MODULE_PAGE);
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
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception;
      throw new Error(detail?.description || result.exceptionDetails.text || 'Failed.');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

/**
 * A guest call that survives the module being reconciled.
 *
 * Closing a service pop-up makes the module reload — that is the feature the
 * pop-up fix belongs to — and a reload destroys the execution context the CDP
 * session was using, which reads as a bare "Uncaught". Waiting for the fixture
 * and asking once more is what keeps the next check honest instead of failing
 * the run on Kryvex doing exactly what it should.
 */
async function guestEval(guest, expression) {
  try {
    return await guest.evaluate(expression);
  } catch {
    await waitFor(
      guest.evaluate,
      `Boolean(document.getElementById('signin'))`,
      'the fixture after a reload',
      80,
    );
    return guest.evaluate(expression);
  }
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

/**
 * The provider half of the return leg, driven by plain fetch: the form, the
 * account, consent, the code, the single exchange and both refusals. This is
 * everything about the fixture that does not need a window, so it runs anywhere
 * — including a CI job with no display — and leaves only the window itself to
 * the Electron run.
 */
async function selfTest() {
  const form = await fetch(`${origin}/authorize?state=st-self`);
  const formHtml = await form.text();
  check(
    'the provider serves its sign-in form',
    form.ok && formHtml.includes('id="provider-form"'),
    `HTTP ${form.status}`,
  );

  const post = (password) =>
    fetch(`${origin}/authorize?state=st-self`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ account: ACCOUNT.email, password }).toString(),
      redirect: 'manual',
    });

  const accepted = await post(ACCOUNT.password);
  check(
    'the test account is accepted and sent to consent',
    accepted.status === 303 && String(accepted.headers.get('location')).startsWith('/consent'),
    `HTTP ${accepted.status}`,
  );

  const refused = await post('not-the-password');
  check('a wrong password is refused', refused.status === 401, `HTTP ${refused.status}`);

  const consent = await fetch(`${origin}/consent?state=st-self`);
  const consentHtml = await consent.text();
  check(
    'the consent step is served',
    consent.ok && consentHtml.includes('id="allow"'),
    `HTTP ${consent.status}`,
  );

  const approved = await fetch(`${origin}/approve?state=st-self`, { redirect: 'manual' });
  const location = String(approved.headers.get('location') ?? '');
  check(
    'approving mints a code for that state',
    approved.status === 303 && location.includes('code='),
    location || `HTTP ${approved.status}`,
  );

  const code = new URL(location, origin).searchParams.get('code') ?? '';
  const asking = await fetch(`${origin}/flow?state=st-self`);
  const asked = await asking.json().catch(() => ({}));
  check(
    'the module can ask for the code by state',
    asking.ok && asked.code === code,
    JSON.stringify(asked),
  );

  const exchanged = await fetch(`${origin}/token?code=${encodeURIComponent(code)}&state=st-self`);
  const body = await exchanged.json().catch(() => ({}));
  check(
    'the code exchanges once for a session',
    exchanged.ok && String(body.access_token ?? '').startsWith('kx-access-'),
    JSON.stringify(body),
  );

  const replay = await fetch(`${origin}/token?code=${encodeURIComponent(code)}&state=st-self`);
  check('the same code cannot be exchanged twice', replay.status === 400, `HTTP ${replay.status}`);

  const forged = await fetch(`${origin}/token?code=${encodeURIComponent(code)}&state=forged`);
  check('a code presented with another state is refused', forged.status === 400, `HTTP ${forged.status}`);

  const unknown = await fetch(`${origin}/flow?state=never-issued`);
  check('an unknown state has no result to give', unknown.status === 404, `HTTP ${unknown.status}`);
}

(async () => {
  if (SELF_TEST) {
    try {
      await selfTest();
    } finally {
      const passed = checks.every(item => item.ok);
      console.log(passed ? 'sign-in fixture: PASS' : 'sign-in fixture: FAIL');
      if (!passed) process.exitCode = 1;
      // Nothing else was started, so the listener is the only thing keeping the
      // process alive.
      fixture.close();
    }
    return;
  }

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
    const opened = await guestEval(
      guest,
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

    // 3. The opener may write the provider's address into it afterwards. A local
    //    run stays on the fixture rather than reaching Google to prove it.
    const address = LOCAL_ONLY ? `${origin}/product` : GOOGLE;
    const written = await guestEval(
      guest,
      `(() => {
        try { window.__blank.location.replace(${JSON.stringify(address)}); return true; }
        catch (error) { return String(error); }
      })()`,
    );
    check('the opener can navigate that window afterwards', written === true, String(written));

    // 4. The return leg, on this machine only: a provider page, the test
    //    account, consent, the code handed back, the exchange, the session.
    console.log('· return leg: asking the module to open its sign-in window');
    const flowState = await guestEval(guest, `window.__startSignIn()`);
    check(
      'the module reserved a window for the provider',
      typeof flowState === 'string' && flowState.startsWith('st-'),
      String(flowState),
    );

    const authorizeTarget = await waitForTarget(
      item => item.type === 'page' && String(item.url).includes('/authorize'),
      'the provider sign-in page',
    );
    const flow = await connect(authorizeTarget.webSocketDebuggerUrl);
    console.log('· return leg: waiting for the provider form');
    await waitFor(flow.evaluate, `Boolean(document.getElementById('provider-form'))`, 'the provider form');
    check('the provider page opened in that window', true, authorizeTarget.url);

    console.log('· return leg: submitting the test account');
    // Submitting navigates, which can destroy the context mid-call; the wait
    // below is what proves it worked.
    await flow
      .evaluate(`(() => {
        document.getElementById('account').value = ${JSON.stringify(ACCOUNT.email)};
        document.getElementById('password').value = ${JSON.stringify(ACCOUNT.password)};
        document.getElementById('provider-form').submit();
        return true;
      })()`)
      .catch(() => undefined);
    console.log('· return leg: waiting for the consent step');
    await waitFor(flow.evaluate, `location.pathname === '/consent'`, 'the consent step');
    check('the test account signed in and reached the consent step', true, 'consent');

    const providerCookie = await flow.evaluate(`document.cookie`);
    check(
      'the provider set its own session cookie in that window',
      typeof providerCookie === 'string' && providerCookie.includes('kx_provider=fixture'),
      String(providerCookie) || 'no cookie visible',
    );

    console.log('· return leg: granting consent');
    await flow.evaluate(`document.getElementById('allow').click(); true`).catch(() => undefined);
    console.log('· return leg: waiting for the code to reach the module');
    let code;
    try {
      code = await waitFor(
        guest.evaluate,
        `window.__flow && (window.__flow.code || window.__flow.token)`,
        'the code to reach the module',
      );
    } catch (error) {
      const fromModule = await guest.evaluate(`window.__flow`).catch(() => null);
      const where = await flow.evaluate(`location.href`).catch(() => 'the window is gone');
      throw new Error(
        `${error instanceof Error ? error.message : error} | module ${JSON.stringify(fromModule)} | window ${where} | fixture ${JSON.stringify(flowLog)}`,
      );
    }
    check(
      'the provider handed the code back to the module',
      typeof code === 'string' && code.startsWith('code-'),
      String(code),
    );

    let session;
    try {
      session = await waitFor(
        guest.evaluate,
        `window.__flow && window.__flow.token`,
        'the exchanged session',
      );
    } catch (error) {
      const fromModule = await guest.evaluate(`window.__flow`).catch(() => null);
      const cookies = await guest.evaluate(`document.cookie`).catch(() => 'unknown');
      throw new Error(
        `${error instanceof Error ? error.message : error} | module ${JSON.stringify(fromModule)} | cookies ${cookies} | fixture ${JSON.stringify(flowLog)}`,
      );
    }
    check(
      'the module exchanged the code for a session',
      typeof session === 'string' && session.startsWith('kx-access-'),
      String(session),
    );

    const sameState = await guest.evaluate(`window.__flow.state === ${JSON.stringify(flowState)}`);
    check('the state parameter came back unchanged', sameState === true, String(flowState));

    const moduleCookies = await guest.evaluate(`document.cookie`);
    check(
      'the module holds the session the pop-up signed in',
      typeof moduleCookies === 'string' &&
        moduleCookies.includes('kx_module=') &&
        moduleCookies.includes('kx_provider=fixture'),
      String(moduleCookies),
    );

    // The window that returned the code closes itself, the way an SDK's does.
    await sleep(1800);
    const leftover = (await listTargets()).some(item => String(item.url).includes('/return'));
    check('the sign-in window closed itself after returning', !leftover, leftover ? 'still open' : 'closed');

    // The code is single-use and bound to the state it was issued for. Both
    // refusals are checked where the module lives, not in the fixture's own code.
    const replay = await guestEval(
      guest,
      `(async () => {
        const response = await fetch('/token?code=' + encodeURIComponent(window.__flow.code) + '&state=' + encodeURIComponent(window.__flow.state));
        return response.status;
      })()`,
    );
    check('a code cannot be exchanged twice', replay === 400, `HTTP ${replay}`);

    const forged = await guestEval(
      guest,
      `(async () => {
        const response = await fetch('/token?code=forged&state=forged');
        return response.status;
      })()`,
    );
    check('a forged code and state are refused', forged === 400, `HTTP ${forged}`);

    // A reload must find the session where the module left it: the cookie is the
    // session, and it outlives the page that received it.
    await guest.evaluate(`location.reload(); true`).catch(() => undefined);
    const afterReload = await waitFor(
      guest.evaluate,
      `window.__flow && window.__flow.token`,
      'the session after a reload',
    );
    check('the session survives the module reloading', afterReload === session, String(afterReload));

    flow.close();

    // 5. Each real provider, in its own blank window, opened the way an SDK
    //    opens it. Skip-only: this is the half that needs the internet.
    const report = {};
    const popups = [];
    if (LOCAL_ONLY) {
      console.log('skipping Google and Microsoft: --local-only');
    } else {
      for (const provider of PROVIDERS) {
        const name = `kx-${provider.id}`;
        const created = await guestEval(
          guest,
          `Boolean(window['__${provider.id}'] = window['__${provider.id}'] || window.__openBlank(${JSON.stringify(name)}))`,
        );
        if (!created) {
          check(`the ${provider.label} pop-up was created`, false, 'window.open returned nothing');
          continue;
        }

        // A second blank window exists now; find the one that is not the window
        // already in flight.
        const target = await waitForTarget(
          item =>
            item.type === 'page' &&
            item.url === 'about:blank' &&
            item.webSocketDebuggerUrl !== blankTarget.webSocketDebuggerUrl,
          `the ${provider.label} pop-up`,
        );
        const popup = await connect(target.webSocketDebuggerUrl);
        await guestEval(
          guest,
          `window['__${provider.id}'].location.replace(${JSON.stringify(provider.url)}); true`,
        );

        const state = await untilPage(popup, provider.host, provider.label);
        report[provider.id] = {
          url: state.url,
          title: state.title,
          input: state.input,
          chars: state.text.length,
        };
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

        // Left open until both providers have been checked: closing a service
        // pop-up reconciles the module, and a reload half-way through the loop
        // would destroy the guest context the next provider still needs.
        popups.push(popup);
      }
    }

    // 6. The window that was allowed is still only allowed to show a web page.
    const refused = await guestEval(guest, `Boolean(window.__refused('file:///C:/Windows/win.ini'))`);
    check('a pop-up to a non-web address is still refused', refused === false, String(refused));

    // 7. Close the windows the way a page does. The module is reconciled after
    //    them, which is the behaviour the pop-up fix exists for; nothing is
    //    checked past this point, so the reload cannot disturb the run.
    for (const popup of popups) {
      await popup.evaluate(`window.close(); true`).catch(() => undefined);
      popup.close();
    }
    blank.close();

    const passed = checks.every(item => item.ok);
    console.log(passed ? 'sign-in pop-up harness: PASS' : 'sign-in pop-up harness: FAIL');
    console.log(JSON.stringify({ localOnly: LOCAL_ONLY, providers: report, checks: checks.length }, null, 2));
    guest.close();
    shell.close();
    if (!passed) process.exitCode = 1;
  } finally {
    await stop();
    fixture.close();
  }
})().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('sign-in pop-up harness: FAIL', error instanceof Error ? error.stack : error);
  const failed = checks.filter(item => !item.ok).map(item => item.name).join('; ');
  // A workflow command turns this into an annotation: the whole job log is too
  // long to read where the harness lives, and the annotation is not.
  const line = `${message}${failed ? ` | failed: ${failed}` : ''}`.replace(/\s+/g, ' ');
  console.log(`::error::${line.slice(0, 1800)}`);
  process.exitCode = 1;
});
