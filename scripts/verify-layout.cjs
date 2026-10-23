/* eslint-disable no-console */
/**
 * Layout clipping harness.
 *
 * "Chopped UI" is a class of bug, not one screenshot: a container with
 * `overflow: hidden` whose content is taller or wider than its box silently
 * cuts text, badges or whole rows, and it only appears at some window sizes,
 * fonts or DPI scales. This harness sweeps every view at common window sizes
 * (plus 1440p native, and the sizes a 125–150% scaled laptop produces) and
 * fails on any element whose content is clipped without an explicit ellipsis.
 *
 * It also opens the first-run theme sheet in a disposable profile and checks
 * that the sheet, its previews and its footer all fit.
 *
 * Run `pnpm build` first, or use `pnpm verify:layout`.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = 9395;
const SIZES = [
  [2560, 1400],
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [1104, 720],
  [1040, 680],
  [960, 640],
  [900, 600],
  [900, 520],
];
const VIEWS = ['home', 'services', 'browser', 'assistant', 'rooms', 'settings'];
const SHEET_SIZES = [
  [1360, 950],
  [1280, 720],
  [1040, 680],
  [900, 600],
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

async function target(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = list.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`DevTools endpoint ${port} did not appear.`);
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
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

/** Elements whose own content is larger than their clipped box. */
const CLIPPING = `(() => {
  const clipped = (value) => value === 'hidden' || value === 'clip';
  const found = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'WEBVIEW' || el.closest('webview')) continue;
    const style = getComputedStyle(el);
    if (!clipped(style.overflowX) && !clipped(style.overflowY)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    const clipX = clipped(style.overflowX) && dx > 1;
    const clipY = clipped(style.overflowY) && dy > 1;
    if (!clipX && !clipY) continue;
    // A single line with a deliberate ellipsis is a design choice, not a cut.
    if (clipX && !clipY && style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap') {
      continue;
    }
    const cls =
      typeof el.className === 'string'
        ? el.className.trim().split(/\\s+/).slice(0, 3).join('.')
        : '';
    found.push({
      tag: el.tagName.toLowerCase(),
      cls,
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 48),
      dx,
      dy,
      clipX,
      clipY,
    });
  }
  return found.slice(0, 12);
})()`;

const HORIZONTAL = `(() => {
  const main = document.querySelector('.app-main');
  const doc = document.documentElement;
  return {
    docOverflow: doc.scrollWidth - doc.clientWidth,
    mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  };
})()`;

const SHEET = `(() => {
  const layer = document.querySelector('.theme-gallery-layer');
  const sheet = document.querySelector('.theme-gallery-sheet');
  const foot = document.querySelector('.theme-gallery-foot');
  if (!layer || !sheet) return { missing: true };
  const l = layer.getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const f = foot ? foot.getBoundingClientRect() : null;
  return {
    sheetFits:
      s.top >= l.top - 0.5 && s.bottom <= l.bottom + 0.5 && s.left >= l.left - 0.5 && s.right <= l.right + 0.5,
    footerVisible: f ? f.bottom <= l.bottom + 0.5 && f.top >= l.top - 0.5 : false,
    clipped: sheet.scrollHeight > sheet.clientHeight + 1 && getComputedStyle(sheet).overflowY === 'hidden',
  };
})()`;

function seedProfile(dir, { fresh }) {
  fs.rmSync(dir, { recursive: true, force: true });
  const userData = path.join(dir, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(dir, 'local'), { recursive: true });
  if (fresh) return userData;
  const state = {
    version: 1,
    services: [
      {
        id: 's-fixture',
        name: 'Layout fixture',
        url: 'https://example.com',
        category: 'other',
        color: '#38BDF8',
        letter: 'L',
        pinned: true,
        createdAt: 1,
      },
    ],
    bookmarks: [],
    history: [],
    recent: [],
    browser: { tabs: [], activeTabId: null },
    settings: {
      themeId: 'kryvex-dark',
      themeGallerySeen: true,
      density: 'comfortable',
      language: 'en',
    },
  };
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(state));
  return userData;
}

function launch(profile, port) {
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => {
    const text = String(data);
    if (!text.includes('wgc_capturer')) process.stderr.write(text);
  });
  children.push(child);
  return child;
}

async function stop() {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  await sleep(900);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

const failures = [];
function record(where, detail) {
  failures.push(`${where}: ${JSON.stringify(detail)}`);
}

(async () => {
  try {
    // Phase 1: every view at every size.
    const profileA = path.join(root, '.tmp-layout-a');
    const userDataA = seedProfile(profileA, { fresh: false });
    launch(profileA, PORT + 1);
    const pageA = await target(PORT + 1);
    const cdpA = await connect(pageA.webSocketDebuggerUrl);
    await sleep(2200);

    for (const [width, height] of SIZES) {
      await cdpA.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(250);
      for (const view of VIEWS) {
        await cdpA.evaluate(`window.location.hash = '#/${view}'; true`);
        await sleep(450);
        const clipped = await cdpA.evaluate(CLIPPING);
        const horizontal = await cdpA.evaluate(HORIZONTAL);
        if (clipped.length > 0) record(`${width}x${height} ${view}`, clipped);
        if (horizontal.docOverflow > 1 || horizontal.mainOverflow > 1) {
          record(`${width}x${height} ${view} overflow`, horizontal);
        }
      }
      console.log(`checked ${width}x${height}`);
    }
    cdpA.close();

    // Phase 2: the first-run sheet on a fresh profile.
    const profileB = path.join(root, '.tmp-layout-b');
    seedProfile(profileB, { fresh: true });
    launch(profileB, PORT + 2);
    const pageB = await target(PORT + 2);
    const cdpB = await connect(pageB.webSocketDebuggerUrl);
    await sleep(2400);
    await cdpB.evaluate(`Boolean(document.querySelector('.theme-gallery-sheet')) ? true : true`);
    for (const [width, height] of SHEET_SIZES) {
      await cdpB.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(400);
      const sheet = await cdpB.evaluate(SHEET);
      const clipped = await cdpB.evaluate(CLIPPING);
      if (sheet.missing || !sheet.sheetFits || !sheet.footerVisible || sheet.clipped) {
        record(`${width}x${height} first-run sheet`, sheet);
      }
      if (clipped.length > 0) record(`${width}x${height} first-run sheet`, clipped);
      console.log(`checked ${width}x${height} first-run sheet`);
    }
    cdpB.close();

    await stop();
    if (failures.length > 0) {
      console.error(`layout harness: FAIL (${failures.length})`);
      for (const failure of failures) console.error(`  ${failure}`);
      process.exitCode = 1;
    } else {
      console.log('layout harness: PASS, no clipped content, no horizontal overflow');
    }
  } catch (error) {
    console.error('layout harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  }
})();
