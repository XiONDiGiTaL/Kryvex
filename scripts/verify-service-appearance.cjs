/* eslint-disable no-console */
/**
 * The per-service appearance sheet, in a real guest.
 *
 * `tests/service-appearance.test.ts` proves the sheet the renderer builds is
 * sanitised and complete, but never that Chromium paints it: `insertCSS` only
 * exists on an attached `webview`, so the claim needs a live app. This harness
 * writes a service pointed at a local fixture into a throwaway profile, then
 * drives the real control:
 *
 * 1. The sheet paints. The fixture page pins its own colours, so a computed
 *    colour that changes is the sheet and nothing else.
 * 2. It survives a document change. The sheet belongs to one document, so
 *    following a link must re-apply it rather than lose it.
 * 3. A pinned planet theme works through the same control.
 * 4. Site colours removes it again, which is `removeInsertedCSS` and not a
 *    second sheet painted over the first.
 *
 * The Discord sheet is not here. `discord.com` is on Chromium's HSTS preload
 * list, so the `--host-resolver-rules` mapping that makes a local fixture
 * reachable at a chosen hostname is upgraded to HTTPS before the request, and
 * the fixture cannot answer. That sheet's contents and its host matching are
 * covered by the unit test, which reads the same rules the app uses.
 *
 * The state file is written before launch rather than through the UI: adding a
 * service takes a dialog and a preset, and neither is what is being tested.
 *
 * Run `pnpm build` first. Windows: `pnpm verify:appearance`. On Linux the
 * sandbox helper needs setuid root, which a container does not have, so the app
 * is spawned with `--no-sandbox` there; Windows keeps its sandbox.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-appearance-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9361);
const fixturePort = Number(process.env.KRYVEX_APPEARANCE_PORT || 8167);

const SERVICE = { id: 'harness-appearance', name: 'Harness Appearance' };

const PAGE = title => `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #f4f4f4; color: #101010; font: 16px system-ui; }
  a { color: #0b57d0; }
</style></head><body>
<h1>${title}</h1>
<a id="next" href="/two">Second page</a>
</body></html>`;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${fixturePort}`).pathname;
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(PAGE(pathname === '/two' ? 'Second page' : 'First page'));
});

let child = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A profile whose state already holds the service.
 *
 * `sanitizeState` fills every field this does not set, so only what the check
 * depends on is written: the URL decides the page, and the appearance starts
 * off so the first read is the fixture's own colours.
 */
function seedProfile() {
  fs.rmSync(profile, { recursive: true, force: true });
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  const state = {
    services: [
      {
        id: SERVICE.id,
        name: SERVICE.name,
        url: `http://127.0.0.1:${fixturePort}/one`,
        category: 'communication',
        color: '#3f80ff',
        letter: 'A',
        pinned: true,
        createdAt: Date.now(),
      },
    ],
  };
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(state));
}

