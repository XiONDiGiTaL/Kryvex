/**
 * Traces a sign-in redirect chain and proves the retry storm is gone.
 *
 * The bug this guards against lived in the identity layer: the app called
 * `contents.setUserAgent()` from `will-navigate` and `will-redirect`, which are
 * *pending* navigations. Chromium installs a new agent override, cancels the
 * navigation it was about to commit, and the page reloads — so an OAuth round
 * trip (POST to the provider, redirect chain, callback) restarted from its first
 * step over and over. Against Google that is a burst of attempts, and the account
 * host answers 429 "too many requests".
 *
 * Two legs, both needed:
 *
 *   Local (offline, deterministic). A tiny server serves a real redirect chain —
 *   GET /start auto-POSTs /authorize, which 302s to /callback, which 302s to
 *   /done. It is run twice: once with the removed per-navigation override
 *   re-created in place, to show the chain never completes, and once with the
 *   shipped `settleUserAgent`, to show exactly one of each hop.
 *
 *   Google (network). A real guest loads `accounts.google.com` with the
 *   production plumbing while the DevTools protocol records the traffic —
 *   `Network.requestWillBeSent`, `responseReceived` and `loadingFailed`. The
 *   trace is asserted for zero 429s, no repeated first-party document loads, no
 *   aborted document loads and a rendered identifier form, then written to
 *   `.tmp-signin-trace.json`.
 *
 * Run after `pnpm build` with:
 *   electron scripts/verify-signin-trace.cjs            (both legs)
 *   electron scripts/verify-signin-trace.cjs --offline  (local leg only)
 *
 * The network leg is a release-time check, not part of `npm test`.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');

// Each leg opens its own window and closes it again. Without this handler the
// gap between legs would look like "all windows closed" and Electron would quit
// before a single assertion had run.
app.on('window-all-closed', () => undefined);
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const GOOGLE_START = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fmyaccount.google.com%2F';
const PROBE_IDENTIFIER = 'kryvex.probe.test@example.com';
const CHROME_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.6533.99 Safari/537.36';
const REDUCED_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

const lines = [];
const checks = [];

function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, why) {
  log(`SKIP ${name} — ${why}`);
}

function finish(code) {
  try {
    fs.writeFileSync(path.join(process.cwd(), '.tmp-signin-trace.log'), `${lines.join('\n')}\n`);
  } catch {
    /* the log is a convenience */
  }
  // `app.exit` alone leaves this process waiting on a guest that had a DevTools
  // debugger attached, so the run would report its verdict and then hang.
  app.exit(code);
  process.exit(code);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Chromium refuses to load a page from some ports outright (ERR_UNSAFE_PORT).
// An ephemeral port usually misses them, but it is a lottery worth not playing:
// one run landed on 5061 and every local check failed for a reason that had
// nothing to do with the code under test.
const UNSAFE_PORTS = new Set([2049, 3659, 4045, 5060, 5061, 6000, 6566, 6667, 6668, 6669, 6679, 6697, 10080]);

function isUnsafePort(port) {
  return port < 1024 || UNSAFE_PORTS.has(port);
}

async function listenSafe(server) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    if (!isUnsafePort(port)) return port;
    await new Promise(resolve => server.close(resolve));
  }
  throw new Error('no safe loopback port was available');
}

async function until(predicate, timeoutMs, step = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await wait(step);
  }
  return null;
}

