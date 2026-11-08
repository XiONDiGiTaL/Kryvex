/* eslint-disable no-console */
/**
 * User scripts and the address bar, against the real Electron browser.
 *
 * Two claims are checked here, both of which need a live guest:
 *
 * 1. An installed `.user.js` runs in a browser tab on a matching URL, and
 *    never in the shell. Injection is main-process work on `dom-ready`, so a
 *    unit test cannot see it happen.
 * 2. Typing in the address bar survives a page that rewrites its own URL. A
 *    search engine that calls `history.replaceState` on its own schedule used
 *    to overwrite the box mid-typing, which made the typed address disappear and
 *    Enter reload the page that was already open. The fixture reproduces that
 *    in-page churn deterministically, without depending on Google.
 *
 * Run `pnpm build` first.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-userscripts-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9351);
const fixturePort = 8126;
let child = null;

const SCRIPT = `// ==UserScript==
// @name         Kryvex harness marker
// @namespace    https://xiondigital.net/kryvex/harness
// @version      1.0.0
// @description  Marks the page so the harness can see injection
// @match        *://127.0.0.1/*
// @run-at       document-end
// ==/UserScript==

document.documentElement.dataset.kryvexUserscript = 'ran';
`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${fixturePort}`);
  if (url.pathname === '/spa') {
    // A page that keeps rewriting its own URL, the way a search engine does.
    // pushState is the harsher case: it emits `did-navigate-in-page` in the
    // guest, which is the event that used to reach the address bar.
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><title>SPA fixture</title><body><h1>SPA fixture</h1>
<script>
  let step = 0;
  setInterval(() => {
    step += 1;
    history.pushState(null, '', '/spa?nav=' + step);
  }, 120);
</script></body>`);
    return;
  }
  const title = url.pathname === '/next' ? 'Next page' : 'Script target';
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><title>${title}</title><body><h1>${title}</h1></body>`);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

async function waitFor(evaluate, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/**
 * Click the address bar the way a person does, and report what it selected.
 *
 * The click is dispatched at a point measured in the page, so the field has to
 * still be at that point when the press lands. Right after a panel closes the
 * toolbar is still settling, and a press that lands on whatever is in front of
 * the field leaves the caret where it was — which reads exactly like the bug
 * this check exists for. So the point is re-measured per attempt, a press is
 * only dispatched when the field is what the point hits, and a press that never
 * focused the field is retried rather than reported as a product failure.
 *
 * What is never retried is the claim itself: once the press focuses the field,
 * the whole address must be selected, or this throws.
 */
