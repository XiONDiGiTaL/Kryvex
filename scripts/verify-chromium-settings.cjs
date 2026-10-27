/* eslint-disable no-console */
/**
 * Chromium engine settings check against the real Electron engine.
 *
 * Seeds a profile with every switch at a non-default value, opens a local
 * fixture page as a service module, then reads back what the engine actually
 * attached to the guest. It then flips JavaScript, images, autoplay, zoom and
 * the preferred colour scheme through the Settings panel and rebuilds the
 * page, proving the controls are wired to Chromium rather than to a label.
 *
 * Run `pnpm build` first (or use `pnpm verify:chromium`).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-chromium-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9349);
const FIXTURE_PORT = 8146;
// A second origin: Chromium remembers zoom per origin, so a fresh host is the
// only way to prove the default zoom preference itself is attached.
const FRESH_PORT = 8147;

// Every field differs from the default so a missing mapping cannot pass.
const SEEDED = {
  hardwareAcceleration: false,
  smoothScrolling: false,
  javascript: false,
  images: false,
  webgl: false,
  pdfViewer: false,
  autoplay: false,
  backgroundThrottling: true,
  spellcheck: false,
  colorScheme: 'dark',
  defaultZoom: 1.25,
};

const SERVICE = {
  id: 's-fixture',
  name: 'Engine fixture',
  url: `http://127.0.0.1:${FIXTURE_PORT}/fixture`,
  category: 'other',
  color: '#38BDF8',
  letter: 'E',
  pinned: true,
  createdAt: 1,
};

const STATE = {
  version: 1,
  services: [SERVICE],
  bookmarks: [],
  history: [],
  recent: [],
  browser: { tabs: [], activeTabId: null },
  settings: { chromium: SEEDED },
};

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

/** A valid 50 ms silent WAV, so play() can be tested without a media file. */
function silenceWav() {
  const samples = 400;
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const WAV = silenceWav();

function fixture(request, response) {
  if (request.url === '/pixel.png') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(PIXEL);
    return;
  }
  if (request.url === '/silence.wav') {
    response.writeHead(200, { 'Content-Type': 'audio/wav' });
    response.end(WAV);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    `<!doctype html><html><head><title>Engine fixture</title></head>
     <body style="font:16px sans-serif;padding:24px;background:#fff">
       <h1>Engine fixture</h1>
       <img id="pixel" src="/pixel.png" width="32" height="32" alt="pixel">
       <audio id="tone" src="/silence.wav" loop preload="auto"></audio>
       <script>document.title = 'script-ran'; document.documentElement.dataset.script = 'ran';</script>
     </body></html>`,
  );
}

const servers = [http.createServer(fixture), http.createServer(fixture)];

let child = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function seedProfile() {
  fs.rmSync(profile, { recursive: true, force: true });
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(STATE), 'utf8');
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

async function target() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
        response.json(),
      );
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Electron DevTools endpoint did not appear.');
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

