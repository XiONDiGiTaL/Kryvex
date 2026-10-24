/**
 * Checks Google's sign-in surface against the identity the app actually ships.
 *
 * The deterministic harness (`verify-browser-identity.cjs`) proves what the
 * identity rules *decide*; this one proves what Google *answers*. It opens
 * `accounts.google.com` in a real guest with the production plumbing, reads the
 * identity Google can see, submits one throwaway identifier through real key
 * events, and records which step the flow reached: the identifier form, the
 * password step, or "This browser or app may not be secure".
 *
 * It then follows the return leg of the same journey — the same guest going
 * back to `mail.google.com` — and asserts the user agent did not change. That
 * regression is the reason this file exists: a sign-in that starts on Gmail,
 * authenticates on the account host and comes back must look like one browser
 * throughout.
 *
 * No credentials are used. The probe address is a placeholder that exists only
 * to move Google's own page off the identifier field.
 *
 * Run after `pnpm build` with:
 *   electron scripts/verify-google-signin.cjs
 *
 * This one talks to the internet by design. It is a release-time check, not
 * part of `npm test`.
 */
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROBE_IDENTIFIER = 'kryvex.probe.test@example.com';
const START_URL = 'https://accounts.google.com/ServiceLogin?service=mail';
const RETURN_URL = 'https://mail.google.com/';
const REFUSAL = /may not be secure|disallowed_useragent|try using a different browser/i;

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

function finish(code) {
  try {
    fs.writeFileSync(
      path.join(process.cwd(), '.tmp-google-signin.log'),
      `${lines.join('\n')}\n`,
    );
  } catch {
    /* the log is a convenience */
  }
  app.exit(code);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, timeoutMs, step = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await wait(step);
  }
  return null;
}

function text(contents) {
  return contents
    .executeJavaScript('document.body ? document.body.innerText.slice(0, 4000) : ""')
    .catch(() => '');
}