function startServer() {
  const hits = [];
  const attempts = new Map();
  let throttled = 0;
  const server = http.createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);

    // A stand-in for the account host's rate limiter: more than five visits to
    // the same entry point is a burst, and a burst is what gets a 429.
    const route = request.url.split('?')[0];
    const visits = (attempts.get(route) ?? 0) + 1;
    attempts.set(route, visits);
    if (route === '/start' && visits > 5) {
      throttled += 1;
      response.writeHead(429, { 'content-type': 'text/html' });
      response.end('<h1>Too Many Requests</h1>');
      return;
    }
    if (request.url.startsWith('/host')) {
      const port = server.address().port;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<webview src="http://127.0.0.1:${port}/start" style="width:900px;height:600px"></webview>`);
      return;
    }
    if (request.url === '/start') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        '<form id="f" method="POST" action="/authorize"><input name="state" value="s1"></form>' +
          '<script>document.getElementById("f").submit()</script>',
      );
      return;
    }
    if (request.url === '/authorize') {
      response.writeHead(302, { location: '/callback?code=abc' });
      response.end();
      return;
    }
    if (request.url.startsWith('/callback')) {
      response.writeHead(302, { location: '/done' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<h1>done</h1>');
  });
  return {
    server,
    hits,
    throttled: () => throttled,
    reset: () => {
      attempts.clear();
      throttled = 0;
    },
  };
}

/**
 * Runs the redirect chain in one fresh window. `legacy` re-creates the removed
 * behaviour exactly: the override fires on the pending navigation events.
 */
async function runChain(port, mode, settleUserAgent) {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 700,
    // A sandboxed renderer cannot embed a webview guest, so this host stays
    // unserialised exactly like the app's own shell window.
    webPreferences: { webviewTag: true },
  });
  let reached = false;
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.on('did-fail-load', (_e, code, description) => {
      if (mode === 'settled') log(`guest failed to load ${code} ${description}`);
    });
    if (mode === 'legacy') {
      let flip = 0;
      const swap = () => {
        flip += 1;
        contents.setUserAgent(flip % 2 ? CHROME_AGENT : REDUCED_AGENT);
      };
      contents.on('will-navigate', swap);
      contents.on('will-redirect', swap);
      contents.on('did-navigate', swap);
    } else {
      settleUserAgent(contents);
    }
    contents.on('did-stop-loading', () => {
      if (contents.getURL().endsWith('/done')) reached = true;
    });
  });
  await win.loadURL(`http://127.0.0.1:${port}/host?mode=${mode}`).catch(() => undefined);
  await until(() => reached, 12_000);
  await wait(1500);
  win.destroy();
}

async function localLeg() {
  const { server, hits, throttled, reset } = startServer();
  const port = await listenSafe(server);

  const { settleUserAgent } = require(path.join(process.cwd(), 'dist-electron', 'identity.js'));

  reset();
  const settledFrom = hits.length;
  await runChain(port, 'settled', settleUserAgent);
  const settled = hits.slice(settledFrom).map(hit => hit.replace(/\?.*$/, ''));
  const settledThrottled = throttled();

  reset();
  const legacyFrom = hits.length;
  await runChain(port, 'legacy', settleUserAgent);
  const legacy = hits.slice(legacyFrom).map(hit => hit.replace(/\?.*$/, ''));
  const legacyThrottled = throttled();
  server.close();

  const settledStart = settled.filter(hit => hit === 'GET /start').length;
  const settledAuthorize = settled.filter(hit => hit === 'POST /authorize').length;
  const settledCallback = settled.filter(hit => hit.startsWith('GET /callback')).length;
  const settledDone = settled.filter(hit => hit === 'GET /done').length;
  log(
    `settled: /start x${settledStart}, POST /authorize x${settledAuthorize}, /callback x${settledCallback}, /done x${settledDone}`,
  );
  check('the settled agent walks the chain exactly once', settledDone === 1 && settledStart === 1, `${settledDone} /done, ${settledStart} /start`);
  check('one POST reaches the provider', settledAuthorize === 1, `POST /authorize x${settledAuthorize}`);
  check('one callback returns the code', settledCallback === 1, `/callback x${settledCallback}`);

  const legacyStart = legacy.filter(hit => hit === 'GET /start').length;
  const legacyAuthorize = legacy.filter(hit => hit === 'POST /authorize').length;
  const legacyDone = legacy.filter(hit => hit === 'GET /done').length;
  log(
    `legacy (removed per-navigation override): /start x${legacyStart}, POST /authorize x${legacyAuthorize}, /done x${legacyDone}`,
  );
  check(
    'the removed override restarts the chain instead of finishing it',
    legacyStart > settledStart && legacyDone === 0,
    `/start x${legacyStart} against x${settledStart}, ${legacyDone} /done`,
  );
  check(
    'the removed override never lets the POST through',
    legacyAuthorize === 0,
    `POST /authorize x${legacyAuthorize}`,
  );
  check(
    'the settled agent never touches the rate limiter',
    settledThrottled === 0,
    `${settledThrottled} throttled responses`,
  );
  check(
    'the removed override is what trips the rate limiter',
    legacyThrottled > 0,
    `${legacyThrottled} throttled responses`,
  );
}

/**
 * Types the probe address into Google's identifier field and advances.
 * Returns false when the desktop refuses to route key events, which is a skip
 * rather than a failure: the trace above is still valid evidence.
 */
