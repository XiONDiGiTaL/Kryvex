/* eslint-disable no-console */
/**
 * The per-service appearance sheet, in a real guest.
 *
 * `tests/service-appearance.test.ts` proves the sheet the renderer builds is
 * sanitised and complete, but never that Chromium paints it: `insertCSS` only
 * exists on an attached `webview`, so the claim needs a live app. This harness
 * writes services pointed at local fixtures into a throwaway profile, then
 * drives the real control:
 *
 * 1. The sheet paints. The fixture page pins its own colours, so a computed
 *    colour that changes is the sheet and nothing else.
 * 2. It survives a document change. The sheet belongs to one document, so
 *    following a link must re-apply it rather than lose it.
 * 3. A pinned planet theme works through the same control.
 * 4. Site colours removes it again, which is `removeInsertedCSS` and not a
 *    second sheet painted over the first.
 * 5. The Discord sheet, on a page that publishes Discord's own variables. That
 *    page is served over HTTPS at `discord.com` itself: Chromium's HSTS preload
 *    upgrades the host, so --host-resolver-rules alone cannot make a plain
 *    fixture answer, and the mapping is pointed at a TLS server instead. The
 *    certificate beside the key in `scripts/fixtures` is a throwaway made for
 *    this page; `--ignore-certificate-errors-spki-list` trusts that one
 *    certificate's key for this run and nothing else, and the profile is
 *    discarded afterwards. Both switches therefore exist only in this process.
 *
 * The state file is written before launch rather than through the UI: adding a
 * service takes a dialog and a preset, and neither is what is being tested.
 *
 * Run `pnpm build` first. Windows: `pnpm verify:appearance`. On Linux the
 * sandbox helper needs setuid root, which a container does not have, so the app
 * is spawned with `--no-sandbox` there; Windows keeps its sandbox.
 */
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-appearance-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9367);
const fixturePort = Number(process.env.KRYVEX_APPEARANCE_PORT || 8167);
const genericMarker = `127.0.0.1:${fixturePort}`;
const discordMarker = 'discord.com';

const SERVICE = { id: 'harness-appearance', name: 'Harness Appearance' };
const DISCORD = { id: 'harness-discord', name: 'Harness Discord' };

const PAGE = title => `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  html, body { margin: 0; background: #f4f4f4; color: #101010; font: 16px system-ui; }
  a { color: #0b57d0; }
</style></head><body>
<h1>${title}</h1>
<a id="next" href="/two">Second page</a>
</body></html>`;

/**
 * A page shaped like the part of Discord the sheet talks to: the same custom
 * properties live on the root, `html.theme-dark` is set, and the page paints
 * nothing itself except the backdrop. A sheet that overrides them shows up in
 * the computed colours without a redirect or a rewrite of the URL.
 */
