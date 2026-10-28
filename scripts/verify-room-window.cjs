/* eslint-disable no-console */
/**
 * End-to-end check for the two window paths that were reported broken.
 *
 * Covered here, in the built app with a disposable profile:
 *
 *   - a built-in tool card dragged out of the Services page lands as a real
 *     window on the Workspace canvas (the drop target is the Workspace entry in
 *     the sidebar, because the canvas is not on screen from another route);
 *   - Rooms can be dragged in the same way, and opens as a room window;
 *   - the room window carries its own "Bring it back" control, and using it
 *     closes the window and returns to the Rooms view;
 *   - maximizing a window keeps its title bar controls on screen, which is what
 *     "the window gets stuck" looked like.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-room-window.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9391);
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
    if (text.includes('wgc_capturer') || text.includes('GUEST_VIEW_MANAGER_CALL')) return;
    process.stderr.write(text);
  });
  children.push(child);
  return PORT;
}

async function stop() {
  for (const child of children) if (child.exitCode === null) child.kill();
  await sleep(700);
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
}

const lines = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  lines.push(`PASS ${message}`);
  console.log(`PASS ${message}`);
}

/**
 * Drags `from` to `to` with a real `DataTransfer`: the source's own dragstart
 * publishes the payload, the target reads it.
 */
