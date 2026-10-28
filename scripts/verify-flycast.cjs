/* eslint-disable no-console */
/**
 * Measured proof for the second engine — not a Dreamcast player.
 *
 * The engine Kryvex's cartridge slot uses publishes no Dreamcast core, so the
 * only route to the format is a second engine. This harness answers the two
 * questions that come before a claim:
 *
 *   --core (default)  does the pinned binary load, instantiate and start in the
 *                     same Chromium Kryvex runs in, with nothing but a canvas
 *                     and a parent element?
 *   --frontend        when the app's own packer turns that binary into the
 *                     archive the real frontend expects, does the frontend
 *                     accept it, evaluate it and instantiate the core?
 *
 * The release is downloaded, never bundled: the same arm's-length position the
 * other emulator's cores keep. Every file is checked against a pinned size and
 * SHA-256 before it is used, so the numbers below describe one fixed build.
 *
 * No BIOS and no game image are included or downloaded, so **gameplay is not
 * measured**, and this script does not claim to. A junk image is passed to the
 * core to prove the code path reaches it, not to boot anything.
 *
 *   node scripts/verify-flycast.cjs              # bare host, with COOP/COEP
 *   node scripts/verify-flycast.cjs --plain      # bare host, no isolation
 *   node scripts/verify-flycast.cjs --frontend   # through the real frontend
 *   node scripts/verify-flycast.cjs --keep       # keep the temp workspace
 */
const { execFileSync } = require('node:child_process');
const { app, BrowserWindow } = require('electron');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const RELEASE = 'https://github.com/nasomers/flycast-wasm/releases/download/v1.0';
const ASSETS = [
  {
    name: 'flycast_libretro.js',
    bytes: 312644,
    sha256: '1f2ae9afafa85c8ff577ca3961be0343c2ac394ddc79285981f0d55ad75dbd7b',
  },
  {
    name: 'flycast_libretro.wasm',
    bytes: 10398725,
    sha256: 'db2b87d8d2742087a56c4eeed317da14e3549ee037e36de3d77c1e6e5291bead',
  },
];
/** The core asks for this name; the release asset is called something else. */
const WASM_ALIAS = 'flycast_libretro_upstream.wasm';
const PORT = Number(process.env.KRYVEX_FLYCAST_PORT || 9411);
const plain = process.argv.includes('--plain');
const keep = process.argv.includes('--keep');
const frontend = process.argv.includes('--frontend');
const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
  '.cdi': 'application/octet-stream',
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-flycast-'));
const core = path.join(work, 'core');
let server = null;
/** The most recent proof the page posted, which survives a blocked thread. */
let lastReport = null;
/** Which files the page actually asked this harness for. */
const hits = {};

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchAsset(asset) {
  const file = path.join(core, asset.name);
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    if (bytes.length === asset.bytes && digest(bytes) === asset.sha256) return file;
  }
  console.log(`fetching ${asset.name} (${asset.bytes} bytes)`);
  const response = await fetch(asset.url ?? `${RELEASE}/${asset.name}`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== asset.bytes) {
    throw new Error(`${asset.name}: expected ${asset.bytes} bytes, got ${bytes.length}`);
  }
  if (digest(bytes) !== asset.sha256) {
    throw new Error(`${asset.name}: sha256 does not match the pinned release`);
  }
  fs.writeFileSync(file, bytes);
  return file;
}

/**
 * The app's own packer, compiled for Node.
 *
 * A second copy of the zip writer here would prove nothing about the code the
 * app actually runs, so this compiles `src/lib/flycast.ts` with the project's
 * TypeScript and calls `flycastCoreZip`. If the packer is wrong, this fails
 * the same way the app would.
 */
