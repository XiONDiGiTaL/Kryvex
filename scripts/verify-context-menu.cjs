/* eslint-disable no-console */
/**
 * End-to-end check for the right-click menus, driven in the real app.
 *
 * It answers three questions a unit test cannot:
 *
 *   - does a real right-click inside a service guest open the menu at all, and
 *     does it offer only what applies to a service frame (no tab, no source);
 *   - does the same click inside a Kryvex browser tab add the tab-only entries;
 *   - does Send to… a service actually switch module and load the link.
 *
 * The tab strip's own menu is checked in the same run, because it shares the
 * component: duplicate, pin, mute and the three closes.
 *
 * Two loopback pages stand in for the services, so nothing needs an account or
 * the network. Run after `pnpm build`:
 *
 *   node scripts/verify-context-menu.cjs
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Menu Lab</title>
<style>
  body{font:16px system-ui;background:#101114;color:#e8eaed;padding:40px;line-height:1.6}
  a{color:#7fb2ff}
</style></head>
<body>
  <h1>Menu Lab</h1>
  <p id="prose">A paragraph a person can select before right-clicking it.</p>
  <p><a id="go" href="/link-target">A link worth sending somewhere</a></p>
  <p><input id="field" placeholder="Type here" style="font:inherit;width:260px;padding:6px"></p>
  <img id="pic" alt="a small tile" width="64" height="64" src="/pic.png">
</body></html>`;

// A one-pixel PNG, stood up on its own path so the image click is a real
// image with a real address rather than a data: URL.
const PIC = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function serve() {
  const server = http.createServer((request, response) => {
    if (request.url === '/pic.png') {
      response.writeHead(200, { 'content-type': 'image/png', 'content-length': PIC.length });
      response.end(PIC);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

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

async function guestTarget(port, match) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = list.find(
        item =>
          item.webSocketDebuggerUrl &&
          item.type !== 'page' &&
          typeof item.url === 'string' &&
          item.url.includes(match),
      );
      if (page) return page;
    } catch {
      /* the list comes and goes as guests attach */
    }
    await sleep(250);
  }
  throw new Error(`No guest target matching ${match}.`);
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
  await send('Page.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, timeout = 12000, label = expression) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(160);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function shot(client, name) {
  fs.mkdirSync(shots, { recursive: true });
  const result = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.data, 'base64'));
}

function launch(profile) {
  const port = 9333;
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
  return port;
}

async function stop() {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  await sleep(700);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

const lines = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
}

/** The menu as the person sees it: label, shortcut, and whether it is live. */
function menuSnapshot(client) {
  return client.evaluate(`(() => {
    const node = document.querySelector('.page-context');
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      header: node.querySelector('.service-context-title')?.textContent?.trim() || '',
      items: [...node.querySelectorAll('.page-context-line')].map(line => {
        const button = line.querySelector('[role="menuitem"]');
        return {
          label: line.querySelector('.page-context-label')?.textContent?.trim() || '',
          hint: line.querySelector('.page-context-key')?.textContent?.trim() || '',
          disabled: Boolean(button && button.disabled),
          submenu: Boolean(line.querySelector('.page-context-submenu')),
        };
      }),
      separators: node.querySelectorAll('.service-context-sep').length,
      radius: style.borderRadius,
      background: style.backgroundColor,
    };
  })()`);
}

const labels = menu => menu.items.map(item => item.label);

/** Where the menu actually is, and whether anything paints over it. */
function menuGeometry(client) {
  return client.evaluate(`(() => {
    const node = document.querySelector('.page-context');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 40);
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      innerHeight: window.innerHeight,
      pastBottom: Math.round(rect.bottom) > window.innerHeight,
      background: style.backgroundColor,
      backdrop: style.backdropFilter,
      maxHeight: style.maxHeight,
      scrollHeight: node.scrollHeight,
      overMenu: hit ? hit.tagName.toLowerCase() + '.' + (hit.className || '') : null,
    };
  })()`);
}

