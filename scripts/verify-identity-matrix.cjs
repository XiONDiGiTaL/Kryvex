/**
 * Measures which browser identity Google's sign-in accepts, today.
 *
 * Google's account pages answer a browser differently depending on what it
 * claims to be, and the answer is not guessable: it has changed twice in this
 * project's history. This harness asks the real page, one partition per variant,
 * one throwaway identifier each, and prints what came back.
 *
 *   application       the shell's own agent (what 0.8.9 shipped)
 *   chrome-bare       reduced Chrome agent and hints, without window.chrome
 *   chromium-bare     the bare Chromium agent and hints, without window.chrome
 *   chrome-surface    the Chrome claim with chrome.app, csi, loadTimes
 *   chromium-surface  the Chromium agent with the same surface (what 0.9.0 ships)
 *
 * "accepted" means Google let the browser into its sign-in; the flow name says
 * which one it served — `GlifWebSignIn` is the regular desktop flow, and
 * `WebLiteSignIn` is the reduced one it gives a browser it will not let finish.
 *
 * No credentials are used: the identifier is a placeholder, so the expected
 * answer for an accepted browser is "Couldn't find this account".
 *
 * Run after `pnpm build` with:
 *   electron scripts/verify-identity-matrix.cjs
 *
 * This one talks to the internet by design. It is a release-time check, not part
 * of `npm test`.
 */
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROBE = 'kryvex.probe.test@example.com';
const START = 'https://accounts.google.com/ServiceLogin?service=mail';
const REFUSED = /may not be secure|disallowed_useragent|try using a different browser/i;
const ACCOUNT = /Couldn.t find|Enter your password|Verify it.s you|2-Step|Try again|captcha/i;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const lines = [];
function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

/** A patch with its brands baked in, so it matches the headers exactly. */
function preloadSource(mode, brands, fullBrands) {
  return `const { contextBridge } = require('electron');
contextBridge.executeInMainWorld({
  func: (mode, brands, fullBrands, platform) => {
    class NavigatorUAData {
      get brands() { return brands; }
      get mobile() { return false; }
      get platform() { return platform; }
      getHighEntropyValues(hints) {
        const out = { brands, mobile: false, platform };
        for (const hint of Array.isArray(hints) ? hints : []) {
          if (hint === 'fullVersionList') out.fullVersionList = fullBrands;
          if (hint === 'uaFullVersion') out.uaFullVersion = fullBrands[1].version;
          if (hint === 'platformVersion') out.platformVersion = '15.0.0';
          if (hint === 'architecture') out.architecture = 'x86';
          if (hint === 'bitness') out.bitness = '64';
          if (hint === 'model') out.model = '';
          if (hint === 'wow64') out.wow64 = false;
        }
        return Promise.resolve(out);
      }
      toJSON() { return { brands, mobile: false, platform }; }
    }
    const data = new NavigatorUAData();
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      configurable: true, enumerable: true, get() { return data; },
    });
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      configurable: true, enumerable: true, get() { return false; },
    });
    if (mode === 'surface') {
      const chrome = globalThis.chrome || {};
      chrome.app = chrome.app || {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: () => null,
        getIsInstalled: () => false,
      };
      chrome.csi = chrome.csi || (() => ({ onloadT: Date.now(), startE: Date.now(), frameId: 1, pageT: 12.5, tran: 15 }));
      chrome.loadTimes = chrome.loadTimes || (() => ({
        commitLoadTime: Date.now() / 1000,
        connectionInfo: 'h2',
        finishDocumentLoadTime: Date.now() / 1000,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
      }));
      chrome.runtime = chrome.runtime || {
        id: undefined,
        connect() { throw new Error('Could not establish connection. Receiving end does not exist.'); },
        sendMessage() { throw new Error('Could not establish connection. Receiving end does not exist.'); },
      };
      globalThis.chrome = chrome;
    }
  },
  args: [${JSON.stringify(mode)}, ${JSON.stringify(brands)}, ${JSON.stringify(fullBrands)}, 'Windows'],
});
`;
}