function packerModule() {
  const out = path.join(work, 'packer');
  // `process.execPath` is Electron here, and Electron cannot run the compiler
  // CLI; the npm-provided node binary can. Running under pnpm sets it, and a
  // plain `node script` run already has `node` on the path.
  const node = process.env.npm_node_execpath || 'node';
  const compiled = execFileSync(
    node,
    [
      // TypeScript's "exports" map does not expose bin/tsc, so the CLI is
      // located relative to the compiler entry point that does resolve.
      path.join(path.dirname(require.resolve('typescript')), '..', 'bin', 'tsc'),
      '--outDir',
      out,
      '--module',
      'commonjs',
      '--target',
      'es2022',
      '--skipLibCheck',
      // The project has a tsconfig; naming a file on the command line makes
      // the compiler refuse to run unless it is told to ignore it.
      '--ignoreConfig',
      path.join(__dirname, '..', 'src', 'lib', 'flycast.ts'),
    ],
    { encoding: 'utf8' },
  );
  if (!fs.existsSync(path.join(out, 'flycast.js'))) {
    throw new Error(`the packer could not be compiled: ${compiled}`);
  }
  // eslint-disable-next-line import/no-dynamic-require
  return require(path.join(out, 'flycast.js'));
}

function packCore(zipPath) {
  const packer = packerModule();
  const zip = packer.flycastCoreZip({
    js: new Uint8Array(fs.readFileSync(path.join(core, 'flycast_libretro.js'))),
    wasm: new Uint8Array(fs.readFileSync(path.join(core, 'flycast_libretro.wasm'))),
  });
  fs.writeFileSync(zipPath, zip);
  return zip;
}