async function clickItem(client, label) {
  const clicked = await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.page-context [role="menuitem"]')];
    const button = buttons.find(node =>
      (node.querySelector('.page-context-label')?.textContent || '').trim() === ${JSON.stringify(label)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`The menu had no entry named ${label}.`);
  await sleep(240);
}

/** The middle of an element, checked to be the thing a click would land on. */
async function aimAt(client, selector) {
  const point = await client.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    return { x, y, hit: document.elementFromPoint(x, y) === node };
  })()`);
  if (!point || !point.hit) throw new Error(`Nothing clickable at ${selector}.`);
  return point;
}

/** Highlights the paragraph and says where to right-click inside it. */
async function selectParagraph(client) {
  const point = await client.evaluate(`(() => {
    const prose = document.getElementById('prose');
    const range = document.createRange();
    range.selectNodeContents(prose);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = prose.getBoundingClientRect();
    return { x: Math.round(rect.left + 8), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  if (!point) throw new Error('There is no paragraph to highlight.');
  return point;
}

async function closeMenu(client) {
  await client.evaluate(
    `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`,
  );
  await sleep(220);
}

const disabledOf = (menu, label) => menu.items.find(item => item.label === label)?.disabled;

/** A real right-click, through the input pipeline rather than a DOM event. */
async function rightClick(client, x, y) {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'right',
    buttons: 2,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'right',
    buttons: 0,
    clickCount: 1,
  });
}

