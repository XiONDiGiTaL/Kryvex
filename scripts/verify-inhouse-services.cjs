/* eslint-disable no-console */
/**
 * End-to-end check for the three tools 0.9.5 adds: Arcade (x535),
 * File Forge (x536) and Canvas (x537).
 *
 * It drives the built app in a disposable profile over CDP. What it proves,
 * in the order a user meets it:
 *
 *   - the secret-services section lists eight built-in services, including the
 *     three new cards;
 *   - Arcade loads the xiondigital.net page in its own persistent partition,
 *     and says so in the DOM rather than showing a spinner;
 *   - File Forge renders its four groups, and the file boundary refuses a name
 *     it must not write, a rename of a file the user never picked, and an empty
 *     export — each as a code, with no dialog and no file;
 *   - Canvas draws a stroke, undoes and redoes it, places typed text, and hands
 *     that text to the Home board, which persists it to the profile on disk;
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
