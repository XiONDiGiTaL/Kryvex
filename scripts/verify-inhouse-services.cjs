/* eslint-disable no-console */
/**
 * End-to-end check for the tools 0.9.5 adds: Arcade (x535), File Forge (x536)
 * and Canvas (x537), plus the built-in tool windows on the Workspace.
 *
 * It drives the built app in a disposable profile over CDP. What it proves,
 * in the order a user meets it:
 *
 *   - the secret-services section lists eight built-in services, including the
 *     three new cards;
 *   - Arcade loads the xiondigital.net page in its own persistent partition,
 *     and says so in the DOM rather than showing a spinner, and the guest is
 *     laid out at the frame's size with its cards revealed rather than held at
 *     Chromium's default 300x150;
 *   - File Forge renders its four groups, and the file boundary refuses a name
 *     it must not write, a rename of a file the user never picked, and an empty
 *     export — each as a code, with no dialog and no file;
 *   - Canvas draws a stroke, undoes and redoes it, places typed text, and hands
 *     that text to the Home board, which persists it to the profile on disk;
 *   - Add service offers the three built-ins, and placing Canvas makes a tool
 *     window that drags, resizes, keeps its z-index inside the window band and
 *     closes without adding anything to the service list.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-inhouse-services.cjs
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
// A CI runner shows the app on a desktop nobody is looking at, and Chromium then
// throttles timers and animation frames enough for a check that waits on
// requestAnimationFrame to stall past its timeout. These switches keep the
// renderer at full speed; none of them changes what a check measures.
const LAUNCH_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

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

/**
 * The embedded page's own target.
 *
 * A `<webview>` runs in its own process, so its viewport, its `opacity` and its
 * `IntersectionObserver` callbacks are invisible from the app's target. The
 * arcade's blank field was entirely visible from here and nowhere else.
 */
async function guestTarget(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const guest = list.find(item => item.type === 'webview' && item.webSocketDebuggerUrl);
      if (guest) return guest;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  return null;
}