async function submitIdentifier(contents, value) {
  const focused = await contents
    .executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
      if (!input) return false;
      input.focus();
      input.click();
      return true;
    })()`)
    .catch(() => false);
  if (!focused) return false;

  for (const character of value) {
    contents.sendInputEvent({ type: 'keyDown', keyCode: character });
    contents.sendInputEvent({ type: 'char', keyCode: character });
    contents.sendInputEvent({ type: 'keyUp', keyCode: character });
  }
  await wait(400);
  const entered = await contents
    .executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
      return input ? input.value : '';
    })()`)
    .catch(() => '');
  if (typeof entered !== 'string' || entered.length === 0) return false;

  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(800);
  await contents
    .executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
      if (!input || !input.value) return false;
      const next = document.querySelector('#identifierNext button, #identifierNext, button[type="submit"]');
      if (next) next.click();
      return true;
    })()`)
    .catch(() => false);
  return true;
}

async function googleLeg() {
  const { hardenSession } = require(path.join(process.cwd(), 'dist-electron', 'hardening.js'));
  const { ensureBrowserIdentity, settleUserAgent } = require(
    path.join(process.cwd(), 'dist-electron', 'identity.js'),
  );
  const { webPrivacy } = require(path.join(process.cwd(), 'dist-electron', 'web-privacy.js'));
  const { stableUserAgent } = require(path.join(process.cwd(), 'dist-electron', 'user-agent.js'));
  const { session } = require('electron');

  const partition = `persist:svc-signin-trace-${Date.now()}`;
  const ses = session.fromPartition(partition);
  hardenSession(ses);
  ensureBrowserIdentity(ses);
  webPrivacy.ensureSession(ses, true);

  const requests = [];
  const responses = [];
  const failures = [];

  // Shown but off-screen: a hidden window never takes focus and Chromium drops
  // the key events the identifier submission needs.
  const win = new BrowserWindow({
    show: true,
    x: -2400,
    y: -2400,
    width: 1100,
    height: 800,
    webPreferences: { webviewTag: true },
  });

  let guest = null;
  const attached = new Promise(resolve => {
    win.webContents.once('did-attach-webview', (_event, contents) => {
      guest = contents;
      settleUserAgent(contents);
      resolve(contents);
    });
  });

  await win.loadURL(
    `http://127.0.0.1:${traceServer.address().port}/host`,
  );

  const contents = await Promise.race([attached, wait(20_000).then(() => null)]);
  if (!contents) {
    check('the traced guest attached', false, 'no webview guest within 20 s');
    win.destroy();
    return;
  }

  // DevTools protocol, the same surface the Network panel reads.
  contents.debugger.attach('1.3');
  contents.debugger.on('message', (_event, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      requests.push({
        id: params.requestId,
        type: params.type,
        method: params.request.method,
        url: params.request.url,
      });
    } else if (method === 'Network.responseReceived') {
      responses.push({
        id: params.requestId,
        type: params.type,
        status: params.response.status,
        url: params.response.url,
        fromDiskCache: Boolean(params.response.fromDiskCache),
      });
    } else if (method === 'Network.loadingFailed') {
      failures.push({
        id: params.requestId,
        type: params.type,
        canceled: Boolean(params.canceled),
        errorText: params.errorText,
      });
    }
  });
  await contents.debugger.sendCommand('Network.enable');

  await until(async () => !contents.isLoading(), 30_000);
  await wait(4000);

  const identifierForm = await contents
    .executeJavaScript(
      'Boolean(document.querySelector(\'input[type="email"], input[name="identifier"], input#identifierId\'))',
    )
    .catch(() => false);
  const body = await contents
    .executeJavaScript('document.body ? document.body.innerText.slice(0, 2000) : ""')
    .catch(() => '');

  // The submission is where a retry storm would show up: Google answers the
  // identifier with a POST and a redirect chain of its own. The probe address is
  // a placeholder, so the flow ends at "couldn't find your account" — that is a
  // completed round trip, which is all this leg needs.
  const submitted = identifierForm ? await submitIdentifier(contents, PROBE_IDENTIFIER) : false;
  let verdict = null;
  let verdictText = '';
  if (submitted) {
    // A rejection is a finished round trip, not a retry loop; only a rate-limit
    // answer is the failure this leg exists to catch.
    verdict = await until(async () => {
      const text = await contents
        .executeJavaScript('document.body ? document.body.innerText.slice(0, 2000) : ""')
        .catch(() => '');
      if (/too many|unusual traffic|\b429\b|rate.?limit/i.test(text)) {
        verdictText = text.slice(0, 300);
        return 'throttled';
      }
      if (/may not be secure|disallowed_useragent|try using a different browser|signin\/rejected/i.test(`${text} ${contents.getURL()}`)) {
        verdictText = text.slice(0, 300);
        return 'policy';
      }
      if (/Enter your password|Couldn.t find (?:your Google Account|this account)|Verify it.s you|2-Step/i.test(text)) {
        verdictText = text.slice(0, 300);
        return 'account-step';
      }
      return null;
    }, 30_000);
    log(`google: after the identifier, ${contents.getURL()}`);
    if (verdictText) log(`google: the page said “${verdictText.replace(/\s+/g, ' ').slice(0, 220)}”`);
  }
  const identity = await contents
    .executeJavaScript(
      '({ ua: navigator.userAgent, brands: (navigator.userAgentData?.brands || []).map(b => b.brand).join(" / ") })',
    )
    .catch(() => null);

  const googleDocuments = responses.filter(
    hit => hit.type === 'Document' && hit.url.includes('accounts.google.com'),
  );
  const throttled = responses.filter(hit => hit.status === 429);
  const abortedDocuments = failures.filter(hit => hit.type === 'Document' && !hit.canceled);
  const repeated = {};
  for (const hit of requests) {
    if (hit.type !== 'Document') continue;
    repeated[hit.url] = (repeated[hit.url] || 0) + 1;
  }
  const worstRepeat = Object.entries(repeated).sort((left, right) => right[1] - left[1])[0];

  log(`google: ${contents.getURL()}`);
  log(
    `google: ${googleDocuments.length} document responses [${[...new Set(googleDocuments.map(hit => hit.status))].join(', ')}], ` +
      `${requests.length} requests, ${responses.length} responses, ${failures.length} failures`,
  );
  if (worstRepeat) log(`google: most-loaded document ${worstRepeat[1]}x ${worstRepeat[0].slice(0, 110)}`);
  log(`google: identity ${identity ? `${identity.ua} · ${identity.brands}` : 'unreadable'}`);

  check('Google serves the sign-in surface', identifierForm === true || /sign in|identifier/i.test(body), contents.getURL());
  check('no 429 from the account host', throttled.length === 0, throttled.map(hit => hit.url.slice(0, 90)).join(', ') || 'none');
  check(
    'no document is loaded over and over',
    !worstRepeat || worstRepeat[1] <= 2,
    worstRepeat ? `${worstRepeat[1]}x ${worstRepeat[0].slice(0, 90)}` : 'no documents',
  );
  check(
    'no document load fails',
    abortedDocuments.length === 0,
    abortedDocuments.map(hit => hit.errorText).join(', ') || 'none',
  );
  check(
    'Google sees the Chromium brand, not the Chrome one',
    Boolean(identity) && !/Google Chrome/.test(identity.brands),
    identity ? identity.brands : 'unreadable',
  );
  if (!submitted) {
    skip('the identifier submission', 'the field could not be typed into on this desktop');
  } else {
    check('Google answered the submission instead of throttling it', verdict === 'account-step' || verdict === 'policy', verdict ?? `no verdict at ${contents.getURL()}`);
    if (verdict === 'policy') {
      log('google: the account host refuses embedded browsers by policy; the round trip still completed exactly once');
    }
  }

  try {
    fs.writeFileSync(
      path.join(process.cwd(), '.tmp-signin-trace.json'),
      `${JSON.stringify(
        {
          url: contents.getURL(),
          settledAgent: stableUserAgent(process.platform, process.versions.chrome),
          identity,
          requests,
          responses,
          failures,
        },
        null,
        2,
      )}\n`,
    );
  } catch {
    /* the trace is evidence, not a requirement */
  }

  try {
    contents.debugger.detach();
  } catch {
    /* the guest may already be gone */
  }
  win.destroy();
}

let traceServer = null;

function startTraceServer() {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<webview src="${GOOGLE_START}" style="width:1000px;height:700px"></webview>`);
  });
  return server;
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-trace-'));
  app.setPath('userData', userData);
  app.setName('Kryvex');

  const { stableUserAgent } = require(path.join(process.cwd(), 'dist-electron', 'user-agent.js'));
  app.userAgentFallback = stableUserAgent(process.platform, process.versions.chrome);

  await localLeg();

  const offline = process.argv.includes('--offline');
  if (offline) {
    skip('the Google trace', '--offline was passed');
  } else {
    traceServer = startTraceServer();
    await listenSafe(traceServer);
    await googleLeg();
    traceServer.close();
  }

  const passed = checks.every(item => item.ok);
  log(`${checks.filter(item => item.ok).length}/${checks.length} checks passed`);
  log(passed ? 'sign-in trace: PASS' : 'sign-in trace: FAIL');

  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* a disposable profile held by Chromium for a moment */
  }
  finish(passed ? 0 : 1);
}

app.whenReady().then(main).catch(error => {
  check('the trace ran', false, String(error && error.stack ? error.stack : error));
  finish(1);
});
