/**
 * Verifies that a guest page sees the same Chrome identity its user agent
 * claims: `navigator.userAgentData` with a Google Chrome brand, the matching
 * platform and high-entropy values, and Chrome's low-entropy `Sec-CH-UA`
 * headers on the wire. It also checks that the farbling wrappers still look
 * native to `Function.prototype.toString`, which is the cheapest way a page can
 * spot a patched browser.
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
    const high = ua && ua.getHighEntropyValues
      ? await ua.getHighEntropyValues(['fullVersionList','uaFullVersion','platform','platformVersion','architecture','bitness'])
      : null;
    const text = fn => { try { return Function.prototype.toString.call(fn); } catch (error) { return 'THREW ' + error; } };
    return {
      userAgent: navigator.userAgent,
      brands: ua ? ua.brands : null,
      mobile: ua ? ua.mobile : null,
      platform: ua ? ua.platform : null,
      high,
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
