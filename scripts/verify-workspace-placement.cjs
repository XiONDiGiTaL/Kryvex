/* eslint-disable no-console */
/**
 * End-to-end check for placing services on the Workspace canvas.
 *
 * It drives the installed app in a disposable profile against a local fixture,
 * and covers the two things a user reported about the canvas:
 *
 *   - a service already in the sidebar can be dropped onto the canvas and opens
 *     as a window there;
 *   - adding a service that is already installed does not leave a second entry
 *     in the sidebar. The dialog says so before the save, saving frames the
 *     record they already have, and the instance switch is the only way to ask
 *     for a deliberate second copy.
 *
 * The service count is read back from the profile on disk, so "no duplicate"
 * means the state file, not just the DOM. Run after `pnpm build`:
 *
 *   node scripts/verify-workspace-placement.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9388);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Tone Lab</title></head>
<body style="font:16px system-ui;background:#111;color:#eee;padding:40px">
<h1>Tone Lab</h1><p>A local page for the canvas placement check.</p>
</body></html>`;

async function serve() {
  const server = http.createServer((request, response) => {
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

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const exceptions = [];
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params?.exceptionDetails?.exception?.description ?? 'exception');
    }
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
  return { evaluate, send, exceptions, close: () => socket.close() };
}

async function waitFor(evaluate, expression, timeout = 8000, label = expression) {
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
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
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
    // The screen-capture warning is noise on a machine with no capture device,
    // and re-framing a window ends the guest's in-flight navigation by design.
    if (text.includes('wgc_capturer') || text.includes('GUEST_VIEW_MANAGER_CALL')) return;
    process.stderr.write(text);
  });
  children.push(child);
  return PORT;
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

/** The service records the profile on disk holds, which is where a duplicate shows. */
function savedServices(statePath) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  return state.services;
}

/**
 * A drag with a real `DataTransfer`, the way a pinned row starts one. Chromium
 * lets a test build the transfer, which is the only way to reach the drop
 * handler's MIME read: the row publishes the payload, the canvas reads it.
 *
 * The row is named by its own selector and the payload by its MIME type, so the
 * same gesture proves both kinds of pin: a service row publishes
 * `x-kryvex-service`, a built-in tool row publishes `x-kryvex-tool`.
 */
function dragPinnedToCanvas(client, selector, target, type = 'application/x-kryvex-service') {
  return client.evaluate(`(() => {
    const row = document.querySelector(${JSON.stringify(selector)});
    const canvas = document.querySelector('.workspace-canvas');
    if (!row || !canvas) return 'missing';
    const box = canvas.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(box.left + ${target.x}),
      clientY: Math.round(box.top + ${target.y}),
    };
    const transfer = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    canvas.dispatchEvent(new DragEvent('dragenter', { ...init, dataTransfer: transfer }));
    canvas.dispatchEvent(new DragEvent('dragover', { ...init, dataTransfer: transfer }));
    canvas.dispatchEvent(new DragEvent('drop', { ...init, dataTransfer: transfer }));
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    return transfer.getData(${JSON.stringify(type)}) ? 'dragged' : 'no payload';
  })()`);
}

/** Whether a stored record points at the same site as `url`. */
function sameSite(service, url) {
  try {
    return new URL(service.url).host === new URL(url).host;
  } catch {
    return false;
  }
}

/**
 * Types into the dialog's name and URL fields the way a person does: React
 * tracks its own value, so the native setter plus an input event is what makes
 * the form state actually change.
 */
