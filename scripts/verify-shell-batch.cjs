/* eslint-disable no-console */
/**
 * End-to-end check for the shell batch that follows 0.9.5's built-in tools.
 *
 * It drives the built app in a disposable profile over CDP and proves, in the
 * order a person meets them:
 *
 *   - the options panel behind a service card's sliders button closes when a
 *     press lands outside it, and a press inside it does not;
 *   - the world clock's 12/24-hour switch changes the card's rows and leaves the
 *     board clock alone, and the board clock's own switch does the reverse;
 *   - the calculator shows a blinking caret only while it holds focus;
 *   - a Home section can be moved above another one from the board's own
 *     controls, and the page is drawn in the new order;
 *   - Rooms pops out into a window over the app (the route says where it went),
 *     the window drags inside the viewport, and *Bring it back* returns it.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-shell-batch.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9393);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

async function target(port) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
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
    await sleep(150);
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
    // The capture warning is noise on a machine with no capture device.
    if (text.includes('wgc_capturer') || text.includes('GUEST_VIEW_MANAGER_CALL')) return;
    process.stderr.write(text);
  });
  children.push(child);
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

/** Moves the app to a route and waits for the view to be mounted. */
async function go(client, view, selector) {
  await client.evaluate(`(() => { window.location.hash = '#/${view}'; return true; })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, 8000, view);
}

/** A real press, the way the browser delivers one. */
const press = (target, x, y) => `(() => {
  const node = document.querySelector(${JSON.stringify(target)});
  if (!node) return false;
  const box = node.getBoundingClientRect();
  const at = {
    clientX: Math.round(box.left + (${x})), clientY: Math.round(box.top + (${y})),
    pointerId: 7, pointerType: 'mouse', buttons: 1, bubbles: true, cancelable: true,
    isPrimary: true,
  };
  node.dispatchEvent(new PointerEvent('pointerdown', at));
  node.dispatchEvent(new PointerEvent('pointerup', at));
  node.dispatchEvent(new MouseEvent('click', { ...at, button: 0 }));
  return true;
})()`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-shell-'));
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
          url: 'https://example.invalid/',
          category: 'other',
          color: '#5aa9e6',
          letter: 'T',
          pinned: true,
          createdAt: 1,
        },
      ],
      settings: {
        home: {
          showClock: true,
          showCalculator: true,
          worldClocks: [
            {
              id: 'zone-europe-istanbul-izmir',
              zone: 'Europe/Istanbul',
              city: 'İzmir',
              country: 'Türkiye',
              latitude: 38.42,
              longitude: 27.14,
            },
          ],
        },
      },
    }),
  );
  launch(profile);
  const page = await target(PORT);
  const client = await connect(page.webSocketDebuggerUrl);

  try {
    await waitFor(client.evaluate, `Boolean(document.querySelector('.app'))`, 20000, 'the shell');

    /* ------------------------------------------- the options panel closes --- */
    await go(client, 'services', '.service-card');
    await waitFor(client.evaluate, `Boolean(document.querySelector('.service-quick.is-card .icon-btn'))`, 6000, 'the sliders button');
    await client.evaluate(press('.service-quick.is-card .icon-btn', 8, 8));
    await waitFor(client.evaluate, `Boolean(document.querySelector('.service-quick-panel'))`, 5000, 'the options panel');
    check(true, 'the sliders button opens the options panel');

    // A press on the panel's own switch is not an outside press.
    await client.evaluate(press('.service-quick-panel .switch', 10, 10));
    await sleep(200);
    check(
      await client.evaluate(`Boolean(document.querySelector('.service-quick-panel'))`),
      'a press inside the panel leaves it open',
    );

    await client.evaluate(press('.view-head h1', 4, 4));
    await waitFor(
      client.evaluate,
      `!document.querySelector('.service-quick-panel')`,
      5000,
      'the panel to close',
    );
    check(true, 'a press outside the panel closes it');

    /* --------------------------------------------------- the two clocks --- */
    await go(client, 'home', '.home-clock');
    await waitFor(client.evaluate, `Boolean(document.querySelector('.home-world-clock .home-clock-list li'))`, 6000, 'the world clock rows');
    const before = await client.evaluate(`(() => ({
      board: document.querySelector('.home-time').textContent,
      rows: Array.from(document.querySelectorAll('.home-clock-time')).map(node => node.textContent),
    }))()`);

    await client.evaluate(press('.home-world-clock .home-clock-mode', 6, 6));
    await sleep(300);
    const afterWorld = await client.evaluate(`(() => ({
      board: document.querySelector('.home-time').textContent,
      rows: Array.from(document.querySelectorAll('.home-clock-time')).map(node => node.textContent),
    }))()`);
    check(
      afterWorld.rows.join('|') !== before.rows.join('|'),
      `the world clock switch changes its own rows (${before.rows.join(', ')} → ${afterWorld.rows.join(', ')})`,
    );
    check(
      afterWorld.board === before.board,
      `the world clock switch leaves the board clock alone (${afterWorld.board})`,
    );

    await client.evaluate(press('.home-board-tools .home-clock-mode', 6, 6));
    await sleep(300);
    const afterBoard = await client.evaluate(`(() => ({
      board: document.querySelector('.home-time').textContent,
      rows: Array.from(document.querySelectorAll('.home-clock-time')).map(node => node.textContent),
    }))()`);
    check(
      afterBoard.board !== afterWorld.board,
      `the board clock switch changes the board clock (${afterWorld.board} → ${afterBoard.board})`,
    );
    check(
      afterBoard.rows.join('|') === afterWorld.rows.join('|'),
      'the board clock switch leaves the world clock alone',
    );

    /* --------------------------------------------------- calculator caret --- */
    const caretBefore = await client.evaluate(
      `Boolean(document.querySelector('.home-calc-caret'))`,
    );
    check(!caretBefore, 'the calculator shows no caret before it is clicked');
    await client.evaluate(press('.home-calculator', 30, 30));
    await waitFor(client.evaluate, `Boolean(document.querySelector('.home-calc-caret'))`, 4000, 'the caret');
    const blinking = await client.evaluate(`(() => {
      const caret = document.querySelector('.home-calc-caret');
      const style = window.getComputedStyle(caret);
      return { animation: style.animationName, duration: style.animationDuration };
    })()`);
    check(
      blinking.animation !== 'none' && blinking.duration !== '0s',
      `the caret blinks while the calculator has focus (${blinking.animation} ${blinking.duration})`,
    );
    await client.evaluate(`(() => { document.activeElement.blur(); return true; })()`);
    await waitFor(
      client.evaluate,
      `!document.querySelector('.home-calc-caret')`,
      4000,
      'the caret to go',
    );
    check(true, 'the caret goes when the calculator loses focus');

    /* -------------------------------------------------- Home section order --- */
    const orderBefore = await client.evaluate(
      `Array.from(document.querySelectorAll('.home-view h2')).map(node => node.textContent)`,
    );
    // Open the picker, then move the last named section up one place.
    await client.evaluate(press('.home-customize', 8, 8));
    await waitFor(client.evaluate, `Boolean(document.querySelector('.home-widget-picker'))`, 5000, 'the picker');
    const moved = await client.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.home-widget-picker .home-widget-row'));
      const row = rows.find(node => /Startup/.test(node.textContent));
      if (!row) return 'no row';
      const up = row.querySelector('.home-widget-actions button');
      if (!up || up.disabled) return 'no button';
      up.click();
      return 'clicked';
    })()`);
    check(moved === 'clicked', 'the board offers an arrow to move a Home section up');
    await sleep(300);
    const orderAfter = await client.evaluate(
      `Array.from(document.querySelectorAll('.home-view h2')).map(node => node.textContent)`,
    );
    check(
      orderAfter.join('|') !== orderBefore.join('|'),
      `the page is drawn in the new order (${orderBefore.join(' → ')} ⇒ ${orderAfter.join(' → ')})`,
    );
    await client.evaluate(press('.home-customize', 8, 8));
    await waitFor(
      client.evaluate,
      `!document.querySelector('.home-widget-picker')`,
      5000,
      'the picker to close',
    );
    check(true, 'the picker closes again, leaving the new order in place');

    /* ------------------------------------------------- the Rooms pop-out --- */
    await go(client, 'rooms', '.rooms-view');
    const hasPopOut = await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.rooms-view .view-head-actions button'))
        .find(node => /pop out/i.test(node.textContent));
      return Boolean(button);
    })()`);
    check(hasPopOut, 'the Rooms view offers a pop-out');
    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.rooms-view .view-head-actions button'))
        .find(node => /pop out/i.test(node.textContent));
      button.click();
      return true;
    })()`);

    await waitFor(client.evaluate, `Boolean(document.querySelector('.service-frame.is-tool-window'))`, 8000, 'the pop-out window');
    const frame = await client.evaluate(`(() => {
      const node = document.querySelector('.service-frame.is-tool-window');
      const rect = node.getBoundingClientRect();
      return {
        title: node.querySelector('.service-toolbar h1').textContent,
        kind: node.className,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        controls: node.querySelectorAll('.window-controls button').length,
        holdsRooms: Boolean(node.querySelector('.rooms-view')),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    })()`);
    check(frame.title.trim() === 'Rooms', `the window is titled Rooms (${frame.title.trim()})`);
    check(frame.holdsRooms, 'the window holds the room itself, not a copy of the page');
    check(frame.controls === 3, 'the window carries minimize, maximize and close');
    check(
      frame.left >= 0 &&
        frame.top >= 0 &&
        frame.left + frame.width <= frame.viewport.width + 1 &&
        frame.top + frame.height <= frame.viewport.height + 1,
      `the window opens inside the viewport (${Math.round(frame.left)}, ${Math.round(frame.top)} of ${frame.viewport.width}×${frame.viewport.height})`,
    );
    const route = await client.evaluate(`(() => ({
      popped: Boolean(document.querySelector('.rooms-popped')),
      text: (document.querySelector('.rooms-popped') || document.body).textContent
        .replace(/\\s+/g, ' ').slice(0, 240),
    }))()`);
    check(
      route.popped && /open in a window/i.test(route.text),
      `the route says where the room went (${route.text})`,
    );

    const dragged = await client.evaluate(`(async () => {
      const node = document.querySelector('.service-frame.is-tool-window');
      const bar = node.querySelector('.service-toolbar');
      const point = (x, y) => ({
        clientX: Math.round(x), clientY: Math.round(y), pointerId: 9,
        pointerType: 'mouse', buttons: 1, bubbles: true, isPrimary: true,
      });
      const box = bar.getBoundingClientRect();
      const from = { x: box.left + 120, y: box.top + 12 };
      const before = node.getBoundingClientRect();
      bar.dispatchEvent(new PointerEvent('pointerdown', point(from.x, from.y)));
      bar.dispatchEvent(new PointerEvent('pointermove', point(from.x + 40, from.y + 40)));
      await new Promise(resolve => setTimeout(resolve, 40));
      bar.dispatchEvent(new PointerEvent('pointerup', point(from.x + 40, from.y + 40)));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const after = node.getBoundingClientRect();
      return { fromLeft: before.left, fromTop: before.top, left: after.left, top: after.top };
    })()`);
    check(
      Math.abs(dragged.left - dragged.fromLeft) > 1 || Math.abs(dragged.top - dragged.fromTop) > 1,
      `the pop-out drags by its title bar (${Math.round(dragged.left - dragged.fromLeft)}, ${Math.round(dragged.top - dragged.fromTop)})`,
    );

    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.rooms-popped button'))
        .find(node => /bring it back/i.test(node.textContent));
      button.click();
      return true;
    })()`);
    await waitFor(
      client.evaluate,
      `!document.querySelector('.service-frame.is-tool-window') && Boolean(document.querySelector('.rooms-view .view-head'))`,
      8000,
      'the room to come back',
    );
    check(true, 'Bring it back returns the room to its own view');

    check(client.exceptions.length === 0, `no renderer exceptions (${client.exceptions.slice(0, 2).join(' | ')})`);

    fs.writeFileSync(path.join(root, '.tmp-shell-batch-report.txt'), `${lines.join('\n')}\n`);
    console.log(`\nAll checks passed (${lines.length}).`);
  } finally {
    client.close();
    await stop();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(300);
      }
    }
  }
}

main().catch(async error => {
  console.error(`\nFAILED: ${error.message}`);
  fs.writeFileSync(
    path.join(root, '.tmp-shell-batch-report.txt'),
    JSON.stringify({ error: error.message, checks: lines }, null, 1),
  );
  await stop();
  process.exit(1);
});