function dragTo(client, fromSelector, toSelector, target = { x: 300, y: 260 }) {
  return client.evaluate(`(() => {
    const source = document.querySelector(${JSON.stringify(fromSelector)});
    const target = document.querySelector(${JSON.stringify(toSelector)});
    if (!source || !target) return 'missing';
    const box = target.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(box.left + ${target.x}),
      clientY: Math.round(box.top + ${target.y}),
    };
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragenter', { ...init, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragover', { ...init, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { ...init, dataTransfer: transfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }));
    return Array.from(transfer.types).length > 0 ? 'dragged' : 'no payload';
  })()`);
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-window-'));
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'kryvex-state.json'),
    JSON.stringify({
      version: 1,
      services: [],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: {
        themeGallerySeen: true,
        startView: 'services',
        secretServices: true,
        pinnedTools: [],
      },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.app-sidebar .nav-item'))`, 12000, 'the shell');

  // 1. The built-in tool card starts a real drag and the Workspace entry takes
  //    it: the canvas is not rendered from the Services route, so the sidebar is
  //    the only reachable drop target.
  await client.evaluate(`(() => {
    const card = [...document.querySelectorAll('.secret-card.is-tool')]
      .find(node => /Arcade/.test(node.innerText));
    card?.click();
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.arcade-view, .view'))`, 8000, 'the arcade view');

  // Back to Services, and expand the built-in section if it folded away.
  await client.evaluate(`(() => {
    const nav = [...document.querySelectorAll('.nav-item')].find(node => /Services/.test(node.innerText));
    nav?.click();
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.secret-toggle'))`, 8000, 'the secret section');
  await client.evaluate(`(() => {
    const toggle = document.querySelector('.secret-toggle[aria-expanded="false"]');
    if (toggle) toggle.click();
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.secret-card.is-tool[draggable="true"]'))`, 6000, 'a draggable tool card');

  // Arcade is one of the three tools that can be mounted twice, so it is the
  // one that must land as a window. (The card is addressed by `data-tool`; the
  // first draggable card is Lexium, which correctly opens its own view.)
  const cardDrag = await dragTo(
    client,
    '.secret-card.is-tool[data-tool="arcade"]',
    '.nav-item[data-nav="workspace"]',
  );
  check(cardDrag === 'dragged', `a built-in tool card publishes a drag payload (${cardDrag})`);

  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-tool-window[data-window^="tool:"]'))`,
    8000,
    'the tool window on the canvas',
  );
  // The canvas is measured after the navigation renders, so the window is
  // re-fitted once its box is known: read it settled, not mid-layout.
  const readToolWindow = () => client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame.is-tool-window[data-window^="tool:"]');
    const canvas = document.querySelector('.workspace-canvas');
    if (!frame || !canvas) return null;
    const a = frame.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    return {
      id: frame.dataset.window,
      hash: location.hash,
      inside: a.left >= b.left - 1 && a.top >= b.top - 1 && a.right <= b.right + 1 && a.bottom <= b.bottom + 1,
      resizable: Boolean(frame.querySelector('.service-window-edge')),
      frame: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)],
      canvas: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
    };
  })()`);
  let toolWindow = await readToolWindow();
  for (let attempt = 0; attempt < 20 && !toolWindow?.inside; attempt += 1) {
    await sleep(150);
    toolWindow = await readToolWindow();
  }
  check(Boolean(toolWindow?.id?.startsWith('tool:')), `the dropped tool opened in a window (${toolWindow?.id})`);
  check(/workspace/i.test(toolWindow?.hash ?? ''), `the drop went to the Workspace (${toolWindow?.hash})`);
  check(
    toolWindow?.inside === true,
    `the window sits inside the canvas (${JSON.stringify(toolWindow?.frame)} in ${JSON.stringify(toolWindow?.canvas)})`,
  );
  check(toolWindow?.resizable === true, 'the window has resize edges, like a service window');

  // 2. Rooms travels the same way.
  const roomDrag = await dragTo(
    client,
    '.nav-item[data-nav="rooms"][draggable="true"]',
    '.workspace-canvas',
    { x: 420, y: 300 },
  );
  check(roomDrag === 'dragged', `the Rooms entry publishes a drag payload (${roomDrag})`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-tool-window[data-window="view:rooms"]'))`,
    8000,
    'the room window',
  );
  check(true, 'the room opened in a window on the canvas');

  // 3. The window carries its own way back.
  const dock = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-window="view:rooms"]');
    const button = frame?.querySelector('.window-dock');
    return button ? button.textContent.trim() : null;
  })()`);
  check(/Bring it back/i.test(dock ?? ''), `the room window carries its own way back (${dock})`);

  // 4. Maximize: the frame fills the canvas and its controls stay on screen.
  await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-window="view:rooms"]');
    const buttons = [...(frame?.querySelectorAll('.window-controls .icon-btn') ?? [])];
    buttons[1]?.click();
    return true;
  })()`);
  await sleep(500);
  const maximized = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-window="view:rooms"]');
    const canvas = document.querySelector('.workspace-canvas');
    if (!frame || !canvas) return null;
    const a = frame.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    const dock = frame.querySelector('.window-dock')?.getBoundingClientRect();
    return {
      fills: Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2,
      dockVisible:
        Boolean(dock) &&
        dock.top >= 0 &&
        dock.left >= 0 &&
        dock.bottom <= window.innerHeight &&
        dock.right <= window.innerWidth,
      dockOnTop:
        Boolean(dock) &&
        Boolean(document.elementFromPoint(dock.left + 4, dock.top + 4)?.closest('.window-dock')),
    };
  })()`);
  check(maximized?.fills === true, 'maximize fills the canvas');
  check(maximized?.dockVisible === true, 'the maximized window keeps its controls on screen');
  check(maximized?.dockOnTop === true, 'the controls are the topmost element, so they can be clicked');

  // 5. And the control really returns the room.
  await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-window="view:rooms"]');
    frame?.querySelector('.window-dock')?.click();
    return true;
  })()`);
  await waitFor(
    client.evaluate,
    `!document.querySelector('.service-frame[data-window="view:rooms"]')`,
    6000,
    'the window to close',
  );
  const docked = await client.evaluate(`({ hash: location.hash, view: Boolean(document.querySelector('.rooms-view')) })`);
  check(/rooms/i.test(docked.hash), `docking returns to the Rooms view (${docked.hash})`);
  check(docked.view === true, 'the Rooms view is drawn again');

  check(client.exceptions.length === 0, `no page errors were thrown (${client.exceptions.join(' | ')})`);

  client.close();
  await stop();
  console.log(`\n${lines.length} checks passed.`);
}

main().catch(async error => {
  console.error(`\nFAIL ${error.message}`);
  await stop();
  process.exit(1);
});