function fillForm(client, fields) {
  return client.evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const type = (input, value) => {
      if (!input) return false;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const name = document.querySelector('#service-form input[placeholder="Linear"]');
    const url = document.querySelector('#service-form input[placeholder="linear.app"]');
    if (!name || !url) return 'no fields';
    type(name, ${JSON.stringify(fields.name)});
    type(url, ${JSON.stringify(fields.url)});
    return 'filled';
  })()`);
}

/** Waits for the profile on disk to satisfy `done`, so persistence is not raced. */
async function waitForState(statePath, done, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let last = [];
  while (Date.now() < deadline) {
    try {
      last = savedServices(statePath);
      if (done(last)) return last;
    } catch {
      /* the write may be mid-flight */
    }
    await sleep(150);
  }
  return last;
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-canvas-'));
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const userData = path.join(profile, 'Kryvex');
  const statePath = path.join(userData, 'kryvex-state.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      version: 1,
      services: [
        {
          id: 's-tone',
          name: 'Tone Lab',
          url: origin,
          category: 'other',
          color: '#5aa9e6',
          letter: 'T',
          pinned: true,
          createdAt: 1,
        },
        {
          id: 's-notes',
          name: 'Tone Notes',
          url: `${origin}notes`,
          category: 'other',
          color: '#2dd4bf',
          letter: 'N',
          pinned: true,
          createdAt: 2,
        },
      ],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: {
        themeGallerySeen: true,
        startView: 'workspace',
        // The rail only lists a tool pin once the tools are on; Canvas is the
        // one dragged in the last check.
        secretServices: true,
        pinnedTools: ['canvas', 'lexium'],
      },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.app-sidebar .pinned-item'))`, 12000, 'the shell');

  // 1. The Workspace starts empty and offers both ways in.
  await client.evaluate(`window.location.hash = '#/workspace'; true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.workspace-canvas'))`, 6000, 'the canvas');
  const empty = await client.evaluate(`(() => {
    const canvas = document.querySelector('.workspace-canvas');
    return { empty: canvas.classList.contains('is-empty'), text: canvas.innerText };
  })()`);
  check(empty.empty, 'the canvas starts empty');
  check(/Add service/.test(empty.text), 'the empty canvas offers Add service');
  const dragged = await dragPinnedToCanvas(
    client,
    '.pinned-list li[data-service="s-tone"]',
    { x: 220, y: 160 },
  );
  check(dragged === 'dragged', `the pinned row publishes a drag payload (${dragged})`);

  // 2. A service already in the sidebar opens as a window on the canvas.
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-window[data-service="s-tone"]'))`,
    8000,
    'the dropped window',
  );
  const dropped = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame.is-window[data-service="s-tone"]');
    const canvas = document.querySelector('.workspace-canvas').getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    return {
      canvasEmpty: document.querySelector('.workspace-canvas').classList.contains('is-empty'),
      inside: box.left >= canvas.left - 1 && box.top >= canvas.top - 1
        && box.right <= canvas.right + 1 && box.bottom <= canvas.bottom + 1,
      guest: Boolean(frame.querySelector('webview')),
      count: document.querySelectorAll('.service-frame.is-window').length,
    };
  })()`);
  check(dropped.guest, 'the window holds the live service');
  check(!dropped.canvasEmpty, 'the canvas no longer shows its empty state');
  check(dropped.inside, 'the dropped window sits inside the canvas');
  check(dropped.count === 1, `one window is open (${dropped.count})`);
  await shot(client, 'verify-canvas-drop');

  // 3. The dialog lists what is installed and frames it without adding a record.
  await client.evaluate(
    `[...document.querySelectorAll('.workspace-bar button')].find(b => b.innerText.includes('Add service')).click(); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('#service-form'))`, 4000, 'the service dialog');
  const installed = await client.evaluate(`(() => ({
    heading: document.body.innerText.includes('INSTALLED SERVICES'),
    chips: [...document.querySelectorAll('.preset-chip')].map(chip => chip.textContent || ''),
  }))()`);
  check(installed.heading, 'the dialog labels the installed group');
  check(
    installed.chips.some(chip => chip.includes('Tone Lab')) &&
      installed.chips.some(chip => chip.includes('Tone Notes')),
    `both installed services are offered (${installed.chips.join(', ')})`,
  );
  await shot(client, 'verify-canvas-installed-chips');

  const clicked = await client.evaluate(`(() => {
    const chip = [...document.querySelectorAll('.preset-chip')]
      .find(item => item.textContent.includes('Tone Notes'));
    if (!chip) {
      return 'missing: ' + [...document.querySelectorAll('.preset-chip')]
        .map(item => JSON.stringify(item.textContent)).join(' ');
    }
    chip.click();
    return 'clicked';
  })()`);
  check(clicked === 'clicked', `the installed chip is clickable (${clicked})`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-window[data-service="s-notes"]'))`,
    8000,
    'the second window',
  );
  const placed = await client.evaluate(`(() => ({
    dialog: Boolean(document.querySelector('#service-form')),
    windows: [...document.querySelectorAll('.service-frame.is-window')].map(f => f.dataset.service).sort(),
  }))()`);
  check(!placed.dialog, 'placing a service closes the dialog');
  check(placed.windows.join(',') === 's-notes,s-tone', `two windows are open (${placed.windows})`);
  check(savedServices(statePath).length === 2, 'placing a service adds no record to the profile');

  // 4. Re-adding an installed site is announced, not duplicated.
  await client.evaluate(
    `[...document.querySelectorAll('.workspace-bar button')].find(b => b.innerText.includes('Add service')).click(); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('#service-form'))`, 4000, 'the dialog again');
  const typed = await fillForm(client, { name: 'Tone Lab again', url: origin });
  check(typed === 'filled', 'the form takes a name and a URL');
  await waitFor(client.evaluate, `Boolean(document.querySelector('.service-clash'))`, 4000, 'the clash note');
  const clash = await client.evaluate(`document.querySelector('.service-clash').innerText`);
  check(/already installed/i.test(clash), `the dialog warns before the save (${clash})`);
  await shot(client, 'verify-canvas-clash-note');

  await client.evaluate(
    `document.querySelector('.modal-foot button[type="submit"]').click(); true;`,
  );
  await waitFor(client.evaluate, `!document.querySelector('#service-form')`, 4000, 'the dialog to close');
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.toast'))`,
    4000,
    'the reuse toast',
  );
  const reuse = await client.evaluate(`(() => ({
    toast: document.querySelector('.toast').innerText,
    toastTone: document.querySelector('.toast').className,
    windows: [...document.querySelectorAll('.service-frame.is-window')].map(f => f.dataset.service).sort(),
  }))()`);
  check(/already installed/i.test(reuse.toast), `the toast explains what happened (${reuse.toast})`);
  check(reuse.windows.includes('s-tone'), 'the existing service was framed instead');
  check(savedServices(statePath).length === 2, 'saving an installed site adds no second record');
  check(
    savedServices(statePath).filter(service => sameSite(service, origin)).length === 2,
    'the profile still holds one record per site',
  );

  // 5. The instance switch is the deliberate way to a second copy.
  await client.evaluate(
    `[...document.querySelectorAll('.workspace-bar button')].find(b => b.innerText.includes('Add service')).click(); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('#service-form'))`, 4000, 'the dialog once more');
  await fillForm(client, { name: 'Tone Lab second login', url: origin });
  await client.evaluate(
    `document.querySelector('#service-form input[name="multipleInstances"]').click(); true;`,
  );
  const cleared = await client.evaluate(`!document.querySelector('.service-clash')`);
  check(cleared, 'the warning goes when the instance switch is on');
  await client.evaluate(`document.querySelector('.modal-foot button[type="submit"]').click(); true;`);
  await waitFor(client.evaluate, `!document.querySelector('#service-form')`, 4000, 'the dialog to close');
  await waitFor(client.evaluate, `Boolean(document.querySelector('.toast'))`, 4000, 'the added toast');
  const records = await waitForState(
    statePath,
    services => services.filter(service => sameSite(service, origin)).length === 3,
    10000,
  );
  const copies = records.filter(service => sameSite(service, origin));
  check(copies.length === 3, `the switch adds a deliberate second copy (${copies.length} records)`);
  check(
    copies.filter(service => new URL(service.url).pathname === '/').length === 2,
    'the two records for one site keep separate ids and sessions',
  );
  check(
    new Set(copies.map(service => service.id)).size === copies.length,
    'every instance has its own id, so each keeps its own partition',
  );

  // 6. A pinned built-in tool drags in the same way, and opens its own window.
  //    It rides a different MIME type, so this also proves the rail and the
  //    canvas tell the two gestures apart.
  const serviceWindowsBefore = await client.evaluate(
    `document.querySelectorAll('.service-frame.is-window[data-service]').length`,
  );
  const toolDragged = await dragPinnedToCanvas(
    client,
    '.pinned-list li[data-tool="canvas"]',
    { x: 300, y: 220 },
    'application/x-kryvex-tool',
  );
  check(toolDragged === 'dragged', `the tool pin publishes a drag payload (${toolDragged})`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-tool-window[data-window="tool:canvas"]'))`,
    8000,
    'the tool window',
  );
  // The window arrives with its enter animation, which starts it a few pixels
  // below its place. Measuring before that settles would read the animation
  // rather than the placement, so the box is read once the frame has landed.
  await waitFor(
    client.evaluate,
    `!document.querySelector('.service-frame.is-tool-window[data-window="tool:canvas"]').classList.contains('is-opening')`,
    4000,
    'the tool window to settle',
  );
  const toolWindow = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame.is-tool-window[data-window="tool:canvas"]');
    const box = frame.getBoundingClientRect();
    const canvas = document.querySelector('.workspace-canvas').getBoundingClientRect();
    const stage = frame.parentElement.getBoundingClientRect();
    return {
      stage: [stage.left, stage.top, stage.right, stage.bottom].map(Math.round),
      inline: [frame.style.left, frame.style.top, frame.style.width, frame.style.height],
      name: (frame.querySelector('.service-title-line h1') || {}).textContent || '',
      inside: box.left >= canvas.left - 1 && box.top >= canvas.top - 1
        && box.right <= canvas.right + 1 && box.bottom <= canvas.bottom + 1,
      box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      canvasBox: [canvas.left, canvas.top, canvas.right, canvas.bottom].map(Math.round),
      sheet: Boolean(frame.querySelector('canvas.canvas-sheet')),
      serviceWindows: document.querySelectorAll('.service-frame.is-window[data-service]').length,
    };
  })()`);
  check(/Canvas/.test(toolWindow.name), `the dropped tool names itself in its title bar (${toolWindow.name})`);
  check(
    toolWindow.inside,
    `the dropped tool window sits inside the canvas (${toolWindow.box} in ${toolWindow.canvasBox})`,
  );
  check(toolWindow.sheet, 'the dropped tool window holds the tool itself');
  check(savedServices(statePath).length === 3, 'dropping a tool adds nothing to the service list');
  check(
    toolWindow.serviceWindows === serviceWindowsBefore,
    `the service windows are untouched by the tool drop (${serviceWindowsBefore} → ${toolWindow.serviceWindows})`,
  );
  await shot(client, 'verify-canvas-tool-drop');

  // 7. A tool that owns one session opens in a window too — and stays one copy.
  //    Its route names the window and offers it back rather than starting a
  //    second server behind the first, which is what replaced the old refusal.
  const singleDragged = await dragPinnedToCanvas(
    client,
    '.pinned-list li[data-tool="lexium"]',
    { x: 400, y: 260 },
    'application/x-kryvex-tool',
  );
  check(singleDragged === 'dragged', `a single-session tool drags too (${singleDragged})`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-tool-window[data-window="tool:lexium"] .lexium-view'))`,
    8000,
    'the single-session tool window',
  );
  const single = await client.evaluate(`(() => ({
    window: Boolean(document.querySelector('.service-frame.is-tool-window[data-window="tool:lexium"]')),
    copies: document.querySelectorAll('.lexium-view').length,
  }))()`);
  check(single.window, 'the single-session tool opens in a window');
  check(single.copies === 1, `only the window holds the tool (${single.copies} copies)`);

  await client.evaluate(`(() => { window.location.hash = '#/lexium'; return true; })()`);
  await waitFor(
    client.evaluate,
    `[...document.querySelectorAll('.empty-state')].some(card =>
      (card.querySelector('h3')?.textContent ?? '').includes('Lexium') &&
      [...card.querySelectorAll('button')].some(button => /bring it back/i.test(button.textContent)))`,
    6000,
    'the docking card on the Lexium route',
  );
  // The window itself is canvas-bound, so nothing draws it on this route: what
  // must not appear here is a *second* Lexium, and what must appear is the card.
  check(
    (await client.evaluate(`document.querySelectorAll('.lexium-view').length`)) === 0,
    'the route draws no copy of the tool while a window holds it',
  );
  await client.evaluate(`(() => {
    const card = [...document.querySelectorAll('.empty-state')].find(node =>
      [...node.querySelectorAll('button')].some(button => /bring it back/i.test(button.textContent)));
    [...card.querySelectorAll('button')].find(button => /bring it back/i.test(button.textContent)).click();
    return true;
  })()`);
  await waitFor(
    client.evaluate,
    `!document.querySelector('.service-frame.is-tool-window[data-window="tool:lexium"]')`,
    8000,
    'the tool window to close',
  );
  check(
    (await client.evaluate(`document.querySelectorAll('.lexium-view').length`)) === 1,
    'bringing it back puts the tool on its route',
  );

  check(
    client.exceptions.length === 0,
    `no page errors were thrown (${client.exceptions.join(' | ')})`,
  );

  client.close();
  await stop();
  server.close();
  console.log(`\n${lines.length} checks passed.`);
}

main().catch(async error => {
  console.error(`\nFAIL ${error.message}`);
  await stop();
  process.exit(1);
});