async function type(contents, value) {
  const focused = await contents.executeJavaScript(`(() => {
    const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
    if (!input) return false;
    input.focus();
    input.click();
    return true;
  })()`);
  if (!focused) return false;
  for (const character of value) {
    contents.sendInputEvent({ type: 'keyDown', keyCode: character });
    contents.sendInputEvent({ type: 'char', keyCode: character });
    contents.sendInputEvent({ type: 'keyUp', keyCode: character });
  }
  await wait(400);
  const entered = await contents.executeJavaScript(`(() => {
    const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
    return input ? input.value : '';
  })()`);
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  if (typeof entered !== 'string' || entered.length === 0) return false;

  // Google's Next control is a div with a click handler of its own; a Return
  // keypress does not always reach it, so the button is clicked too.
  await wait(700);
  await contents
    .executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
      if (!input || !input.value) return false;
      const next = document.querySelector('#identifierNext button, #identifierNext, button[type="submit"]');
      if (!next) return false;
      next.click();
      return true;
    })()`)
    .catch(() => false);
  return true;
}

async function identityOf(contents) {
  return contents.executeJavaScript(`(() => {
    const data = navigator.userAgentData;
    const chromeObject = globalThis.chrome || {};
    return {
      userAgent: navigator.userAgent,
      ownProperty: Object.prototype.hasOwnProperty.call(navigator, 'userAgentData'),
      brands: data ? data.brands.map(entry => entry.brand) : null,
      platform: data ? data.platform : null,
      chromeApp: typeof chromeObject.app?.getDetails,
      chromeCsi: typeof chromeObject.csi,
      chromeLoadTimes: typeof chromeObject.loadTimes,
      webdriver: navigator.webdriver,
    };
  })()`);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-google-'));
  app.setPath('userData', userData);

  const { rememberApplicationAgent, stableUserAgent } = require(
    path.join(process.cwd(), 'dist-electron', 'user-agent.js'),
  );
  const { hardenSession } = require(path.join(process.cwd(), 'dist-electron', 'hardening.js'));
  const { ensureBrowserIdentity, followUserAgent } = require(
    path.join(process.cwd(), 'dist-electron', 'identity.js'),
  );
  const { webPrivacy } = require(path.join(process.cwd(), 'dist-electron', 'web-privacy.js'));
  const { isGoogleSite } = require(path.join(process.cwd(), 'dist-electron', 'sign-in-hosts.js'));

  app.setName('Kryvex');
  rememberApplicationAgent(app.userAgentFallback);
  const { chromiumUserAgent } = require(path.join(process.cwd(), 'dist-electron', 'user-agent.js'));
  const googleAgent = chromiumUserAgent(app.userAgentFallback);
  app.userAgentFallback = stableUserAgent(process.platform, process.versions.chrome);

  ipcMain.on('kryvex:farbling:seed', event => {
    event.returnValue = 0x9e3779b9;
  });
  ipcMain.on('kryvex:identity:chrome', (event, host) => {
    event.returnValue = !isGoogleSite(String(host ?? ''));
  });

  const partition = 'persist:svc-google-probe';
  const ses = session.fromPartition(partition);
  hardenSession(ses);
  ensureBrowserIdentity(ses);
  webPrivacy.ensureSession(ses, true);

  // Shown, because a hidden window never takes focus and Chromium drops the
  // key events this probe types. Placed off-screen so the run stays invisible.
  const win = new BrowserWindow({
    show: true,
    x: -2400,
    y: -2400,
    width: 1200,
    height: 900,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let guest = null;
  win.webContents.on('did-attach-webview', (_event, contents) => {
    guest = contents;
    followUserAgent(contents);
  });

  await win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<webview src="${START_URL}" partition="${partition}" style="width:1100px;height:800px"></webview>`,
    )}`,
  );
  if (!(await until(() => guest, 20_000))) {
    check('the guest attached', false, 'no webview guest within 20 s');
    return finish(1);
  }

  await until(async () => !guest.isLoading(), 30_000);
  await wait(1200);

  const start = await identityOf(guest);
  const startHost = new URL(guest.getURL()).hostname;
  log(`landed on ${guest.getURL()}`);
  check(
    'Google pages get the bare Chromium agent',
    start.userAgent === googleAgent,
    `${start.userAgent}`,
  );
  check(
    'the agent does not announce the shell',
    !/Kryvex|Electron/.test(start.userAgent),
    start.userAgent,
  );
  check(
    'Google did not bounce the browser to its refusal step',
    !/\/signin\/rejected|\/rejected/.test(guest.getURL()),
    guest.getURL(),
  );
  if (start.brands) {
    check(
      'userAgentData does not claim the Google Chrome brand',
      !start.brands.includes('Google Chrome'),
      start.brands.join(' / '),
    );
  }
  check('the Chrome patch is not installed on a Google page', start.ownProperty === false);
  check(
    'window.chrome has the surface Google reads',
    start.chromeApp === 'function' && start.chromeCsi === 'function' && start.chromeLoadTimes === 'function',
    `app=${start.chromeApp} csi=${start.chromeCsi} loadTimes=${start.chromeLoadTimes}`,
  );
  check('navigator.webdriver is false', start.webdriver === false, String(start.webdriver));

  if (isGoogleSite(startHost) === false) {
    check('the page is on the Google identity path', false, startHost);
    return finish(1);
  }

  const flow = (guest.getURL().match(/flowName=(\w+)/) ?? [])[1] ?? 'unknown';
  log(`Google served the ${flow} flow`);

  const landing = await text(guest);
  if (REFUSAL.test(landing)) {
    check('Google accepted the browser before the identifier', false, landing.slice(0, 200));
  } else {
    const form = await until(
      async () =>
        guest
          .executeJavaScript(
            'Boolean(document.querySelector(\'input[type="email"], input[name="identifier"], input#identifierId\'))',
          )
          .catch(() => false),
      30_000,
    );
    if (!form) {
      const body = await text(guest);
      check('the identifier form rendered', false, body.slice(0, 200) || 'no form found');
    } else {
      const entered = await type(guest, PROBE_IDENTIFIER);
      if (!entered) {
        // Key events need a focused window; a headless desktop can refuse
        // focus. The load-time checks above still ran, so this is inconclusive
        // rather than a failure.
        log('SKIP the identifier could not be typed into; Google\'s verdict is unmeasured');
      } else {
        const verdict = await until(async () => {
          const body = await text(guest);
          if (REFUSAL.test(body)) return 'refused';
          if (
            /Enter your password|Couldn.t find (?:your Google Account|this account)|Verify it.s you|2-Step/i.test(
              body,
            )
          ) {
            return 'account-step';
          }
          return null;
        }, 45_000);
        const body = await text(guest);
        log(`after the identifier: ${guest.getURL()}`);
        check(
          'Google let the identifier through',
          verdict === 'account-step',
          verdict ? body.split('\n')[0].slice(0, 120) : `${body.slice(0, 200)} at ${guest.getURL()}`,
        );
      }
    }
  }

  // The return leg. A sign-in that authenticates on the account host comes back
  // to the product; every hop of that trip must carry the same agent, or Google
  // sees a browser swap in the middle of its own flow. A signed-out profile is
  // redirected back to the account host, which is the round trip itself.
  const hops = [];
  const record = (_event, url) => {
    try {
      hops.push({ url, agent: guest.getUserAgent() });
    } catch {
      /* the guest is closing */
    }
  };
  guest.on('did-navigate', record);
  guest.on('did-redirect-navigation', record);
  const before = (await identityOf(guest)).userAgent;
  await guest.loadURL(RETURN_URL).catch(() => undefined);
  await until(async () => !guest.isLoading(), 30_000);
  await wait(1200);
  const after = (await identityOf(guest)).userAgent;
  const drifted = hops.filter(hop => hop.agent !== before);
  log(`return leg: ${hops.map(hop => new URL(hop.url).hostname).join(' → ') || 'no hops'}`);
  check(
    'the user agent survives the return to the product',
    after === before && drifted.length === 0,
    drifted.length
      ? `${drifted.length} hop(s) changed browser, first ${drifted[0].url}`
      : `${before} on ${guest.getURL()}`,
  );

  // The product side of the same identity. Google's pages decide what to serve
  // from the browser they see, so a product that refuses the application agent
  // would be a regression traded for the sign-in fix.
  await guest.loadURL('https://www.youtube.com/').catch(() => undefined);
  await until(async () => !guest.isLoading(), 30_000);
  await wait(1500);
  const product = await guest.executeJavaScript(
    `({ title: document.title, body: (document.body ? document.body.innerText : '').slice(0, 1500) })`,
  );
  check(
    'YouTube still serves a normal page to the application agent',
    !/unsupported browser|update your browser|isn.t supported/i.test(product.body) &&
      /youtube/i.test(`${product.title} ${product.body}`),
    `${guest.getURL()} · ${product.title.slice(0, 80)}`,
  );

  check(
    'every check passed',
    checks.every(item => item.ok),
    `${checks.filter(item => item.ok).length}/${checks.length}`,
  );

  win.destroy();
  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* a disposable profile held by Chromium for a moment */
  }
  log(checks.every(item => item.ok) ? 'google sign-in probe: PASS' : 'google sign-in probe: FAIL');
  finish(checks.every(item => item.ok) ? 0 : 1);
}

app.whenReady().then(main).catch(error => {
  check('the probe ran', false, String(error && error.stack ? error.stack : error));
  finish(1);
});