function page() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>flycast wasm proof</title></head>
<body><div id="host"><canvas id="screen" width="640" height="480"></canvas></div>
<script src="./core/flycast_libretro.js"></script>
<script>
window.__proof = { steps: [], errors: [], isolated: self.crossOriginIsolated };
function note(name, value) {
  // Latest value wins: the report is read after the fact, and a tick that ran
  // before the frontend existed must not shadow the one that ran after it.
  const steps = window.__proof.steps;
  const at = steps.findIndex(item => item.name === name);
  if (at >= 0) steps[at].value = value; else steps.push({ name, value });
}
window.addEventListener('error', event => window.__proof.errors.push(String(event.message)));
window.addEventListener('unhandledrejection', event => window.__proof.errors.push(String(event.reason)));
(async () => {
  const started = performance.now();
  const canvas = document.getElementById('screen');
  let module;
  try {
    const result = EJS_Runtime({
      canvas,
      // Emscripten maps the core's '!parent' query to Module.parent, and the
      // core asks for it while starting. EmulatorJS passes its container; a
      // bare host has to pass one too, or querySelector('!parent') throws.
      parent: document.getElementById('host'),
      arguments: [],
      // The frontend also supplies these two, and the core calls them through
      // its import table; without them the call lands on a null entry.
      getSavExt: () => '.srm',
      callbacks: { setupCoreSettingFile: () => {} },
      print: () => {},
      printErr: () => {},
    });
    module = result && typeof result.then === 'function' ? await result : result;
  } catch (error) {
    note('instantiate-failed', String((error && error.message) || error));
    window.__done = true;
    return;
  }
  note('instantiated-ms', Math.round(performance.now() - started));
  note('exports', Object.keys(module).filter(key => typeof module[key] === 'function').length);
  note('heap-mb', module.HEAP8 ? Math.round(module.HEAP8.length / 1048576) : null);
  note('has-main', typeof module._main);
  try {
    note('fs', module.FS ? 'present' : 'absent');
    if (module.FS) module.FS.writeFile('/probe.chd', new Uint8Array(65536));
  } catch (error) {
    note('fs-error', String((error && error.message) || error));
  }
  note('main-called', Math.round(performance.now()));
  setTimeout(() => {
    try {
      module.callMain(['/probe.chd']);
      note('main-returned', Math.round(performance.now()));
    } catch (error) {
      note('main-error', String((error && error.message) || error));
    }
  }, 50);
  window.__done = true;
})();
</script></body></html>`;
}

/**
 * The real frontend, driven the way the app drives it.
 *
 * The globals, the zip override and the report override are the same ones the
 * emulator frame sets; only the transport differs (a loopback server instead of
 * a postMessage from the shell). The junk image is small enough that the
 * failure, when it comes, comes from the core and not from the loader.
 */
function frontendPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>flycast frontend proof</title>
<style>html,body{margin:0;background:#07090c;color:#9be9c8;font:12px monospace}#game{width:640px;height:480px;display:flex;align-items:center;justify-content:center}</style>
</head>
<body>
<div id="game"></div>
<script>
window.__proof = { steps: [], errors: [], isolated: self.crossOriginIsolated };
function note(name, value) {
  // Latest value wins: the report is read after the fact, and a tick that ran
  // before the frontend existed must not shadow the one that ran after it.
  const steps = window.__proof.steps;
  const at = steps.findIndex(item => item.name === name);
  if (at >= 0) steps[at].value = value; else steps.push({ name, value });
}
window.addEventListener('error', event => window.__proof.errors.push(String(event.message)));
window.addEventListener('unhandledrejection', event => window.__proof.errors.push(String(event.reason)));

window.EJS_player = '#game';
window.EJS_core = 'flycast';
window.EJS_gameName = 'probe.cdi';
window.EJS_gameID = 7;
window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
window.EJS_startOnLoaded = true;
window.EJS_settingsLanguage = 'en-US';
// The same option the shell sends for a second engine: the frontend picks the
// plain build over the legacy one from this setting.
window.EJS_defaultOptions = { 'save-state-location': 'browser', webgl2Enabled: 'enabled' };
window.EJS_onGameStart = () => note('frontend-start', Math.round(performance.now()));

(async () => {
  const zip = await (await fetch('/core.zip')).arrayBuffer();
  note('zip-bytes', zip.byteLength);
  const zipUrl = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  window.EJS_paths = {
    'flycast-wasm.data': zipUrl,
    'flycast-legacy-wasm.data': zipUrl,
  };
  const image = await (await fetch('/probe.cdi')).arrayBuffer();
  window.EJS_gameUrl = URL.createObjectURL(new Blob([image]));

  // The core runs its emulation loop on this thread once it starts, so nothing
  // here can be read back through a debugger afterwards. Each tick posts what
  // is known *now* to the harness; the last report that arrived is the answer.
  setInterval(() => {
    if (window.EJS_Runtime) note('runtime-defined', true);
    const emulator = window.EJS_emulator;
    if (emulator && emulator.coreName) note('core-name', emulator.coreName);
    if (emulator && emulator.Module) {
      note('module-instantiated', true);
      note('module-exports', Object.keys(emulator.Module).filter(key => typeof emulator.Module[key] === 'function').length);
    }
    note('paths', Object.keys(window.EJS_paths || {}).join(','));
    const filePaths = emulator && emulator.config && emulator.config.filePaths;
    note('config-file-paths', filePaths ? Object.keys(filePaths).join(',') : 'none');
    note('webgl2', emulator && typeof emulator.webgl2Enabled !== 'undefined' ? emulator.webgl2Enabled : 'unknown');
    note('tick', Date.now());
    fetch('/report', { method: 'POST', body: JSON.stringify(window.__proof) }).catch(() => {});
  }, 150);

  const script = document.createElement('script');
  script.src = window.EJS_pathtodata + 'loader.js';
  script.onerror = () => note('loader-failed', true);
  document.body.appendChild(script);
})();
</script></body></html>`;
}