async function clickAddressBar(cdp, attempts = 4) {
  let missed = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Leave the field first, every time: the app selects on the first click
    // after leaving it, and a second click in a focused field is meant to place
    // a caret. Retrying without a blur would test the wrong interaction.
    await cdp.evaluate(
      `(() => { const input = document.querySelector('.address-bar input');
        input.blur(); return true; })()`,
    );
    await sleep(120);
    const point = JSON.parse(
      await cdp.evaluate(
        `(() => { const input = document.querySelector('.address-bar input');
          const rect = input.getBoundingClientRect();
          const x = rect.left + rect.width * 0.5;
          const y = rect.top + rect.height / 2;
          const front = document.elementFromPoint(x, y);
          return JSON.stringify({ x, y, onField: front === input || input.contains(front),
            front: front ? String(front.className || front.tagName) : 'nothing' }); })()`,
      ),
    );
    if (!point.onField) {
      missed = `attempt ${attempt}: the point was over ${point.front}, not the address field`;
      await sleep(150);
      continue;
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: point.x,
        y: point.y,
        button: 'left',
        clickCount: 1,
      });
    }
    await sleep(200);
    const state = await cdp.evaluate(
      `(() => { const input = document.querySelector('.address-bar input');
        return { focused: document.activeElement === input, start: input.selectionStart,
          end: input.selectionEnd, length: input.value.length }; })()`,
    );
    if (!state.focused) {
      missed = `attempt ${attempt}: the click did not focus the address field`;
      await sleep(150);
      continue;
    }
    if (state.start === 0 && state.end === state.length && state.length > 0) return state;
    throw new Error(
      `Clicking the address bar did not select the address (${state.start}-${state.end} of ${state.length}).`,
    );
  }
  throw new Error(`The address bar could not be clicked: ${missed}.`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const guest = expression =>
  `(() => { const w = document.querySelector('webview'); if (!w) return false; try { return w.executeJavaScript(${JSON.stringify(
    expression,
  )}); } catch { return false; } })()`;

server.listen(fixturePort, '127.0.0.1');

(async () => {
  try {
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');
    // A fresh profile opens the first-run theme sheet, which sits over the
    // whole window. A person dismisses it before touching the toolbar; the
    // harness has to do the same or every real click lands on the scrim.
    await cdp.evaluate(
      `(() => { const skip = document.querySelector('[data-shot="gallery-skip"]');
        if (skip) { skip.click(); return 'skipped'; }
        const close = document.querySelector('.theme-gallery-layer .icon-btn');
        if (close) { close.click(); return 'closed'; }
        return 'absent'; })()`,
    );
    await sleep(400);

    const installed = await cdp.evaluate(
      `(async () => { const result = await window.kryvex.userscriptsInstallText(${JSON.stringify(
        SCRIPT,
      )}); return { ok: result.ok, message: result.message, count: result.records.length }; })()`,
    );
    console.log('install:', JSON.stringify(installed));
    if (!installed.ok) throw new Error(`The script was not installed: ${installed.message}`);

    const listed = await cdp.evaluate(`window.kryvex.userscriptsList()`);
    const record = listed.find(item => item.name === 'Kryvex harness marker');
    if (!record) throw new Error('The installed script is missing from the list.');
    console.log('listed:', record.name, record.version, record.hosts.join(','), record.enabled);

    // The shell runs in the same process as the script; it must stay untouched.
    const shellMarked = await cdp.evaluate(`document.documentElement.dataset.kryvexUserscript ?? null`);
    if (shellMarked !== null) throw new Error('The script ran in the shell renderer.');

    // Settings: the collapsible block the browser panel deep-links to opens
    // itself, lists the script, and carries the libraries people install from.
    await cdp.evaluate(`window.location.hash = '#/settings?section=userscripts'; true`);
    const block = await waitFor(
      cdp.evaluate,
      `(() => { const node = document.querySelector('#userscripts');
        if (!node || node.dataset.open !== 'true') return null;
        const rows = node.querySelectorAll('.extension-row').length;
        // The block renders before its IPC reply lands, so wait for the row.
        if (rows < 1) return null;
        return { text: node.textContent || '', links: node.querySelectorAll('.userscript-sources .link').length,
          rows }; })()`,
      'userscripts settings block',
    );
    console.log(
      'settings block: rows',
      block.rows,
      '· source links',
      block.links,
      '· lists the script:',
      block.text.includes('Kryvex harness marker'),
    );
    if (block.rows !== 1) throw new Error(`The settings list shows ${block.rows} rows.`);
    if (!block.text.includes('Kryvex harness marker')) {
      throw new Error('The installed script is missing from Settings.');
    }
    if (block.links < 4) throw new Error('The script libraries are missing from Settings.');

    await cdp.evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('http://127.0.0.1:${fixturePort}/fixture'); true`,
    );
    const ran = await waitFor(
      cdp.evaluate,
      guest(`document.documentElement.dataset.kryvexUserscript ?? null`),
      'user script injection',
    );
    if (ran !== 'ran') throw new Error(`The user script did not run in the tab (got ${ran}).`);
    const title = await cdp.evaluate(
      guest(`document.title`),
    );
    console.log('injected into:', title, '- marker:', ran);

    // The toolbar icon and its panel: the page in front matches, so the row is
    // marked as running here and the icon carries a count.
    await cdp.evaluate(
      `document.querySelector('button[aria-label="User scripts"]').click(); true`,
    );
    const panel = await waitFor(
      cdp.evaluate,
      `(() => { const menu = document.querySelector('.userscript-menu');
        if (!menu) return null;
        return { rows: menu.querySelectorAll('.userscript-row').length,
          here: menu.querySelectorAll('[data-runs-here="true"]').length,
          text: menu.textContent || '',
          badge: document.querySelector('.browser-menu-wrap button .browser-count')?.textContent ?? '' }; })()`,
      'user script panel',
    );
    console.log(
      'toolbar panel: rows',
      panel.rows,
      '· running here',
      panel.here,
      '· badge',
      JSON.stringify(panel.badge),
    );
    if (panel.rows !== 1 || panel.here !== 1) throw new Error('The panel did not mark the script as running here.');
    if (!panel.text.includes('Runs on this page')) throw new Error('The panel is missing the page marker.');
    if (panel.badge !== '1') throw new Error(`The toolbar badge reads ${panel.badge}.`);
    // Close the panel and wait until it has actually left the DOM. A synthetic
    // click does not run the app's `mousedown`-outside handler, so Escape is
    // what closes it; a click dispatched while the panel is still over the
    // toolbar would land on the panel instead of the field.
    await cdp.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
    await waitFor(cdp.evaluate, `!document.querySelector('.userscript-menu')`, 'the script panel to close');

    // Reach the churning page through the address bar, which is the surface the
    // next check needs anyway.
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.address-bar input'))`, 'address bar');
    await cdp.evaluate(`document.querySelector('.address-bar input').focus(); true`);
    await cdp.send('Input.insertText', { text: `http://127.0.0.1:${fixturePort}/spa` });
    await cdp.evaluate(`document.querySelector('.address-bar').requestSubmit(); true`);
    await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); try { return w.getURL().includes('/spa'); } catch { return false; } })()`,
      'SPA fixture',
    );

    // A click, not a script focus: this is the interaction the report is about.
    // Clicking the address bar must select the whole address so typing replaces
    // it, which is what every other browser does.
    const selection = await clickAddressBar(cdp);
    console.log('selection after clicking the address bar:', JSON.stringify(selection));

    // Typing must therefore replace the address, not splice into it.
    await cdp.send('Input.insertText', { text: `http://127.0.0.1:${fixturePort}/next` });
    const typedImmediately = await cdp.evaluate(
      `document.querySelector('.address-bar input').value`,
    );
    await sleep(1600);
    const typedAfter = await cdp.evaluate(`document.querySelector('.address-bar input').value`);
    console.log('address after typing:', typedImmediately);
    console.log('address after 1.6 s of page churn:', typedAfter);
    if (typedAfter !== typedImmediately) {
      throw new Error(
        `The page overwrote the address bar: kept "${typedAfter}" instead of "${typedImmediately}".`,
      );
    }

    // Enter must go where the text says, not back to the page that is open.
    await cdp.evaluate(`document.querySelector('.address-bar').requestSubmit(); true`);
    const navigated = await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview'); try { const u = w.getURL(); return u.includes('/next') ? u : null; } catch { return null; } })()`,
      'navigation to the typed address',
    );
    console.log('navigated to:', navigated);

    // The script follows to the next page in the same tab.
    const followed = await waitFor(
      cdp.evaluate,
      guest(`document.documentElement.dataset.kryvexUserscript ?? null`),
      'script on the second page',
    );
    if (followed !== 'ran') throw new Error('The script did not run after the in-tab navigation.');
    console.log('script followed the navigation:', followed);

    // Disabling it stops the next page load, in this same tab.
    await cdp.evaluate(
      `window.kryvex.userscriptsSetEnabled(${JSON.stringify(record.key)}, false)`,
    );
    await cdp.evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('http://127.0.0.1:${fixturePort}/fixture?off=1'); true`,
    );
    await sleep(2500);
    const offMarker = await cdp.evaluate(
      guest(`document.documentElement.dataset.kryvexUserscript ?? null`),
    );
    console.log('after disabling:', offMarker);
    if (offMarker !== null) throw new Error('A disabled script still ran.');

    const removed = await cdp.evaluate(
      `window.kryvex.userscriptsRemove(${JSON.stringify(record.key)})`,
    );
    if (!removed.ok || removed.records.length !== 0) {
      throw new Error('The script was not removed.');
    }
    console.log('removed:', removed.message);

    cdp.close();
    await stop();
    console.log('userscripts harness: PASS');
  } catch (error) {
    console.error('userscripts harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
