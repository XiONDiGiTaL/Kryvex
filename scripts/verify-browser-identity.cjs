/**
 * Verifies that a guest page sees the same Chrome identity its user agent
 * claims: a native-shaped `NavigatorUAData` behind
 * `Navigator.prototype.userAgentData`, Google Chrome brands, the running
 * engine's full version, the matching platform, and Chrome's low-entropy
 * `Sec-CH-UA` headers on the wire. It also checks that the farbling wrappers
 * still look native to `Function.prototype.toString`, which is the cheapest way
 * a page can spot a patched browser, and that Google's account pages get no
 * farbling at all.
 *
 * Local only by design: a remote Google page can keep a Chromium child alive
 * and stop the process from exiting, so this harness never leaves loopback.
 *
 * Run after `pnpm build` with:
 *   electron scripts/verify-browser-identity.cjs
 */
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const lines = [];
function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function finish(code) {
  try {
    fs.writeFileSync(path.join(process.cwd(), '.tmp-identity.log'), `${lines.join('\n')}\n`);
  } catch {
    /* the log is a convenience */
  }
  app.exit(code);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-identity-'));
  app.setPath('userData', userData);

  const { stableUserAgent } = require(path.join(process.cwd(), 'dist-electron', 'user-agent.js'));
  app.userAgentFallback = stableUserAgent(process.platform, process.versions.chrome);
  const { hardenSession } = require(path.join(process.cwd(), 'dist-electron', 'hardening.js'));
  const { ensureBrowserIdentity } = require(path.join(process.cwd(), 'dist-electron', 'identity.js'));
  const { webPrivacy } = require(path.join(process.cwd(), 'dist-electron', 'web-privacy.js'));
  const { isGoogleSite, isSignInHost } = require(
    path.join(process.cwd(), 'dist-electron', 'sign-in-hosts.js'),
  );

  // The identity preload asks before it patches a page; Google is answered
  // with "no", everything else with "yes".

  let headers = {};
  const server = http.createServer((request, response) => {
    headers = request.headers;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><title>identity</title><canvas id="c" width="8" height="8"></canvas><p>identity probe</p>',
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  // The app answers this channel from main.ts so the preload can seed farbling
  // synchronously before page scripts run. A harness must do the same, or no
  // wrapper is installed and the toString check below proves nothing.
  ipcMain.on('kryvex:farbling:seed', event => {
    event.returnValue = 0x9e3779b9;
  });
  ipcMain.on('kryvex:identity:chrome', (event, host) => {
    event.returnValue = !isGoogleSite(String(host ?? ''));
  });

  const partition = 'persist:svc-identity-check';
  const ses = session.fromPartition(partition);
  hardenSession(ses);
  ensureBrowserIdentity(ses);
  webPrivacy.ensureSession(ses, true);

  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
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
  });
  await win.loadURL(
    `data:text/html,${encodeURIComponent(
      `<webview src="${origin}/" partition="${partition}" style="width:1000px;height:700px"></webview>`,
    )}`,
  );
  const deadline = Date.now() + 20_000;
  while (!guest && Date.now() < deadline) await wait(100);
  if (!guest) return fail('the webview guest never attached');
  while (guest.isLoading() && Date.now() < deadline) await wait(100);
  await wait(400);

  const identity = await guest.executeJavaScript(`(async () => {
    const ua = navigator.userAgentData;
    const chromeObject = globalThis.chrome || {};
    const own = Object.prototype.hasOwnProperty.call(navigator, 'userAgentData');
    const accessor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgentData');
    const high = ua && ua.getHighEntropyValues
      ? await ua.getHighEntropyValues(['fullVersionList','uaFullVersion','platform','platformVersion','architecture','bitness'])
      : null;
    const text = fn => { try { return Function.prototype.toString.call(fn); } catch (error) { return 'THREW ' + error; } };
    return {
      userAgent: navigator.userAgent,
      ownProperty: own,
      accessorOnPrototype: Boolean(accessor && typeof accessor.get === 'function'),
      constructorName: ua ? Object.getPrototypeOf(ua)?.constructor?.name : null,
      toStringTag: ua ? Object.prototype.toString.call(ua) : null,
      brands: ua ? ua.brands : null,
      mobile: ua ? ua.mobile : null,
      platform: ua ? ua.platform : null,
      high,
      chromeSurface: {
        app: typeof chromeObject.app?.getDetails,
        csi: typeof chromeObject.csi,
        loadTimes: typeof chromeObject.loadTimes,
        runtime: typeof chromeObject.runtime?.sendMessage,
      },
      webdriver: navigator.webdriver,
      wrappers: {
        canvasRead: text(CanvasRenderingContext2D.prototype.getImageData),
        canvasExport: text(HTMLCanvasElement.prototype.toDataURL),
        webgl: typeof WebGLRenderingContext === 'undefined' ? 'native code' : text(WebGLRenderingContext.prototype.readPixels),
        audio: text(AnalyserNode.prototype.getFloatFrequencyData),
      },
      farble: (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        context.fillStyle = 'rgb(10, 20, 30)';
        context.fillRect(0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let changed = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] !== 10 || data[index + 1] !== 20 || data[index + 2] !== 30) changed += 1;
        }
        return changed;
      })(),
    };
  })()`);

  if (/Electron/i.test(identity.userAgent)) return fail('the user agent still names Electron');
  if (!identity.brands) return fail('navigator.userAgentData is missing');
  const brands = identity.brands.map(brand => brand.brand);
  if (!brands.includes('Google Chrome')) return fail(`brands were ${brands.join(', ')}`);
  if (identity.mobile !== false) return fail('the mobile flag is wrong');
  const expected =
    process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  if (identity.platform !== expected) return fail(`platform was ${identity.platform}`);
  if (!identity.high?.uaFullVersion) return fail('getHighEntropyValues returned no version');
  if (identity.high.uaFullVersion !== process.versions.chrome) {
    return fail(`uaFullVersion was ${identity.high.uaFullVersion}, not the running ${process.versions.chrome}`);
  }
  for (const [name, kind] of Object.entries(identity.chromeSurface)) {
    if (kind !== 'function') return fail(`window.chrome.${name} is ${String(kind)}, not callable`);
  }
  if (identity.webdriver !== false) return fail('navigator.webdriver is not false');
  log('window.chrome exposes app, csi, loadTimes and runtime');
  if (identity.ownProperty) return fail('userAgentData is an own property, so the shim is visible');
  if (!identity.accessorOnPrototype) return fail('Navigator.prototype has no userAgentData accessor');
  if (identity.constructorName !== 'NavigatorUAData') {
    return fail(`the client-hint object is a ${identity.constructorName}`);
  }
  if (identity.toStringTag !== '[object NavigatorUAData]') {
    return fail(`Object.prototype.toString said ${identity.toStringTag}`);
  }
  if (!identity.high?.fullVersionList?.some(entry => entry.brand === 'Google Chrome')) {
    return fail('fullVersionList has no Google Chrome entry');
  }
  log(`guest identity: ${brands.join(' / ')} · ${identity.platform} · ${identity.high.uaFullVersion}`);

  const native = /^\s*function[\s\S]*\{\s*\[native code\]\s*\}\s*$/;
  for (const [name, value] of Object.entries(identity.wrappers)) {
    if (!native.test(String(value))) return fail(`the ${name} wrapper exposes its source`);
  }
  if (!(identity.farble > 0)) return fail('farbling was not active, so the wrapper check proved nothing');
  log(`farbling wrappers report native code and perturbed ${identity.farble} pixels`);

  if (!/Google Chrome/.test(String(headers['sec-ch-ua']))) {
    return fail(`Sec-CH-UA header was ${String(headers['sec-ch-ua'])}`);
  }
  if (headers['sec-ch-ua-mobile'] !== '?0') return fail('Sec-CH-UA-Mobile is missing');
  if (!headers['sec-ch-ua-platform']) return fail('Sec-CH-UA-Platform is missing');
  if (String(headers['user-agent']).includes('Electron')) return fail('the request UA names Electron');
  log(`wire headers: ${headers['sec-ch-ua']} · ${headers['sec-ch-ua-platform']}`);

  // Google's account pages are the one place the engine is left stock, so the
  // seed that drives the farbling preload must be zero there and only there.
  const guestSender = url => ({ getType: () => 'webview', getURL: () => url });
  const accountSeed = webPrivacy.fingerprintSeed(
    guestSender('https://accounts.google.com/ServiceLogin'),
    'https://accounts.google.com',
  );
  if (accountSeed !== 0) return fail(`a Google account page got farbling seed ${accountSeed}`);
  const pageSeed = webPrivacy.fingerprintSeed(guestSender(`${origin}/`), origin);
  if (pageSeed === 0) return fail('an ordinary page lost its farbling seed');
  if (isSignInHost('accounts.google.com') === false) return fail('the sign-in host rule is missing');
  log(`sign-in surface is stock; an ordinary page still has seed ${pageSeed}`);

  // One identity per site family: the account host and the product it returns
  // to must both leave the Chrome patch off, or a sign-in changes browser in
  // the middle of its own round trip.
  for (const host of ['accounts.google.com', 'mail.google.com', 'www.youtube.com', 'google.com']) {
    if (!isGoogleSite(host)) return fail(`${host} is not on the Google identity path`);
  }
  for (const host of ['example.com', 'notgoogle.com', 'accounts.google.com.evil.test']) {
    if (isGoogleSite(host)) return fail(`${host} claimed the Google identity`);
  }
  log('Google account and product hosts share one identity; every host keeps one settled agent');

  // Google's difference is the brand list on the wire, not a second user agent:
  // the engine never claims to be Google Chrome, and no agent carries the shell
  // tokens. One value is settled per guest, so a redirect cannot change it.
  const { withChromiumClientHints } = require(path.join(process.cwd(), 'dist-electron', 'privacy.js'));
  const bare = stableUserAgent(process.platform, process.versions.chrome);
  if (/Kryvex|Electron/.test(bare) || !/Chrome\//.test(bare)) {
    return fail(`the settled agent is ${bare}`);
  }
  const googleHints = withChromiumClientHints({}, process.versions.chrome);
  if (/Google Chrome/.test(googleHints['Sec-CH-UA'])) {
    return fail(`Google client hints claim Chrome: ${googleHints['Sec-CH-UA']}`);
  }
  log(`Settled agent: ${bare.replace(/^.*Gecko\) /, '')} · Google hints ${googleHints['Sec-CH-UA']}`);

  win.destroy();
  server.close();
  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* a disposable profile held by Chromium for a moment */
  }
  log('PASS browser identity, client hints and native-looking wrappers');
  finish(0);
}

app.whenReady().then(main).catch(error => fail(String(error && error.stack ? error.stack : error)));
