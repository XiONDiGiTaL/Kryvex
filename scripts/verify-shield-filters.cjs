/**
 * Verifies the shield's "My filters" path in a real Electron session:
 *   - the custom list is stored and counted,
 *   - it compiles on top of the downloaded lists,
 *   - a cosmetic rule hides the element on a live page,
 *   - a network rule stops the request before it leaves,
 *   - the YouTube bundle is part of the compiled engine.
 *
 * Needs the network once, for the filter lists. Run after `pnpm build` with:
 *   electron scripts/verify-shield-filters.cjs
 */
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const lines = [];
function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function summary() {
  try {
    fs.writeFileSync(path.join(process.cwd(), '.tmp-shield-verify.log'), `${lines.join('\n')}\n`);
  } catch {
    /* the log is a convenience */
  }
}

function finish(code) {
  summary();
  app.exit(code);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>shield test</title>
<style>body{font-family:sans-serif}</style></head>
<body>
  <h1>Shield test</h1>
  <div class="kryvex-custom-ad">custom ad</div>
  <div id="youtube-probe"></div>
  <script>
    // A scriptlet check with no network: the rule sets this global only when
    // the injected scriptlet ran.
    document.getElementById('youtube-probe').textContent =
      String(window.__kryvexScriptlet ?? 'none');
  </script>
</body></html>`;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-shield-'));
  app.setPath('userData', userData);

  let pixelHits = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/pixel.png') {
      pixelHits += 1;
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  log(`test page at ${origin}`);

  const { shield } = require(path.join(process.cwd(), 'dist-electron', 'shield.js'));
  shield.init();

  log('downloading filter lists…');
  const loaded = await shield.refresh();
  if (loaded.phase !== 'ready') {
    server.close();
    return fail(`lists did not load: ${loaded.phase} ${loaded.error ?? ''}`);
  }
  log(`engine ready with ${loaded.filters} network filters`);

  // Cosmetic rules are keyed by hostname, never host:port.
  const custom = [
    '! verification rules',
    '127.0.0.1##.kryvex-custom-ad',
    `||127.0.0.1:${port}/pixel.png`,
    '127.0.0.1##+js(set, __kryvexScriptlet, "ran")',
  ].join('\n');

  const applied = shield.setCustom({ text: custom, enabled: true, scriptlets: true });
  if (applied.error) return fail(`custom rules failed to compile: ${applied.error}`);
  if (applied.customRules !== 3) return fail(`expected 3 custom rules, got ${applied.customRules}`);
  if (applied.customLines !== 4) return fail(`expected 4 lines, got ${applied.customLines}`);
  if (applied.phase !== 'ready') return fail(`phase after rebuild: ${applied.phase}`);
  log(`custom list compiled offline from the cached download (${applied.customRules} rules)`);

  const gated = shield.setCustom({ scriptlets: false });    if (gated.customSkipped !== 1) return fail(`scriptlet gate skipped ${gated.customSkipped}`);
  if (gated.customRules !== 2) return fail(`expected 2 rules with the gate off, got ${gated.customRules}`);
  log('scriptlet rule held back while trust is off');
  shield.setCustom({ scriptlets: true });

  if (!shield.status().youtube) return fail('the YouTube bundle is not enabled by default');

  // The YouTube bundle uses uBO's `set` scriptlet on a config path; the
  // generated code must resolve that path for a page that uses it.
  const youtubeCode = shield.scriptletCode('https://www.youtube.com/');
  if (!youtubeCode.includes('yt.config_')) return fail('the YouTube scriptlets are missing');
  if (!youtubeCode.includes('false')) return fail('the YouTube scriptlets lost their value');
  if (shield.scriptletCode('https://example.com/') !== '') {
    return fail('scriptlets leaked to an unrelated site');
  }
  log('YouTube scriptlets target only youtube.com');

  const partition = 'persist:svc-shield-verify';
  const ses = session.fromPartition(partition);
  shield.trackSession(ses);

  // A real <webview> guest: cosmetic filters arrive through the session, and
  // scriptlets through the same hook the app installs on every service frame.
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  let guest = null;
  win.webContents.on('did-attach-webview', (_event, contents) => {
    guest = contents;
    shield.attachScriptlets(contents);
  });
  const host = `data:text/html,${encodeURIComponent(
    `<webview src="${origin}/" partition="${partition}" style="width:820px;height:620px"></webview>`,
  )}`;
  await win.loadURL(host);
  const deadline = Date.now() + 15000;
  while (!guest && Date.now() < deadline) await wait(100);
  if (!guest) return fail('the webview guest never attached');
  while (guest.isLoading() && Date.now() < deadline) await wait(100);
  await wait(1200);

  const hidden = await guest.executeJavaScript(
    `(() => { const el = document.querySelector('.kryvex-custom-ad');
      return el ? getComputedStyle(el).display === 'none' : false; })()`,
  );
  if (!hidden) return fail('the custom cosmetic rule did not hide the element');
  log('custom cosmetic rule hid the element');

  const scriptlet = await guest.executeJavaScript(
    `Promise.resolve(window.__kryvexScriptlet).then(value => String(value))`,
  );
  if (scriptlet !== 'ran') return fail(`the scriptlet did not run (got "${scriptlet}")`);
  log('custom scriptlet ran in the page');

  // The YouTube client is generated code that runs in a page, not just a
  // string. Execute it in the guest so a syntax or API mistake fails here.
  const youtubeRuntime = await guest.executeJavaScript(
    `(() => { ${shield.scriptletCode('https://www.youtube.com/')}
      return String(window.__kryvexYouTubeAds); })()`,
  );
  if (youtubeRuntime !== 'running') {
    return fail(`the YouTube client did not install (got "${youtubeRuntime}")`);
  }
  log('YouTube ad client installed in a real guest');

  // The blocking engine also handles subresources.
  await guest.executeJavaScript(
    `new Promise(resolve => { const img = new Image(); img.src = '${origin}/pixel.png?cache=' + Math.random();
      img.onload = img.onerror = () => resolve(true); setTimeout(() => resolve(true), 1500); })`,
  );
  await wait(400);
  if (pixelHits !== 0) return fail(`the network rule let ${pixelHits} request(s) through`);
  log('custom network rule blocked the request');

  const hadEngineError = shield.status().error;
  if (hadEngineError) return fail(`engine reported ${hadEngineError}`);

  const cleared = shield.setCustom({ text: '', enabled: true });
  if (cleared.customRules !== 0) return fail('clearing the editor left rules behind');
  log('editor cleared; engine rebuilt');

  win.destroy();
  server.close();
  try {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // Chromium can still hold a file for a moment; the profile is disposable.
  }
  log('PASS shield custom filters, scriptlet gate and YouTube bundle');
  finish(0);
}

app.whenReady().then(main).catch(error => fail(String(error && error.stack ? error.stack : error)));