async function waitFor(evaluate, expression, label, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/** Reads the guest DOM through the webview bridge. */
const GUEST = `document.querySelector('.service-frame[data-service="s-fixture"] webview')`;

const GUEST_LOADED = `(() => {
  const w = ${GUEST};
  if (!w) return false;
  try { return !w.isLoading() && w.getURL().includes('/fixture'); } catch { return false; }
})()`;

const guestProbe = `(async () => {
  const w = ${GUEST};
  if (!w) return { __error: 'no guest' };
  const out = { zoom: null, title: null, images: null, scheme: null };
  try { out.zoom = w.getZoomFactor(); } catch (error) { out.zoomError = String(error); }
  try { out.title = await w.executeJavaScript('document.title'); } catch (error) { out.titleError = String(error).slice(0, 120); }
  try { out.images = await w.executeJavaScript('Array.from(document.images).map(i => i.naturalWidth)'); } catch (error) { out.imagesError = String(error).slice(0, 120); }
  try { out.scheme = await w.executeJavaScript("({ dark: matchMedia('(prefers-color-scheme: dark)').matches, light: matchMedia('(prefers-color-scheme: light)').matches })"); } catch (error) { out.schemeError = String(error).slice(0, 120); }
  return out;
})()`;

servers[0].listen(FIXTURE_PORT, '127.0.0.1');
servers[1].listen(FRESH_PORT, '127.0.0.1');

(async () => {
  try {
    seedProfile();
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');

    await cdp.evaluate(`window.location.hash = '#/service/s-fixture'; true`);
    await waitFor(cdp.evaluate, GUEST_LOADED, 'fixture service');

    // ---- Phase A: seeded launch profile -------------------------------
    const info = await cdp.evaluate(`window.kryvex.chromiumInfo()`);
    console.log('engine:', JSON.stringify({
      chrome: info.chrome,
      accelerated: info.accelerated,
      gpu: info.gpu,
      switches: info.switches,
      guests: info.guests.map(guest => ({
        url: guest.url,
        zoom: guest.zoomFactor,
        applied: guest.applied,
      })),
    }));

    check(/^\d+\./.test(info.chrome), 'Chromium version was not reported.');
    check(info.accelerated === false, 'Hardware acceleration was not disabled at launch.');
    check(
      info.switches.includes('--disable-smooth-scrolling'),
      'The smooth-scrolling launch switch is missing.',
    );
    check(info.profile.colorScheme === 'dark', 'The seeded colour scheme was not loaded.');
    check(info.guests.length >= 1, 'No live guest was reported.');
    const applied = info.guests[0].applied;
    check(applied, 'The guest has no recorded web preferences.');
    check(applied.javascript === false, 'JavaScript was not disabled on the guest.');
    check(applied.images === false, 'Images were not disabled on the guest.');
    check(applied.webgl === false, 'WebGL was not disabled on the guest.');
    check(applied.plugins === false, 'The PDF viewer was not disabled on the guest.');
    check(applied.spellcheck === false, 'Spellcheck was not disabled on the guest.');
    check(
      applied.autoplayPolicy === 'document-user-activation-required',
      'Autoplay was not held behind a gesture.',
    );
    check(applied.backgroundThrottling === true, 'Background throttling was not applied.');
    check(
      Math.abs(info.guests[0].zoomFactor - 1.25) < 0.01,
      `The default zoom did not attach (saw ${info.guests[0].zoomFactor}).`,
    );

    const disabled = await cdp.evaluate(guestProbe);
    console.log('seeded guest:', JSON.stringify(disabled));
    check(disabled.title !== 'script-ran', 'Page scripts still ran with JavaScript disabled.');
    check(
      Math.abs(disabled.zoom - 1.25) < 0.01,
      `The webview zoom is ${disabled.zoom}, expected 1.25.`,
    );
    if (Array.isArray(disabled.images)) {
      check(disabled.images.every(width => width === 0), 'Images loaded while disabled.');
    }
    if (disabled.scheme) check(disabled.scheme.dark === true, 'Pages did not see a dark scheme.');

    // ---- Phase B: change the profile through the Settings panel --------
    await cdp.evaluate(`window.location.hash = '#/settings'; true`);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('#chromium'))`, 'engine panel');

    // The graphics cell is filled by an IPC that answers after the panel mounts,
    // so it reads 'n/a' for a moment — longer on a cold runner, where this check
    // used to read the placeholder and call the panel wrong. Wait for the panel's
    // own answer, which is what the check is about.
    await waitFor(
      cdp.evaluate,
      `(() => {
        const cell = document.querySelector('#chromium .engine-report strong');
        return Boolean(cell) && cell.textContent !== 'n/a';
      })()`,
      'the engine report',
    );
    const report = await cdp.evaluate(
      `Array.from(document.querySelectorAll('#chromium .engine-report strong')).map(node => node.textContent)`,
    );
    console.log('engine report:', JSON.stringify(report));
    check(
      report.includes('Software'),
      'The panel did not report software rendering for the seeded profile.',
    );

    // One control at a time, the way a person clicks them: each event must
    // read the state the previous one produced.
    const flip = async key => {
      await cdp.evaluate(
        `document.querySelector('[data-engine="${key}"] .switch').click(); true`,
      );
      await waitFor(
        cdp.evaluate,
        `(async () => Boolean((await window.kryvex.chromiumInfo()).profile.${key}))()`,
        `${key} enabled`,
      );
    };
    const setSelect = async (key, value) => {
      await cdp.evaluate(`(() => {
        const select = document.querySelector('[data-engine="${key}"] select');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, ${JSON.stringify(value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await waitFor(
        cdp.evaluate,
        `(async () => String((await window.kryvex.chromiumInfo()).profile.${key}) === ${JSON.stringify(String(value))})()`,
        `${key} set to ${value}`,
      );
    };

    await flip('javascript');
    await flip('images');
    await flip('autoplay');
    await setSelect('colorScheme', 'light');
    await setSelect('defaultZoom', '1');

    const updated = await cdp.evaluate(`window.kryvex.chromiumInfo()`);
    console.log('updated profile:', JSON.stringify(updated.profile));
    check(
      updated.profile.javascript &&
        updated.profile.images &&
        updated.profile.autoplay &&
        updated.profile.colorScheme === 'light' &&
        updated.profile.defaultZoom === 1,
      `The panel did not apply every change: ${JSON.stringify(updated.profile)}`,
    );

    await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('#chromium button'))
        .find(node => node.textContent.includes('Rebuild open pages'));
      if (!button) return false;
      button.click();
      return true;
    })()`);

    await waitFor(cdp.evaluate, GUEST_LOADED, 'rebuilt fixture');
    const rebuilt = await waitFor(
      cdp.evaluate,
      `(async () => {
        const w = ${GUEST};
        if (!w) return null;
        try { return (await w.executeJavaScript('document.title')) === 'script-ran'; }
        catch { return null; }
      })()`,
      'scripts running after the rebuild',
    );
    check(rebuilt === true, 'The rebuilt page did not run its scripts.');

    const updatedInfo = await cdp.evaluate(`window.kryvex.chromiumInfo()`);
    const rebuiltGuest = updatedInfo.guests.find(guest => guest.url.includes('/fixture'));
    console.log('rebuilt guest:', JSON.stringify(rebuiltGuest));
    check(Boolean(rebuiltGuest), 'The rebuilt guest was not reported.');
    check(
      rebuiltGuest.applied.javascript === true &&
        rebuiltGuest.applied.images === true &&
        rebuiltGuest.applied.autoplayPolicy === 'no-user-gesture-required' &&
        rebuiltGuest.applied.zoomFactor === 1,
      `The rebuilt guest kept stale preferences: ${JSON.stringify(rebuiltGuest.applied)}`,
    );

    const live = await cdp.evaluate(guestProbe);
    console.log('rebuilt probe:', JSON.stringify(live));
    check(live.title === 'script-ran', 'The rebuilt page did not run its scripts.');
    check(
      Array.isArray(live.images) && live.images.some(width => width > 0),
      'Images stayed blocked after enabling them.',
    );
    check(live.scheme && live.scheme.light === true, 'Pages did not see the light scheme.');

    // Autoplay is behavioural: a silent element either starts or is refused.
    await cdp.evaluate(`(async () => {
      const w = ${GUEST};
      await w.executeJavaScript(
        "document.getElementById('tone').play().then(" +
        "() => { window.__autoplay = 'played'; }," +
        "error => { window.__autoplay = error.name; }); 'started'",
      );
      return true;
    })()`);
    await sleep(1200);
    const played = await cdp.evaluate(`(async () => {
      const w = ${GUEST};
      try { return await w.executeJavaScript('window.__autoplay || null'); } catch { return null; }
    })()`);
    console.log('autoplay:', played);
    check(played === 'played', `Autoplay did not start (${played}).`);

    // Chromium keeps a zoom level per session and origin, so the default only
    // shows on a page that has never been zoomed: a brand-new browser tab in
    // its own in-memory partition is exactly that.
    await cdp.evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('http://127.0.0.1:${FRESH_PORT}/fixture'); true`,
    );
    const FRESH_TAB = `[...document.querySelectorAll('webview')].find(w => { try { return w.getURL().includes('${FRESH_PORT}'); } catch { return false; } })`;
    await waitFor(
      cdp.evaluate,
      `(() => { const w = ${FRESH_TAB}; return Boolean(w) && !w.isLoading(); })()`,
      'fresh browser tab',
    );
    const freshZoom = await cdp.evaluate(`(() => {
      const w = ${FRESH_TAB};
      try { return w.getZoomFactor(); } catch { return null; }
    })()`);
    console.log('fresh tab zoom:', freshZoom);
    check(
      typeof freshZoom === 'number' && Math.abs(freshZoom - 1) < 0.01,
      `The default zoom did not attach to a fresh tab (saw ${freshZoom}).`,
    );
    const freshInfo = await cdp.evaluate(`window.kryvex.chromiumInfo()`);
    const freshGuest = freshInfo.guests.find(guest => guest.url.includes(`:${FRESH_PORT}`));
    console.log('fresh tab guest:', JSON.stringify(freshGuest));
    check(Boolean(freshGuest), 'The fresh browser guest was not reported.');
    check(
      freshGuest.applied.javascript === true && freshGuest.applied.zoomFactor === 1,
      `The browser tab did not inherit the engine profile: ${JSON.stringify(freshGuest.applied)}`,
    );

    cdp.close();
    await stop();
    console.log('chromium settings harness: PASS');
  } catch (error) {
    console.error('chromium settings harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    for (const server of servers) server.close();
  }
})();