const DISCORD_PAGE = `<!doctype html><html class="theme-dark"><head><meta charset="utf-8">
<title>Discord fixture</title>
<style>
  :root {
    --background-primary: #313338;
    --background-secondary: #2b2d31;
    --text-normal: #dbdee1;
    --text-link: #00a8fc;
    --brand-500: #5865f2;
  }
  html, body { margin: 0; color: var(--text-normal); font: 16px system-ui; }
  html { background: var(--background-primary); }
  a { color: var(--text-link); }
</style></head><body>
<h1>Discord fixture</h1>
<a id="next" href="/channels/@me">A channel</a>
</body></html>`;

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${fixturePort}`).pathname;
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(PAGE(pathname === '/two' ? 'Second page' : 'First page'));
});

const fixtureDir = path.join(__dirname, 'fixtures');
const discordCert = fs.readFileSync(path.join(fixtureDir, 'discord-appearance.pem'));
const discordKey = fs.readFileSync(path.join(fixtureDir, 'discord-appearance-key.pem'));

const discordServer = https.createServer({ cert: discordCert, key: discordKey }, (_request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(DISCORD_PAGE);
});

let child = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A profile whose state already holds both services.
 *
 * `sanitizeState` fills every field this does not set, so only what the checks
 * depend on is written: the URL decides the page and therefore which sheet, and
 * the appearance starts off so the first read is the fixture's own colours.
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
      {
        id: DISCORD.id,
        name: DISCORD.name,
        url: 'https://discord.com/channels/@me',
        category: 'communication',
        color: '#5865f2',
        letter: 'D',
        createdAt: Date.now() + 1,
      },
    ],
  };
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(state));
}

/** base64(SHA-256(SPKI)) of the fixture certificate, as Chromium wants it. */
function certificatePin(pem) {
  const spki = new crypto.X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(spki).digest('base64');
}

function launch(discordPort) {
  const args = [
    '.',
    `--remote-debugging-port=${port}`,
    // The Discord fixture answers for discord.com on a loopback port; only the
    // certificate pinned here is trusted, and only for this throwaway profile.
    `--host-resolver-rules=MAP discord.com 127.0.0.1:${discordPort}`,
    `--ignore-certificate-errors-spki-list=${certificatePin(discordCert)}`,
  ];
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

/**
 * Both modules stay mounted for the session, so the shell holds one `webview`
 * per opened service and `querySelector('webview')` is not necessarily the one
 * under test. Selecting by the URL the guest reports keeps each read attached
 * to the page it belongs to.
 */
const guestFinder = marker =>
  `Array.from(document.querySelectorAll('webview')).find(node => {
     try { return node.getURL().includes(${JSON.stringify(marker)}); } catch { return false; }
   })`;

/** Read a value out of the guest. A guest between documents answers with an
 * error object rather than rejecting the harness. */
const guestEval = (cdp, marker, expression) =>
  cdp.evaluate(
    `(() => { const w = ${guestFinder(marker)};
      if (!w) return { __error: 'no guest for ' + ${JSON.stringify(marker)} };
      try {
        return Promise.resolve(w.executeJavaScript(${JSON.stringify(expression)}))
          .catch(error => ({ __error: String(error) }));
      } catch (error) { return { __error: String(error) }; } })()`,
  );

const guestUrl = (cdp, marker) =>
  cdp.evaluate(`(() => { const w = ${guestFinder(marker)};
    try { return w ? w.getURL() : ''; } catch { return ''; } })()`);

/**
 * The generic fixture's own colours are what `body` computes to before any
 * sheet, and what it must return to when the sheet is removed. The link colour
 * is read too because the generic sheet changes it with `!important`, which is
 * the part a page cannot override.
 */
const genericStyle = cdp =>
  guestEval(
    cdp,
    genericMarker,
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

/**
 * The Discord fixture publishes the properties the Discord sheet writes, so the
 * computed values are the sheet's own variables rather than an approximation.
 * `scrollbar` is read as well: the generic sheet sets `scrollbar-color`
 * everywhere, the Discord sheet only sets Discord's scrollbar variables, so a
 * page that gained the wrong sheet would be caught here even though its body
 * colour happened to match.
 */
const discordStyle = cdp =>
  guestEval(
    cdp,
    discordMarker,
    `(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const link = document.querySelector('a');
      const read = name => root.getPropertyValue(name).trim();
      return {
        ready: document.readyState,
        body: body.backgroundColor,
        page: root.backgroundColor,
        ink: body.color,
        link: link ? getComputedStyle(link).color : null,
        primary: read('--background-primary'),
        secondary: read('--background-secondary'),
        brand: read('--brand-500'),
        text: read('--text-normal'),
        thumb: read('--scrollbar-auto-thumb'),
        scrollbar: root.scrollbarColor || '',
      };
    })()`,
  );

async function openService(cdp, service, marker, read) {
  await cdp.evaluate(`window.location.hash = '#/service/${service.id}'; true`);
  return poll(async () => {
    const url = await guestUrl(cdp, marker);
    if (!url || !url.includes(marker)) return null;
    const style = await read(cdp);
    if (!style || style.__error) return null;
    // A guest that is still navigating reads `loading`; wait for the document
    // the sheet will be applied to.
    return style.ready === 'complete' && (style.bg ?? style.body) ? style : null;
  }, `the ${service.name} page`);
}

async function openAppearance(cdp, serviceName) {
  const trigger = JSON.stringify(`Options for ${serviceName}`);
  await cdp.evaluate(
    `(() => { const button = document.querySelector('button[aria-label=${trigger}]');
      if (!button) return false; button.click(); return true; })()`,
  );
  const label = JSON.stringify(`Appearance for ${serviceName}`);
  await waitFor(
    cdp.evaluate,
    `Boolean(document.querySelector('select[aria-label=${label}]'))`,
    `the appearance control for ${serviceName}`,
  );
}

/** Choose a value the way the panel does: the select's own change event. */
async function chooseAppearance(cdp, serviceName, value) {
  const label = JSON.stringify(`Appearance for ${serviceName}`);
  const chosen = await cdp.evaluate(
    `(() => { const select = document.querySelector('select[aria-label=${label}]');
      if (!select) return null;
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value; })()`,
  );
  if (chosen !== value) throw new Error(`The appearance select would not take ${value}.`);
}

async function savedAppearance(cdp, serviceId) {
  return cdp.evaluate(
    `(async () => { const state = await window.kryvex.loadState();
      const found = (state && state.services || []).find(item => item.id === ${JSON.stringify(
        serviceId,
      )});
      return found ? found.appearance ?? null : 'missing'; })()`,
  );
}

async function waitForStyle(cdp, read, label, predicate) {
  return poll(async () => {
    const style = await read(cdp);
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
  await new Promise(resolve => discordServer.listen(0, '127.0.0.1', resolve));
  const discordPort = discordServer.address().port;
  try {
    seedProfile();
    launch(discordPort);
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
    const baseline = await openService(cdp, SERVICE, genericMarker, genericStyle);
    check(
      baseline.bg === 'rgb(244, 244, 244)' && baseline.ink === 'rgb(16, 16, 16)',
      `The fixture page did not keep its own colours before the sheet (${JSON.stringify(baseline)}).`,
    );
    console.log('generic page, no appearance:', baseline.bg, baseline.ink, baseline.link);

    await openAppearance(cdp, SERVICE.name);
    await chooseAppearance(cdp, SERVICE.name, 'arcade');
    const arcade = await waitForStyle(
      cdp,
      genericStyle,
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
    const savedArcade = await savedAppearance(cdp, SERVICE.id);
    check(
      savedArcade && savedArcade.skin === 'arcade',
      `The service record holds ${JSON.stringify(savedArcade)} after choosing Arcade.`,
    );
    console.log('saved appearance:', JSON.stringify(savedArcade));

    // 2. A document change. The sheet belongs to one document, so this is the
    // check that the module re-applies it instead of losing it at the first link.
    await guestEval(
      cdp,
      genericMarker,
      `(() => { const link = document.querySelector('#next');
        if (!link) return 'no link'; link.click(); return 'clicked'; })()`,
    );
    const navigated = await waitFor(
      cdp.evaluate,
      `(() => { const w = ${guestFinder(genericMarker)};
        try { return w && w.getURL().includes('/two') ? w.getURL() : null; } catch { return null; } })()`,
      'the second document',
    );
    console.log('guest navigated to:', navigated);
    const afterNavigation = await waitForStyle(
      cdp,
      genericStyle,
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
    await chooseAppearance(cdp, SERVICE.name, 'theme:mars');
    const mars = await waitForStyle(
      cdp,
      genericStyle,
      'the pinned Mars sheet',
      style => style.bg === 'rgb(18, 8, 7)',
    );
    check(mars.link === 'rgb(217, 88, 59)', `Mars links are ${mars.link}, not #d9583b.`);
    console.log('pinned theme in the guest:', JSON.stringify(mars));

    // 4. Off removes the sheet rather than leaving the page tinted.
    await chooseAppearance(cdp, SERVICE.name, 'off');
    const off = await waitForStyle(
      cdp,
      genericStyle,
      'the sheet to be removed',
      style => style.bg === 'rgb(244, 244, 244)',
    );
    check(off.link === 'rgb(11, 87, 208)', `Links stayed tinted after Off (${off.link}).`);
    console.log('after Off:', JSON.stringify(off));
    await sleep(500);
    const savedOff = await savedAppearance(cdp, SERVICE.id);
    check(savedOff === null, `The service record still holds ${JSON.stringify(savedOff)}.`);

    // 5. The Discord sheet, at discord.com, over the fixture's TLS certificate.
    const discordBefore = await openService(cdp, DISCORD, discordMarker, discordStyle);
    check(
      discordBefore.primary === '#313338' &&
        discordBefore.brand === '#5865f2' &&
        discordBefore.link === 'rgb(0, 168, 252)',
      `The Discord fixture did not keep its own variables (${JSON.stringify(discordBefore)}).`,
    );
    console.log('Discord fixture, no appearance:', JSON.stringify(discordBefore));

    await openAppearance(cdp, DISCORD.name);
    await chooseAppearance(cdp, DISCORD.name, 'arcade');
    const discordArcade = await waitForStyle(
      cdp,
      discordStyle,
      'the Arcade sheet on discord.com',
      style => style.primary === '#0c0e11',
    );
    check(
      discordArcade.body === 'rgb(5, 6, 7)',
      `The Discord sheet left the page background ${discordArcade.body}, not #050607.`,
    );
    check(
      discordArcade.page === 'rgb(12, 14, 17)',
      `--background-primary did not reach the page (${discordArcade.page}), not #0c0e11.`,
    );
    check(
      discordArcade.secondary === '#050607',
      `--background-secondary is ${discordArcade.secondary}, not #050607.`,
    );
    check(
      discordArcade.text === '#ecedef' && discordArcade.ink === 'rgb(236, 237, 239)',
      `Discord text is ${discordArcade.text} / ${discordArcade.ink}, not #ecedef.`,
    );
    check(
      discordArcade.link === 'rgb(63, 128, 255)' && discordArcade.brand === '#3f80ff',
      `Discord links are ${discordArcade.link} and --brand-500 ${discordArcade.brand}, not #3f80ff.`,
    );
    check(
      discordArcade.thumb === '#1b1f26',
      `--scrollbar-auto-thumb is ${discordArcade.thumb}, not #1b1f26.`,
    );
    // The generic sheet sets `scrollbar-color` on every element; the Discord
    // sheet does not, so this is the read that tells the two apart.
    check(
      discordArcade.scrollbar === 'auto',
      `The Discord page took the generic sheet (scrollbar-color ${JSON.stringify(discordArcade.scrollbar)}).`,
    );
    console.log('Arcade on the Discord sheet:', JSON.stringify(discordArcade));

    await sleep(500);
    const savedDiscord = await savedAppearance(cdp, DISCORD.id);
    check(
      savedDiscord && savedDiscord.skin === 'arcade',
      `The Discord record holds ${JSON.stringify(savedDiscord)} after choosing Arcade.`,
    );

    await chooseAppearance(cdp, DISCORD.name, 'off');
    const discordOff = await waitForStyle(
      cdp,
      discordStyle,
      'the Discord sheet to be removed',
      style => style.primary === '#313338',
    );
    check(
      discordOff.page === 'rgb(49, 51, 56)' &&
        discordOff.brand === '#5865f2' &&
        discordOff.link === 'rgb(0, 168, 252)',
      `Discord kept its tint after Off (${JSON.stringify(discordOff)}).`,
    );
    check(
      (await savedAppearance(cdp, DISCORD.id)) === null,
      'The Discord record still holds an appearance after Off.',
    );
    console.log('after Off on Discord:', JSON.stringify(discordOff));

    cdp.close();
    await stop();
    console.log('service appearance harness: PASS');
  } catch (error) {
    console.error('service appearance harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
    discordServer.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