function serve() {
  return new Promise(resolve => {
    server = http.createServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
      const name = url.pathname === '/' ? '/index.html' : url.pathname;
      hits[name] = (hits[name] ?? 0) + 1;
      if (name === '/report') {
        // The page posts its proof while the core holds the renderer thread, so
        // the last report that arrives is read here instead of through a
        // debugger that can no longer run. This has to come before the file
        // lookup: there is no file called report.
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
          try {
            lastReport = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* a truncated tick is not a failure */
          }
          response.writeHead(204).end();
        });
        return;
      }
      // Serve only from the workspace the harness made for itself.
      const target = path.normalize(path.join(work, name));
      if (!target.startsWith(work) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        response.writeHead(404).end('not found');
        return;
      }
      const headers = {
        'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Length': fs.statSync(target).size,
      };
      // The frontend mode is a plain origin on purpose: it loads the frontend
      // from its CDN with a script tag, which COEP would block. The app's frame
      // is a sandboxed srcdoc document for the same reason.
      if (!plain && !frontend) Object.assign(headers, HEADERS);
      response.writeHead(200, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(target).pipe(response);
    });
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

function launch() {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 700,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const messages = [];
  win.webContents.on('console-message', event => {
    const text = String(event.message).slice(0, 240);
    if (Number(event.level) >= 2) messages.push(text);
    // Debugging a harness that may never report is easier with the page's own
    // voice; the summary still prints the collected lines at the end.
    if (process.env.KRYVEX_FLYCAST_VERBOSE) console.log(`page: ${text}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    messages.push(`load failed ${code} ${description} ${url}`);
    if (process.env.KRYVEX_FLYCAST_VERBOSE) console.log(`load failed: ${code} ${description} ${url}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    messages.push(`renderer gone: ${details.reason} (exit ${details.exitCode})`);
  });
  return { win, messages };
}

async function poll(win, expression, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const value = await win.webContents.executeJavaScript(expression);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return null;
}

async function main() {
  fs.mkdirSync(core, { recursive: true });
  for (const asset of ASSETS) await fetchAsset(asset);
  fs.copyFileSync(path.join(core, 'flycast_libretro.wasm'), path.join(core, WASM_ALIAS));

  if (frontend) {
    const zip = packCore(path.join(work, 'core.zip'));
    fs.writeFileSync(path.join(work, 'probe.cdi'), Buffer.alloc(65536));
    fs.writeFileSync(path.join(work, 'index.html'), frontendPage());
    console.log(`packed core: ${zip.length} bytes`);
  } else {
    fs.writeFileSync(path.join(work, 'index.html'), page());
  }

  await serve();
  await app.whenReady();
  const { win, messages } = launch();
  await win.loadURL(`http://127.0.0.1:${PORT}/index.html`);

  if (frontend) {
    // Nothing is read back over the debugger here: once EmulatorJS calls the
    // core's main, the renderer thread belongs to the emulator loop and an
    // evaluate never returns. The page posts what it knows on a timer instead,
    // and the last report is the answer.
    const deadline = Date.now() + 75_000;
    while (Date.now() < deadline) {
      if (lastReport) {
        const steps = lastReport.steps ?? [];
        if (
          steps.some(item => item.name === 'module-instantiated') ||
          steps.some(item => item.name === 'loader-failed') ||
          steps.some(item => item.name === 'instantiate-failed')
        ) {
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // One more interval, so a report written just before the loop took the
    // thread is the one that is read.
    await new Promise(resolve => setTimeout(resolve, 1500));
    const latest = lastReport;
    win.destroy();
    server.close();
    if (!latest) throw new Error('the page never reported; the frontend did not start');
    const steps = latest.steps ?? [];
    const instantiated = steps.some(item => item.name === 'module-instantiated');
    // A second, independent signal: the frontend asked for the archive this
    // script generated, and the core then ran — the junk image is what aborts,
    // not the loader. Without content a clean start is impossible, so an abort
    // from the core is the expected end of a successful run.
    const coreRan = (hits['/core.zip'] ?? 0) > 0 && messages.some(line => /Aborted|RuntimeError/.test(line));
    report(latest, messages, { instantiated, coreRan });
    const failure = steps.find(item => item.name === 'instantiate-failed');
    if (failure) throw new Error(`the core did not instantiate: ${failure.value}`);
    if (!instantiated && !coreRan) {
      throw new Error('the frontend never instantiated the packed core');
    }
    return;
  }

  const proof = await poll(win, 'window.__done ? window.__proof : null', 60_000);
  if (!proof) throw new Error('the page never reported; the renderer may have crashed');
  // Main runs on its own timer, so give it room to return or to take the thread.
  await new Promise(resolve => setTimeout(resolve, 4000));
  const steps = await Promise.race([
    win.webContents.executeJavaScript('JSON.stringify(window.__proof.steps)'),
    new Promise(resolve => setTimeout(() => resolve(null), 6000)),
  ]);
  const latest = { ...proof, steps: steps ? JSON.parse(steps) : proof.steps };
  report(latest, messages);
  win.destroy();
  server.close();
  const failure = latest.steps.find(item => item.name === 'instantiate-failed');
  if (failure) throw new Error(`the core did not instantiate: ${failure.value}`);
}

function report(proof, messages, extra = {}) {
  const step = name => proof.steps.find(item => item.name === name);
  const failed = step('instantiate-failed');
  console.log('');
  console.log(`isolation: ${proof.isolated ? 'cross-origin isolated' : 'not isolated'}`);
  if (frontend) {
    console.log(`payload: ${step('zip-bytes')?.value ?? '—'} bytes, from the app's own packer`);
    console.log(`core archive requested: ${hits['/core.zip'] ?? 0} time(s)`);
    console.log(`core name: ${step('core-name')?.value ?? '—'}`);
    console.log(`runtime: ${step('runtime-defined') ? 'EJS_Runtime defined from the packed zip' : 'not caught by a page tick'}`);
    console.log(
      `module: ${step('module-instantiated') ? `instantiated (${step('module-exports')?.value ?? '—'} exports)` : 'not caught by a page tick'}`,
    );
    console.log(`paths: ${step('paths')?.value ?? '—'} / config: ${step('config-file-paths')?.value ?? '—'}, webgl2: ${step('webgl2')?.value}`);
    console.log(
      `abort on the junk image: ${extra.coreRan ? 'observed, as expected — there is no BIOS or disc' : 'not observed in the window'}`,
    );
    console.log(`game start: ${step('frontend-start') ? 'frontend reported start' : 'not reported (no BIOS or image)'}`);
  } else {
    console.log(`instantiate: ${step('instantiated-ms')?.value ?? '—'} ms, ` +
      `${step('exports')?.value ?? '—'} exports, ${step('heap-mb')?.value ?? '—'} MB heap`);
    console.log(`filesystem: ${step('fs')?.value ?? '—'}`);
    console.log(`main: ${step('main-returned') ? 'started and returned'
      : step('main-error') ? `threw — ${step('main-error').value}`
        : 'did not report'}`);
  }
  if (step('instantiate-failed')) console.log(`instantiate failed: ${failed.value}`);
  if (proof.errors.length) console.log(`page errors: ${proof.errors.slice(0, 3).join(' | ')}`);
  if (messages.length) console.log(`console: ${messages.slice(0, 5).join(' | ')}`);
  console.log('');
  console.log(
    frontend
      ? 'MEASURED: the app\'s packer produces an archive the real frontend accepts, and the pinned core instantiates from it.'
      : 'MEASURED: the pinned core binary loads, instantiates and starts in this Chromium.',
  );
  console.log('NOT MEASURED: any Dreamcast game — that needs a BIOS and an image,');
  console.log('neither of which this repository ships or downloads.');
}

main()
  .then(() => {
    app.quit();
  })
  .catch(error => {
    console.error(`FAILED: ${error.message}`);
    if (server) server.close();
    app.exit(1);
  })
  .finally(() => {
    if (!keep) {
      try {
        fs.rmSync(work, { recursive: true, force: true });
      } catch {
        /* a leftover temp directory is not a failure */
      }
    } else {
      console.log(`workspace kept at ${work}`);
    }
  });