/** `waitFor` that answers instead of throwing, for a page we do not own. */
async function poll(evaluate, expression, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return true;
    } catch {
      /* the guest may be between documents */
    }
    await sleep(150);
  }
  return false;
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
  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, ...LAUNCH_FLAGS], {
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

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-inhouse-'));
  const userData = path.join(profile, 'Kryvex');
  const statePath = path.join(userData, 'kryvex-state.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({ version: 1, services: [], settings: { secretServices: true } }),
  );
  launch(profile);
  const page = await target(PORT);
  const client = await connect(page.webSocketDebuggerUrl);

  try {
    await waitFor(client.evaluate, `Boolean(document.querySelector('.app'))`, 20000, 'the shell');

    /* ---------------------------------------------------- the cards exist --- */
    await go(client, 'services', '.secret-service');
    await client.evaluate(
      `(() => {
         const toggle = document.querySelector('.secret-toggle');
         if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
         return true;
       })()`,
    );
    await waitFor(client.evaluate, `document.querySelectorAll('.secret-card').length >= 8`, 6000, 'the secret cards');
    const cards = await client.evaluate(
      `Array.from(document.querySelectorAll('.secret-card')).map(card => card.textContent.replace(/\\s+/g, ' ').trim())`,
    );
    check(cards.length === 8, `the secret section lists eight built-in services (${cards.length})`);
    check(
      ['Arcade', 'File Forge', 'Canvas'].every(name => cards.some(text => text.includes(name))),
      'the three new services have cards',
    );
    check(
      cards.some(text => text.includes('x535 / ARCADE')) &&
        cards.some(text => text.includes('x536 / FILES')) &&
        cards.some(text => text.includes('x537 / CANVAS')),
      'each new card carries its element mark and kicker',
    );

    /* ------------------------------------------------------------- Arcade --- */
    await go(client, 'arcade', '.arcade-frame');
    const arcade = await client.evaluate(
      `(() => {
         const guest = document.querySelector('webview.webview');
         return {
           url: guest ? guest.getAttribute('src') : null,
           partition: guest ? guest.getAttribute('partition') : null,
           eyebrow: (document.querySelector('.eyebrow') || {}).textContent || '',
         };
       })()`,
    );
    check(
      arcade.url === 'https://xiondigital.net/arcade/',
      `Arcade points the guest at the arcade page (${arcade.url})`,
    );
    check(
      arcade.partition === 'persist:svc-arcade',
      `Arcade keeps its own persistent session (${arcade.partition})`,
    );
    check(arcade.eyebrow.includes('x535'), 'the Arcade view carries its element kicker');

    // The guest must be laid out by its frame, not left at Chromium's default
    // 300x150. A percentage height against a `flex: 1` frame does not resolve
    // for a replaced element, so the guest used to keep 150px, paint its first
    // 150 pixels and leave the rest of the arcade blank and unobserved.
    const frameBox = await client.evaluate(`(() => {
      const box = document.querySelector('.arcade-frame').getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    })()`);
    const guestPage = await guestTarget(PORT);
    check(Boolean(guestPage), 'the arcade guest exposes its own target');
    const guest = await connect(guestPage.webSocketDebuggerUrl);
    try {
      check(
        await poll(guest.evaluate, `location.href.includes('xiondigital.net/arcade')`, 20000),
        `the guest navigated to the arcade (${await guest.evaluate(`location.href`)})`,
      );
      await poll(guest.evaluate, `document.readyState === 'complete'`, 20000);

      const laidOut = await guest.evaluate(`({ width: innerWidth, height: innerHeight })`);
      check(
        Math.abs(laidOut.height - frameBox.height) <= 8 && Math.abs(laidOut.width - frameBox.width) <= 8,
        `the guest fills its frame (${laidOut.width}x${laidOut.height} in ${frameBox.width}x${frameBox.height})`,
      );

      // Cards the page has put in front of the reader must be revealed. The
      // page starts every card at `opacity: 0` and raises it from an
      // IntersectionObserver, so a guest that never laid out keeps all of them
      // invisible; this counts only the ones actually inside the viewport, so a
      // small runner window does not turn an off-screen card into a failure.
      // The page is somebody else's, fetched over the network: when it does not
      // arrive there is nothing to assert about its markup, and the layout check
      // above still stands, so that case is reported and not failed.
      const rendered = await poll(guest.evaluate, `document.querySelectorAll('.game').length > 0`, 15000);
      if (rendered) {
        const cards = await guest.evaluate(`(() =>
          Array.from(document.querySelectorAll('.game')).map(card => ({
            inView: card.getBoundingClientRect().top < innerHeight,
            revealed: card.classList.contains('is-in') || Number(getComputedStyle(card).opacity) > 0.5,
          }))
        )()`);
        const inView = cards.filter(card => card.inView);
        check(
          inView.length === 0 || inView.every(card => card.revealed),
          `the cards in view are revealed (${inView.filter(card => card.revealed).length}/${inView.length})`,
        );
        check(
          await guest.evaluate(`document.body.scrollHeight > innerHeight`),
          'the page lays out taller than its viewport, so it got the full height',
        );
      } else {
        const note = 'NOTE the arcade page did not render its cards, so only its layout was checked';
        lines.push(note);
        console.log(note);
      }
    } finally {
      guest.close();
    }

    /* --------------------------------------------------------- File Forge --- */
    await go(client, 'forge', '.forge-view');
    const groups = await client.evaluate(
      `Array.from(document.querySelectorAll('.forge-tabs button')).map(button => button.textContent.trim())`,
    );
    check(groups.length === 4, `File Forge offers four groups (${groups.join(', ')})`);
    check(
      await client.evaluate(`Boolean(document.querySelector('.forge-view .lede'))`),
      'File Forge states what it does and where the work happens',
    );

    // The boundary is asked for three things it must refuse. Each is decided
    // before any dialog, so the answers come back without a user.
    const refusals = await client.evaluate(`(async () => {
      const bridge = window.kryvex;
      const out = {};
      out.badName = await bridge.filesSave({ items: [{ name: 'setup.exe', data: btoa('MZ') }] });
      out.notPicked = await bridge.filesRename({ items: [{ path: 'C:\\\\Windows\\\\notepad.exe', name: 'mine.txt' }] });
      out.empty = await bridge.filesSave({ items: [] });
      out.lying = await bridge.filesSave({ items: [{ name: 'probe.pdf', data: btoa('this is not a pdf') }] });
      return out;
    })()`);
    check(refusals.badName.code === 'no-extension', 'a name with an extension the app never writes is refused');
    check(refusals.notPicked.code === 'not-picked', 'renaming a file the user never picked is refused');
    check(refusals.empty.code === 'nothing-to-export', 'an empty export is refused');
    check(refusals.lying.code === 'format-mismatch', 'a payload that lies about its format is refused');

    /* ------------------------------------------------------------- Canvas --- */
    await go(client, 'canvas', '.canvas-view');
    const drawn = await client.evaluate(`(() => {
      const sheet = document.querySelector('canvas.canvas-sheet');
      if (!sheet) return 'no sheet';
      const box = sheet.getBoundingClientRect();
      const at = (x, y) => ({ clientX: box.left + x, clientY: box.top + y, pointerId: 1, bubbles: true, isPrimary: true });
      const fire = (type, point) => sheet.dispatchEvent(new PointerEvent(type, { ...point, pointerType: 'mouse', buttons: 1 }));
      fire('pointerdown', at(30, 30));
      fire('pointermove', at(60, 60));
      fire('pointermove', at(90, 40));
      fire('pointerup', at(90, 40));
      return 'drawn';
    })()`);
    check(drawn === 'drawn', 'a stroke can be drawn on the sheet');

    await waitFor(
      client.evaluate,
      `!document.querySelector('.canvas-history button:nth-child(1)').disabled`,
      5000,
      'undo to become available',
    );
    check(true, 'drawing enables Undo');

    await client.evaluate(`document.querySelector('.canvas-history button:nth-child(1)').click()`);
    await waitFor(
      client.evaluate,
      `!document.querySelector('.canvas-history button:nth-child(2)').disabled`,
      5000,
      'redo to become available',
    );
    check(true, 'undo enables Redo');
    await client.evaluate(`document.querySelector('.canvas-history button:nth-child(2)').click()`);
    check(
      await client.evaluate(`(() => {
        const canvas = document.querySelector('canvas.canvas-sheet');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 0; i < data.length; i += 4 * 97) {
          if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) painted += 1;
        }
        return painted > 0;
      })()`),
      'redo puts the stroke back on the sheet',
    );

    // Typed words: the Text tool places them, and the board keeps them as notes.
    await client.evaluate(`(() => {
      const textButton = Array.from(document.querySelectorAll('.canvas-tools button'))
        .find(button => button.textContent.trim() === 'Text' || button.textContent.trim() === 'Texto' || button.textContent.trim() === 'Texte');
      if (textButton) textButton.click();
      return true;
    })()`);
    await waitFor(client.evaluate, `Boolean(document.querySelector('.canvas-text textarea'))`, 4000, 'the text field');
    await client.evaluate(`(() => {
      const area = document.querySelector('.canvas-text textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, 'Buy sertab anahtar');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      const sheet = document.querySelector('canvas.canvas-sheet');
      const box = sheet.getBoundingClientRect();
      sheet.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: box.left + 80, clientY: box.top + 120, pointerId: 2, bubbles: true, isPrimary: true,
      }));
      return true;
    })()`);
    await waitFor(
      client.evaluate,
      `Boolean(Array.from(document.querySelectorAll('.canvas-doc button')).find(button => button.textContent.includes('sticky') || button.textContent.includes('notas') || button.textContent.includes('Notizzettel') || button.textContent.includes('pense')))`,
      4000,
      'the sticky-note button',
    );
    await client.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.canvas-doc button'))
        .find(item => /sticky|notas|Notizzettel|pense/i.test(item.textContent));
      button.click();
      return true;
    })()`);

    let noteSaved = false;
    for (let attempt = 0; attempt < 40 && !noteSaved; attempt += 1) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        noteSaved = (state.settings?.home?.notes ?? []).some(note => note.text.includes('sertab'));
      } catch {
        /* the write may be mid-flight */
      }
      if (!noteSaved) await sleep(200);
    }
    check(noteSaved, 'the typed words reach the Home board and are written to the profile');

    /* ------------------------------------------- built-in tool windows --- */
    await go(client, 'workspace', '.workspace-canvas');
    await client.evaluate(`(() => {
      const add = Array.from(document.querySelectorAll('.workspace-bar button'))
        .find(button => /add service|servicio|Dienst|service/i.test(button.textContent));
      add.click();
      return true;
    })()`);
    await waitFor(client.evaluate, `Boolean(document.querySelector('.preset-chip.is-tool'))`, 5000, 'the built-in group');
    const builtIn = await client.evaluate(
      `Array.from(document.querySelectorAll('.preset-chip.is-tool')).map(chip => chip.textContent.trim())`,
    );
    check(builtIn.length === 3, `Add service offers the three built-ins (${builtIn.join(', ')})`);
    await client.evaluate(`(() => {
      const chip = Array.from(document.querySelectorAll('.preset-chip.is-tool'))
        .find(item => item.textContent.includes('Canvas'));
      chip.click();
      return true;
    })()`);

    await waitFor(client.evaluate, `Boolean(document.querySelector('.service-frame.is-tool-window'))`, 8000, 'the tool window');
    const placed = await client.evaluate(`(() => {
      const frame = document.querySelector('.service-frame.is-tool-window');
      const rect = frame.getBoundingClientRect();
      const canvas = document.querySelector('.workspace-canvas').getBoundingClientRect();
      return {
        hasTitle: Boolean(frame.querySelector('.service-toolbar h1')),
        inside: rect.left >= canvas.left - 1 && rect.top >= canvas.top - 1 &&
          rect.right <= canvas.right + 1 && rect.bottom <= canvas.bottom + 1,
        z: Number(window.getComputedStyle(frame).zIndex),
        controls: frame.querySelectorAll('.window-controls button').length,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    })()`);
    check(placed.hasTitle, 'the tool window has a title bar with the service name');
    check(placed.controls === 3, 'the window carries minimize, maximize and close in its corner');
    check(placed.inside, 'the window is contained by the workspace canvas');
    check(placed.z >= 30 && placed.z <= 45, `the window stays inside the chrome band (z=${placed.z})`);

    // A drag is dispatched the way the browser delivers one — down on the bar,
    // move and up after it — and the frame is read after the render has had a
    // turn, because React does not paint inside the dispatch that scheduled it.
    const dragged = await client.evaluate(`(async () => {
      const frame = document.querySelector('.service-frame.is-tool-window');
      const bar = frame.querySelector('.service-toolbar');
      const point = (x, y) => ({
        clientX: Math.round(x), clientY: Math.round(y), pointerId: 3,
        pointerType: 'mouse', buttons: 1, bubbles: true, isPrimary: true,
      });
      const box = bar.getBoundingClientRect();
      const from = { x: box.left + 140, y: box.top + 14 };
      const before = frame.getBoundingClientRect();
      bar.dispatchEvent(new PointerEvent('pointerdown', point(from.x, from.y)));
      bar.dispatchEvent(new PointerEvent('pointermove', point(from.x + 40, from.y + 30)));
      await new Promise(resolve => setTimeout(resolve, 40));
      bar.dispatchEvent(new PointerEvent('pointerup', point(from.x + 40, from.y + 30)));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const after = frame.getBoundingClientRect();
      return { fromLeft: before.left, fromTop: before.top, left: after.left, top: after.top };
    })()`);
    check(
      Math.abs(dragged.left - dragged.fromLeft) > 1 || Math.abs(dragged.top - dragged.fromTop) > 1,
      `a drag on the title bar moves the window (${Math.round(dragged.left - dragged.fromLeft)}, ${Math.round(dragged.top - dragged.fromTop)})`,
    );
    const movedTo = await client.evaluate(`(() => {
      const rect = document.querySelector('.service-frame.is-tool-window').getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })()`);

    const resized = await client.evaluate(`(async () => {
      const frame = document.querySelector('.service-frame.is-tool-window');
      const edge = frame.querySelector('.service-window-edge.is-se');
      const point = (x, y) => ({
        clientX: Math.round(x), clientY: Math.round(y), pointerId: 4,
        pointerType: 'mouse', buttons: 1, bubbles: true, isPrimary: true,
      });
      const box = edge.getBoundingClientRect();
      const from = { x: box.left + 1, y: box.top + 1 };
      edge.dispatchEvent(new PointerEvent('pointerdown', point(from.x, from.y)));
      edge.dispatchEvent(new PointerEvent('pointermove', point(from.x + 60, from.y + 40)));
      await new Promise(resolve => setTimeout(resolve, 40));
      edge.dispatchEvent(new PointerEvent('pointerup', point(from.x + 60, from.y + 40)));
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const after = frame.getBoundingClientRect();
      return { width: after.width, height: after.height };
    })()`);
    check(
      resized.width > movedTo.width + 10 && resized.height > movedTo.height + 10,
      `the south-east edge resizes the window (${Math.round(resized.width)}, ${Math.round(resized.height)})`,
    );

    await client.evaluate(`(() => {
      const frame = document.querySelector('.service-frame.is-tool-window');
      frame.querySelector('.window-controls button:nth-child(1)').click();
      return true;
    })()`);
    await waitFor(client.evaluate, `Boolean(document.querySelector('.workspace-tray-item'))`, 5000, 'the minimized tray');
    check(true, 'minimizing a tool window puts it in the tray');
    await client.evaluate(`document.querySelector('.workspace-tray-item').click()`);
    await waitFor(
      client.evaluate,
      `document.querySelector('.service-frame.is-tool-window').getBoundingClientRect().height > 50`,
      5000,
      'the window to come back',
    );
    check(true, 'the tray restores it');

    await client.evaluate(`(() => {
      const frame = document.querySelector('.service-frame.is-tool-window');
      const controls = frame.querySelectorAll('.window-controls button');
      controls[controls.length - 1].click();
      return true;
    })()`);
    // Close plays the exit animation first when motion is on, so allow for it.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!(await client.evaluate(`Boolean(document.querySelector('.service-frame.is-tool-window'))`))) break;
      await sleep(200);
    }
    check(
      !(await client.evaluate(`Boolean(document.querySelector('.service-frame.is-tool-window'))`)),
      'the close control ends the window',
    );
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    check(
      (state.services ?? []).length === 0,
      'placing a built-in window adds nothing to the service list',
    );

    check(client.exceptions.length === 0, `no renderer exceptions (${client.exceptions.slice(0, 2).join(' | ')})`);

    fs.writeFileSync(
      path.join(root, '.tmp-inhouse-report.txt'),
      `${lines.join('\n')}\n`,
    );
    console.log(`\nAll checks passed (${lines.length}).`);
  } finally {
    client.close();
    await stop();
    // Windows keeps a handle on the profile for a moment after the process is
    // gone; a failure to tidy up must never mask the check that actually failed.
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
  const failure = { error: error.message, checks: lines };
  fs.writeFileSync(path.join(root, '.tmp-inhouse-report.txt'), JSON.stringify(failure, null, 1));
  await stop();
  process.exit(1);
});