/** Selects the paragraph and returns where the link sits, ready to click. */
async function aimAtLink(client) {
  const point = await client.evaluate(`(() => {
    const prose = document.getElementById('prose');
    const link = document.getElementById('go');
    // The selection has to reach the link: a right-click outside it would
    // collapse the selection before the menu is built, and then Copy and the
    // selection entries would rightly be missing.
    const range = document.createRange();
    range.setStart(prose.firstChild, 0);
    range.setEnd(link.firstChild, link.firstChild.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = link.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    return { x, y, onLink: document.elementFromPoint(x, y)?.id === 'go' };
  })()`);
  if (!point || !point.onLink) throw new Error('The fixture link is not where the check expects it.');
  return point;
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-menu-'));
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: [
        {
          id: 's-alpha',
          name: 'Alpha Lab',
          url: `${origin}/alpha`,
          category: 'other',
          color: '#5aa9e6',
          letter: 'A',
          pinned: true,
          createdAt: 1,
          persistence: 'keep',
        },
        {
          id: 's-beta',
          name: 'Beta Lab',
          url: `${origin}/beta`,
          category: 'other',
          color: '#2dd4bf',
          letter: 'B',
          pinned: true,
          createdAt: 2,
          persistence: 'keep',
        },
      ],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: { themeGallerySeen: true },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.pinned-item'))`, 20000, 'the shell');

  // 1. A service module: the menu belongs to the page, and has no tab to open.
  await client.evaluate(`window.location.hash = '#/service/s-alpha'; true;`);
  const alpha = await connect((await guestTarget(port, '/alpha')).webSocketDebuggerUrl);
  await waitFor(alpha.evaluate, `Boolean(document.getElementById('go'))`, 20000, 'the Alpha page');

  const point = await aimAtLink(alpha);
  await rightClick(alpha, point.x, point.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the page menu');
  const serviceMenu = await menuSnapshot(client);
  const serviceLabels = labels(serviceMenu);
  console.log('service menu:', serviceLabels.join(' | '));

  check(
    serviceLabels.includes('Send link to…') || serviceLabels.includes('Send page to…'),
    'a service right-click offers Send to… for another module',
  );
  check(serviceLabels.includes('Send link to…'), 'a clicked link gets its own Send link to… submenu');
  check(serviceLabels.includes('Copy link address'), 'a clicked link offers its address');
  check(serviceLabels.includes('Copy'), 'a selection offers Copy');
  check(serviceLabels.includes('Send the whole page to Vexium'), 'Send to Vexium is still there');
  check(serviceLabels.includes('Take screenshot'), 'the page actions are present');
  check(serviceLabels.includes('Back'), 'navigation is present');
  check(
    serviceMenu.items.find(item => item.label === 'Back')?.disabled === true,
    'Back is disabled on the first page in the module',
  );
  check(
    !serviceLabels.includes('Open link in a new tab'),
    'a service frame gets no new-tab entry: it has no tab',
  );
  check(!serviceLabels.includes('View page source'), 'a service frame gets no page source entry');
  check(!serviceLabels.includes('Copy image'), 'a click away from the image offers no image entries');
  check(
    serviceMenu.items.filter(item => item.hint === 'Ctrl+R' || item.hint === 'Ctrl+P').length >= 1,
    'shortcuts are shown beside their entries',
  );
  check(
    serviceMenu.radius !== '0px' && serviceMenu.background !== 'rgba(0, 0, 0, 0)',
    'the menu is themed, not a native popup',
  );
  console.log('service geometry', JSON.stringify(await menuGeometry(client)));
  await shot(client, 'verify-page-context-service');

  // 2. A field and an image: the editing entries, and a real Copy then Paste.
  await closeMenu(client);
  const fieldPoint = await aimAt(alpha, '#field');
  await rightClick(alpha, fieldPoint.x, fieldPoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the field menu');
  const fieldMenu = await menuSnapshot(client);
  const fieldLabels = labels(fieldMenu);
  console.log('field menu:', fieldLabels.join(' | '));

  check(fieldLabels.includes('Undo') && fieldLabels.includes('Redo'), 'a field offers Undo and Redo');
  check(fieldLabels.includes('Cut'), 'a field offers Cut');
  check(fieldLabels.includes('Copy'), 'a field offers Copy');
  check(fieldLabels.includes('Paste'), 'a field offers Paste');
  check(fieldLabels.includes('Paste and match style'), 'a field offers Paste and match style');
  check(fieldLabels.includes('Select all'), 'a field offers Select all');
  check(disabledOf(fieldMenu, 'Copy') === true, 'Copy is greyed in a field with nothing highlighted');
  check(disabledOf(fieldMenu, 'Cut') === true, 'Cut is greyed in a field with nothing highlighted');
  await shot(client, 'verify-page-context-field');

  // Highlight a paragraph, copy it through the menu, then paste it into the
  // field through the menu: the two entries have to be one hand-off.
  const prosePoint = await selectParagraph(alpha);
  await rightClick(alpha, prosePoint.x, prosePoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the selection menu');
  const selectionMenu = await menuSnapshot(client);
  const selectionLabels = labels(selectionMenu);
  check(selectionLabels.includes('Copy'), 'a highlighted paragraph offers Copy');
  check(!disabledOf(selectionMenu, 'Copy'), 'Copy is live for a highlighted paragraph');
  check(!selectionLabels.includes('Paste'), 'a page that cannot be edited is not offered a paste');
  check(selectionLabels.includes('Select all'), 'a highlighted paragraph still offers Select all');
  await clickItem(client, 'Copy');

  await rightClick(alpha, fieldPoint.x, fieldPoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the field menu again');
  await clickItem(client, 'Paste');
  await sleep(600);
  const pasteState = await alpha.evaluate(`({
    value: document.getElementById('field').value,
    active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
    highlighted: String(window.getSelection()).slice(0, 40),
  })`);
  console.log('paste state', JSON.stringify(pasteState));
  const pasted = pasteState.value;
  check(
    typeof pasted === 'string' && pasted.includes('A paragraph'),
    `Paste put the copied paragraph in the field (${JSON.stringify(pasted).slice(0, 50)})`,
  );

  await closeMenu(client);
  const picPoint = await aimAt(alpha, '#pic');
  await rightClick(alpha, picPoint.x, picPoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the image menu');
  const serviceImageMenu = await menuSnapshot(client);
  const serviceImageLabels = labels(serviceImageMenu);
  console.log('image menu:', serviceImageLabels.join(' | '));
  check(serviceImageLabels.includes('Copy image'), 'an image offers Copy image');
  check(serviceImageLabels.includes('Copy image address'), 'an image offers Copy image address');
  check(!serviceImageLabels.includes('Open image in a new tab'), 'a service frame cannot open an image in a tab');
  await shot(client, 'verify-page-context-image');

  // The channel refuses an address that is not an image: a page cannot name a
  // path of its own choosing this way.
  const refused = await client.evaluate(
    `window.kryvex.imageSave({ url: 'file:///C:/Windows/win.ini', suggested: 'x.png' })`,
  );
  check(
    Boolean(refused) && refused.ok === false,
    'Save image as… refuses an address that is not an image',
  );

  // Save image as…: the native dialog is filled the way a person fills it, and
  // the file that lands is the image itself.
  const kept = path.join(profile, 'saved-image.png');
  await clickItem(client, 'Save image as…');
  const dialog = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'save-dialog.ps1'),
      '-AppPid',
      String(children[0].pid),
      '-TargetPath',
      kept,
    ],
    { encoding: 'utf8', timeout: 60000 },
  );
  check(
    /accepted/.test(dialog.stdout || ''),
    `the native save dialog was filled and accepted (${(dialog.stdout || dialog.stderr || '').trim().slice(0, 80)})`,
  );
  // The dialog closes before the write does, so the file is waited for rather
  // than read the instant the helper returns.
  let landed = false;
  for (let attempt = 0; attempt < 40 && !landed; attempt += 1) {
    landed = fs.existsSync(kept) && fs.statSync(kept).size > 0;
    if (!landed) await sleep(250);
  }
  const savedBytes = fs.existsSync(kept) ? fs.readFileSync(kept) : Buffer.alloc(0);
  check(landed, `Save image as… wrote the file (${savedBytes.length} bytes)`);
  const pngMagic = savedBytes.subarray(0, 8);
  check(
    pngMagic.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'the saved file is the PNG the page served, not a placeholder',
  );
  const toasts = await client.evaluate(
    `[...document.querySelectorAll('.toast')].map(node => node.textContent.trim()).slice(-2)`,
  );
  check(
    toasts.some(text => text.includes('Saved to')),
    `the shell says where the image went (${JSON.stringify(toasts.slice(-1))})`,
  );
  await closeMenu(client);


  // The hand-over below needs a link click, and the image check closed its
  // menu: take the link again so the entry is there to choose.
  const linkAgain = await aimAtLink(alpha);
  await rightClick(alpha, linkAgain.x, linkAgain.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the link menu again');

  // 3. Send link to… the other module: it must come forward and load the link.
  await clickItem(client, 'Send link to…');
  const submenu = await menuSnapshot(client);
  check(
    submenu.items.some(item => item.label === 'Beta Lab'),
    'the submenu names the installed modules',
  );
  await shot(client, 'verify-page-context-send-submenu');
  await clickItem(client, 'Beta Lab');
  await waitFor(
    client.evaluate,
    `window.location.hash === '#/service/s-beta'`,
    8000,
    'the Beta module to come forward',
  );
  check(true, 'Send link to… switched to the Beta module');
  let sent = false;
  for (let attempt = 0; attempt < 20 && !sent; attempt += 1) {
    const urls = await client.evaluate(
      `(() => [...document.querySelectorAll('webview')].map(node => { try { return node.getURL(); } catch (error) { return 'unattached'; } }))()`,
    );
    sent = urls.some(url => typeof url === 'string' && url.includes('/link-target'));
    if (!sent) await sleep(600);
  }
  if (!sent) throw new Error('The Beta module never loaded the link that was sent to it.');
  check(true, 'the Beta guest loaded the link that was sent to it');

  // 4. A Kryvex browser tab: the same menu, plus the tab-only entries.
  await client.evaluate(
    `window.location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(`${origin}/browser`)}); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('.tab'))`, 15000, 'the browser tab strip');
  const browser = await connect((await guestTarget(port, '/browser')).webSocketDebuggerUrl);
  await waitFor(browser.evaluate, `Boolean(document.getElementById('go'))`, 20000, 'the browser page');
  const browserPoint = await aimAtLink(browser);
  await rightClick(browser, browserPoint.x, browserPoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the tab page menu');
  const tabPageMenu = await menuSnapshot(client);
  const tabPageLabels = labels(tabPageMenu);
  console.log('browser page menu:', tabPageLabels.join(' | '));

  check(tabPageLabels.includes('Open link in a new tab'), 'a browser tab opens a clicked link in a new tab');
  check(tabPageLabels.includes('View page source'), 'a browser tab offers the page source');
  check(tabPageLabels.includes('Send link to…'), 'a browser tab can still send its link to a module');
  check(tabPageLabels.includes('Inspect'), 'a browser tab can open DevTools');
  await shot(client, 'verify-page-context-browser');

  await closeMenu(client);
  const tabImagePoint = await aimAt(browser, '#pic');
  await rightClick(browser, tabImagePoint.x, tabImagePoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the tab image menu');
  const tabImageMenu = await menuSnapshot(client);
  const tabImageLabels = labels(tabImageMenu);
  check(tabImageLabels.includes('Open image in a new tab'), 'a browser tab opens a clicked image in a new tab');
  check(tabImageLabels.includes('Copy image'), 'a browser tab still offers Copy image');
  await closeMenu(client);

  // The link menu is opened again for the entry this section is about.
  const linkPoint = await aimAt(browser, '#go');
  await rightClick(browser, linkPoint.x, linkPoint.y);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 6000, 'the tab link menu');
  await clickItem(client, 'Open link in a new tab');
  const grew = await waitFor(
    client.evaluate,
    `document.querySelectorAll('.tab-strip .tab').length >= 2`,
    8000,
    'a second tab to open from the link',
  ).catch(() => false);
  const tabCount = await client.evaluate(`document.querySelectorAll('.tab-strip .tab').length`);
  const guests = await client.evaluate(
    `(() => [...document.querySelectorAll('webview')].map(node => { try { return node.getURL(); } catch (error) { return 'unattached'; } }))()`,
  );
  const atLink = guests.filter(url => typeof url === 'string' && url.includes('/link-target')).length;
  check(grew === true && tabCount >= 2, `Open link in a new tab added a tab (${tabCount} in the strip)`);
  check(atLink >= 1, 'the new tab is loaded on the link');

  // 5. The tab strip's own menu.
  await client.evaluate(`(() => {
    const tab = document.querySelector('.tab-strip .tab');
    const box = tab.getBoundingClientRect();
    tab.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
    }));
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 5000, 'the tab menu');
  const tabMenu = await menuSnapshot(client);
  const tabLabels = labels(tabMenu);
  console.log('tab menu:', tabLabels.join(' | '));
  for (const label of [
    'Reload',
    'Duplicate',
    'Pin tab',
    'Mute tab',
    'Close',
    'Close others',
    'Close tabs to the right',
  ]) {
    check(tabLabels.includes(label), `the tab menu offers ${label}`);
  }
  console.log('tab geometry', JSON.stringify(await menuGeometry(client)));
  await shot(client, 'verify-tab-context');
  await sleep(1500);
  await shot(client, 'verify-tab-context-settled');

  await clickItem(client, 'Pin tab');
  const pinned = await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.tab-strip .tab.is-pinned'))`,
    5000,
    'the pinned mark',
  ).catch(() => false);
  check(pinned === true, 'Pin tab moved the tab to the front with a mark');

  await client.evaluate(`(() => {
    const tab = document.querySelector('.tab-strip .tab');
    const box = tab.getBoundingClientRect();
    tab.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
    }));
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.page-context'))`, 5000, 'the tab menu again');
  await clickItem(client, 'Mute tab');
  const muted = await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.tab-strip .tab .tab-mark.is-quiet'))`,
    5000,
    'the muted mark',
  ).catch(() => false);
  check(muted === true, 'Mute tab left a mark on the tab');
  await shot(client, 'verify-tab-context-muted');

  console.log(`\ncontext menus: PASS (${lines.length} checks)`);
  console.log(
    'screenshots: verify-page-context-service.png, verify-page-context-field.png, ' +
      'verify-page-context-image.png, verify-page-context-browser.png, verify-tab-context.png',
  );
  await stop();
  server.close();
  process.exit(0);
}

main().catch(async error => {
  console.error(`\ncontext menus: FAIL ${error.message}`);
  await stop();
  process.exit(1);
});