function launch() {
  const args = ['.', `--remote-debugging-port=${port}`];
  if (process.platform === 'linux') args.push('--no-sandbox', '--disable-dev-shm-usage');
  child = spawn(electron, args, {
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
  for (let attempt = 0; attempt < 160; attempt += 1) {
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
    // A renderer that died mid-check would otherwise leave the reply pending for
    // ever and this harness would sit there rather than report the failure.
    const result = await Promise.race([
      send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }),
      sleep(20000).then(() => {
        throw new Error(`The shell did not answer within 20 s: ${expression.slice(0, 80)}`);
      }),
    ]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Failed.');
    return result.result.value;
  };
  await send('Runtime.enable');
  return { evaluate, send, close: () => socket.close() };
}

/**
 * Two kinds of wait: an expression inside the shell, and a value read back from
 * the guest, which has to be polled because the guest outlives the shell's
 * frame. Both fail with the label of the thing that never arrived.
 */
async function waitFor(evaluate, expression, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function poll(read, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await read();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/** Read a value out of the guest. A guest between documents answers with an
 * error object rather than rejecting the harness. */
const guestEval = (cdp, expression) =>
  cdp.evaluate(
    `(() => { const w = document.querySelector('webview');
      if (!w) return { __error: 'no guest' };
      try {
        return Promise.resolve(w.executeJavaScript(${JSON.stringify(expression)}))
          .catch(error => ({ __error: String(error) }));
      } catch (error) { return { __error: String(error) }; } })()`,
  );

const guestUrl = cdp =>
  cdp.evaluate(
    `(() => { const w = document.querySelector('webview');
      try { return w ? w.getURL() : ''; } catch { return ''; } })()`,
  );

/**
 * The fixture's own colours are what `body` computes to before any sheet, and
 * what it must return to when the sheet is removed. The link colour is read too
 * because the generic sheet changes it with `!important`, which is the part a
 * page cannot override.
 */
const guestStyle = cdp =>
  guestEval(
    cdp,
    `(() => {
      const body = getComputedStyle(document.body);
      const link = document.querySelector('a');
      return {
        ready: document.readyState,
        bg: body.backgroundColor,
        ink: body.color,
        link: link ? getComputedStyle(link).color : null,
        scrollbar: getComputedStyle(document.documentElement).scrollbarColor || '',
      };
    })()`,
  );

async function openService(cdp) {
  await cdp.evaluate(`window.location.hash = '#/service/${SERVICE.id}'; true`);
  return poll(async () => {
    const url = await guestUrl(cdp);
    if (!url.includes(`127.0.0.1:${fixturePort}`)) return null;
    const style = await guestStyle(cdp);
    if (!style || style.__error) return null;
    // A guest that is still navigating reads `loading`; wait for the document
    // the sheet will be applied to.
    return style.ready === 'complete' && style.bg ? style : null;
  }, `the ${SERVICE.name} page`);
}

async function openAppearance(cdp) {
  const trigger = JSON.stringify(`Options for ${SERVICE.name}`);
  await cdp.evaluate(
    `(() => { const button = document.querySelector('button[aria-label=${trigger}]');
      if (!button) return false; button.click(); return true; })()`,
  );
  const label = JSON.stringify(`Appearance for ${SERVICE.name}`);
  await waitFor(
    cdp.evaluate,
    `Boolean(document.querySelector('select[aria-label=${label}]'))`,
    `the appearance control for ${SERVICE.name}`,
  );
}

/** Choose a value the way the panel does: the select's own change event. */
async function chooseAppearance(cdp, value) {
  const label = JSON.stringify(`Appearance for ${SERVICE.name}`);
  const chosen = await cdp.evaluate(
    `(() => { const select = document.querySelector('select[aria-label=${label}]');
      if (!select) return null;
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value; })()`,
  );
  if (chosen !== value) throw new Error(`The appearance select would not take ${value}.`);
}

async function savedAppearance(cdp) {
  return cdp.evaluate(
    `(async () => { const state = await window.kryvex.loadState();
      const found = (state && state.services || []).find(item => item.id === ${JSON.stringify(
        SERVICE.id,
      )});
      return found ? found.appearance ?? null : 'missing'; })()`,
  );
}

async function waitForStyle(cdp, label, predicate) {
  return poll(async () => {
    const style = await guestStyle(cdp);
    if (!style || style.__error) return null;
    return predicate(style) ? style : null;
  }, label);
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

(async () => {
  await new Promise(resolve => server.listen(fixturePort, '127.0.0.1', resolve));
  try {
    seedProfile();
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'the shell');
    // A fresh profile opens the first-run theme sheet over the whole window; a
    // person dismisses it before touching a control, so the harness does too.
    await cdp.evaluate(
      `(() => { const skip = document.querySelector('[data-shot="gallery-skip"]');
        if (skip) { skip.click(); return 'skipped'; }
        const close = document.querySelector('.theme-gallery-layer .icon-btn');
        if (close) { close.click(); return 'closed'; }
        return 'absent'; })()`,
    );
    await sleep(400);

    // 1. The page as it ships, then the same page with Arcade.
    const baseline = await openService(cdp);
    check(
      baseline.bg === 'rgb(244, 244, 244)' && baseline.ink === 'rgb(16, 16, 16)',
      `The fixture page did not keep its own colours before the sheet (${JSON.stringify(baseline)}).`,
    );
    console.log('generic page, no appearance:', baseline.bg, baseline.ink, baseline.link);

    await openAppearance(cdp);
    await chooseAppearance(cdp, 'arcade');
    const arcade = await waitForStyle(
      cdp,
      'the Arcade sheet in the guest',
      style => style.bg === 'rgb(5, 6, 7)',
    );
    check(arcade.ink === 'rgb(236, 237, 239)', `Arcade text is ${arcade.ink}, not #ecedef.`);
    check(arcade.link === 'rgb(63, 128, 255)', `Arcade links are ${arcade.link}, not #3f80ff.`);
    check(
      arcade.scrollbar.includes('rgb(27, 31, 38)'),
      `The scrollbar colour is ${JSON.stringify(arcade.scrollbar)}, not #1b1f26.`,
    );
    console.log('Arcade in the guest:', JSON.stringify(arcade));

    // The choice is on the record, not only in the render, so it survives a
    // restart like every other service setting.
    await sleep(500);
    const savedArcade = await savedAppearance(cdp);
    check(
      savedArcade && savedArcade.skin === 'arcade',
      `The service record holds ${JSON.stringify(savedArcade)} after choosing Arcade.`,
    );
    console.log('saved appearance:', JSON.stringify(savedArcade));

    // 2. A document change. The sheet belongs to one document, so this is the
    // check that the module re-applies it instead of losing it at the first link.
    await guestEval(
      cdp,
      `(() => { const link = document.querySelector('#next');
        if (!link) return 'no link'; link.click(); return 'clicked'; })()`,
    );
    const navigated = await waitFor(
      cdp.evaluate,
      `(() => { const w = document.querySelector('webview');
        try { return w.getURL().includes('/two') ? w.getURL() : null; } catch { return null; } })()`,
      'the second document',
    );
    console.log('guest navigated to:', navigated);
    const afterNavigation = await waitForStyle(
      cdp,
      'the Arcade sheet on the second document',
      style => style.ready === 'complete' && style.bg === 'rgb(5, 6, 7)',
    );
    check(
      afterNavigation.link === 'rgb(63, 128, 255)',
      `The sheet lost its link colour after navigation (${afterNavigation.link}).`,
    );
    console.log('after navigation:', JSON.stringify(afterNavigation));

    // 3. A pinned planet theme. Mars is a catalogue theme, so this is the same
    // route a person takes when they want the module dressed in a planet.
    await chooseAppearance(cdp, 'theme:mars');
    const mars = await waitForStyle(
      cdp,
      'the pinned Mars sheet',
      style => style.bg === 'rgb(18, 8, 7)',
    );
    check(mars.link === 'rgb(217, 88, 59)', `Mars links are ${mars.link}, not #d9583b.`);
    console.log('pinned theme in the guest:', JSON.stringify(mars));

    // 4. Off removes the sheet rather than leaving the page tinted.
    await chooseAppearance(cdp, 'off');
    const off = await waitForStyle(
      cdp,
      'the sheet to be removed',
      style => style.bg === 'rgb(244, 244, 244)',
    );
    check(off.link === 'rgb(11, 87, 208)', `Links stayed tinted after Off (${off.link}).`);
    console.log('after Off:', JSON.stringify(off));
    await sleep(500);
    const savedOff = await savedAppearance(cdp);
    check(savedOff === null, `The service record still holds ${JSON.stringify(savedOff)}.`);

    cdp.close();
    await stop();
    console.log('service appearance harness: PASS');
  } catch (error) {
    console.error('service appearance harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