function withBrands(headers, brands) {
  const next = { ...headers };
  for (const name of Object.keys(next)) {
    if (/^sec-ch-ua/i.test(name)) delete next[name];
  }
  next['Sec-CH-UA'] = brands;
  next['Sec-CH-UA-Mobile'] = '?0';
  next['Sec-CH-UA-Platform'] = '"Windows"';
  return next;
}

async function readPage(guest) {
  return guest
    .executeJavaScript(
      `(() => ({ url: location.href, body: document.body ? document.body.innerText.slice(0, 3000) : '' }))()`,
    )
    .catch(() => ({ url: '', body: '' }));
}

async function verdict(guest) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const state = await readPage(guest);
    if (/\/rejected/.test(state.url) || REFUSED.test(state.body)) {
      return { verdict: 'refused', ...state };
    }
    if (ACCOUNT.test(state.body)) return { verdict: 'accepted', ...state };
    await wait(500);
  }
  return { verdict: 'unresolved', ...(await readPage(guest)) };
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-matrix-'));
  app.setPath('userData', profile);
  app.setName('Kryvex');

  const nativeAgent = app.userAgentFallback;
  const chromiumAgent = nativeAgent
    .replace(/\s*Kryvex\/[\d.]+/i, '')
    .replace(/\s*Electron\/[\d.]+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const reduced = chromiumAgent.replace(/Chrome\/[\d.]+/, 'Chrome/152.0.0.0');
  const chromeBrands = '"Google Chrome";v="152", "Chromium";v="152", "Not(A:Brand";v="24"';
  const chromiumBrands = '"Not?A_Brand";v="24", "Chromium";v="152"';
  const chromeFull = [
    { brand: 'Google Chrome', version: '152.0.0.0' },
    { brand: 'Chromium', version: '152.0.0.0' },
    { brand: 'Not(A:Brand', version: '24.0.0.0' },
  ];
  const chromiumFull = [
    { brand: 'Not?A_Brand', version: '24.0.0.0' },
    { brand: 'Chromium', version: '152.0.0.0' },
  ];

  const variants = [
    { id: 'application', agent: nativeAgent, brands: null, preload: null },
    { id: 'chrome-bare', agent: reduced, brands: chromeBrands, preload: null },
    { id: 'chromium-bare', agent: chromiumAgent, brands: chromiumBrands, preload: null },
    {
      id: 'chrome-surface',
      agent: reduced,
      brands: chromeBrands,
      preload: {
        mode: 'surface',
        brands: [
          { brand: 'Google Chrome', version: '152' },
          { brand: 'Chromium', version: '152' },
          { brand: 'Not(A:Brand', version: '24' },
        ],
        full: chromeFull,
      },
    },
    {
      id: 'chromium-surface',
      agent: chromiumAgent,
      brands: chromiumBrands,
      preload: {
        mode: 'surface',
        brands: [
          { brand: 'Not?A_Brand', version: '24' },
          { brand: 'Chromium', version: '152' },
        ],
        full: chromiumFull,
      },
    },
  ];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-preloads-'));
  for (const variant of variants) {
    if (!variant.preload) continue;
    variant.preloadFile = path.join(dir, `${variant.id}.js`);
    fs.writeFileSync(
      variant.preloadFile,
      preloadSource(variant.preload.mode, variant.preload.brands, variant.preload.full),
    );
  }

  const win = new BrowserWindow({
    show: true,
    x: -2600,
    y: -2600,
    width: 1200,
    height: 900,
    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL('data:text/html,<title>matrix</title><body></body>');

  let guest = null;
  win.webContents.on('did-attach-webview', (_event, contents) => {
    guest = contents;
  });

  const results = [];
  for (const variant of variants) {
    const partition = `persist:probe-${variant.id}`;
    const ses = session.fromPartition(partition);
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: variant.brands
          ? withBrands(details.requestHeaders, variant.brands)
          : { ...details.requestHeaders },
      });
    });
    if (variant.preloadFile) {
      ses.registerPreloadScript({
        type: 'frame',
        id: `probe-${variant.id}`,
        filePath: variant.preloadFile,
      });
    }

    guest = null;
    // A webview declared in the host document attaches; one appended by the host
    // page's own script does not.
    await win.loadURL(
      `data:text/html,${encodeURIComponent(
        `<webview id="g" src="${START}" partition="${partition}" style="width:1100px;height:800px"></webview>`,
      )}`,
    );
    const deadline = Date.now() + 15_000;
    while (!guest && Date.now() < deadline) await wait(100);
    if (!guest) {
      log(`${variant.id}: the guest never attached`);
      results.push({ id: variant.id, verdict: 'no-guest', surface: '?', flow: '?' });
      continue;
    }
    guest.setUserAgent(variant.agent);
    await wait(1800);

    const seen = await guest
      .executeJavaScript(
        `(() => {
          const data = navigator.userAgentData;
          return {
            url: location.href,
            agent: navigator.userAgent,
            brands: data ? data.brands.map(entry => entry.brand).join('/') : null,
            surface: typeof (globalThis.chrome && globalThis.chrome.app) === 'object',
            input: Boolean(document.querySelector('input[type="email"], input[name="identifier"], input#identifierId')),
          };
        })()`,
      )
      .catch(() => ({}));

    if (seen.input) {
      win.focus();
      guest.focus();
      await guest
        .executeJavaScript(`(() => {
          const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
          input.focus();
          input.click();
          return true;
        })()`)
        .catch(() => undefined);
      for (const character of PROBE) {
        guest.sendInputEvent({ type: 'keyDown', keyCode: character });
        guest.sendInputEvent({ type: 'char', keyCode: character });
        guest.sendInputEvent({ type: 'keyUp', keyCode: character });
      }
      await wait(500);
      guest.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      guest.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await wait(900);
      await guest
        .executeJavaScript(`(() => {
          const input = document.querySelector('input[type="email"], input[name="identifier"], input#identifierId');
          if (!input || !input.value) return false;
          const next = document.querySelector('#identifierNext button, #identifierNext, button[type="submit"]');
          if (!next) return false;
          next.click();
          return true;
        })()`)
        .catch(() => undefined);
    }

    const outcome = await verdict(guest);
    // A refusal never reaches a flow of its own, so only an accepted variant has
    // a flow name worth reporting.
    const flow =
      outcome.verdict === 'accepted'
        ? (outcome.url.match(/flowName=(\w+)/) ?? [])[1] ?? '—'
        : '—';
    log(
      `${variant.id.padEnd(17)} ${outcome.verdict.padEnd(11)} ${String(flow).padEnd(15)} ` +
        `surface=${seen.surface ? 'yes' : 'no '} agent=${String(seen.agent).replace(/^.*Gecko\) /, '')}`,
    );
    results.push({
      id: variant.id,
      verdict: outcome.verdict,
      flow,
      surface: seen.surface ? 'present' : 'absent',
      agent: seen.agent,
      url: outcome.url,
    });
    await wait(1000);
  }

  log('---');
  const table = results.map(item => `${item.id.padEnd(17)} ${item.verdict.padEnd(11)} ${item.flow}`);
  for (const row of table) log(row);

  const unresolved = results.filter(item => item.verdict === 'unresolved' || item.verdict === 'no-guest');
  log(unresolved.length === 0 ? 'identity matrix: PASS (every variant got an answer)' : 'identity matrix: FAIL');

  try {
    fs.writeFileSync(
      path.join(process.cwd(), '.tmp-identity-matrix.json'),
      `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 1)}\n`,
    );
  } catch {
    /* the report is a convenience */
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* a disposable profile held by Chromium for a moment */
  }
  win.destroy();
  fs.writeFileSync(path.join(process.cwd(), '.tmp-identity-matrix.log'), `${lines.join('\n')}\n`);
  app.exit(unresolved.length === 0 ? 0 : 1);
}

app.whenReady().then(main).catch(error => {
  log(`FAIL ${error && error.stack ? error.stack : error}`);
  app.exit(1);
});
