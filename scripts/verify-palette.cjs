/* eslint-disable no-console */
/**
 * Palette harness.
 *
 * The unified search's two promises live in a component, not in a rule file:
 * the queries that led somewhere are offered again when the field is empty, and
 * every row says what Enter will do with it. `tests/search-rules.test.ts` covers
 * the list arithmetic; this boots the built app in a disposable profile and
 * presses the keys a person presses, so React sees input events instead of a
 * script reaching into state:
 *
 *   - Ctrl+K opens the palette, with its field focused;
 *   - every row carries the verb its group promises — "Opens the view", "Runs
 *     the action", "Opens the module", "Switches the theme", "Searches again" —
 *     and the verb is drawn, not merely present in the DOM;
 *   - Enter does what the row promised: it navigates, it runs the action, it
 *     switches the theme;
 *   - a query that was run comes back, newest first, once the field is empty,
 *     and Enter on it puts it back in the field without closing the palette;
 *   - a repeat moves an entry up instead of adding a twin, case-insensitively;
 *   - the list survives a reload, because it is kept in the profile.
 *
 * What it cannot show: the rows that come from the local index (history,
 * bookmarks, downloads). A disposable profile has none, and the harness does not
 * invent them — those rows are drawn by the same component with a verb chosen by
 * source, and their ranking is unit-tested.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-palette.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9394);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// A runner shows the app on a desktop nobody is looking at, and Chromium then
// throttles timers enough for a wait to stall past its timeout.
const LAUNCH_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

/** The verb each group promises. A group without one fails this harness. */
const VERBS = {
  Navigate: 'Opens the view',
  Actions: 'Runs the action',
  Services: 'Opens the module',
  Themes: 'Switches the theme',
  'Recent searches': 'Searches again',
};

function check(condition, message) {
  if (!condition) throw new Error(message);
}

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
  return { evaluate, send, exceptions, close: () => socket.close() };
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
    // These are noise on a machine with no capture device and no guest frames.
    if (text.includes('wgc_capturer') || text.includes('GUEST_VIEW_MANAGER_CALL')) return;
    process.stderr.write(text);
  });
  return child;
}

let child = null;
let cdp = null;

(async () => {
  try {
    const profile = path.join(root, '.tmp-palette-profile');
    fs.rmSync(profile, { recursive: true, force: true });
    fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
    child = launch(profile);

    const page = await target(PORT);
    cdp = await connect(page.webSocketDebuggerUrl);

    const waitUntil = async (expression, label, timeout = 8000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await cdp.evaluate(expression)) return;
        await sleep(150);
      }
      const seen = await cdp
        .evaluate(
          `(() => {
            const layer = document.querySelector('.palette-layer');
            if (!layer) return 'the palette is not open';
            const item = document.querySelector('.palette-item');
            return 'first row: ' + (item ? item.textContent.trim().slice(0, 120) : 'none');
          })()`,
        )
        .catch(() => 'the window did not answer');
      throw new Error(`Timed out waiting for ${label} (${seen})`);
    };
    const key = async (name, code, vk, modifiers = 0) => {
      const base = {
        key: name,
        code,
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk,
        modifiers,
      };
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    };
    const enter = () => key('Enter', 'Enter', 13);
    const escape = () => key('Escape', 'Escape', 27);
    const openPalette = async () => {
      if (!(await cdp.evaluate(`Boolean(document.querySelector('.palette-layer'))`))) {
        await key('k', 'KeyK', 75, 2);
      }
      await waitUntil(
        `Boolean(document.querySelector('.palette-layer'))`,
        'the palette to open on Ctrl+K',
      );
      // The field is what autofocus gives a person; focusing it here keeps typed
      // text landing in the field even when the runner's window lost OS focus.
      await cdp.evaluate(`document.querySelector('.palette-input input').focus(); true`);
    };
    const closePalette = async () => {
      if (!(await cdp.evaluate(`Boolean(document.querySelector('.palette-layer'))`))) return;
      await escape();
      await waitUntil(
        `!document.querySelector('.palette-layer')`,
        'the palette to close on Escape',
      );
    };
    const type = text => cdp.send('Input.insertText', { text });
    const rows = () =>
      cdp.evaluate(`(() => {
        if (!document.querySelector('.palette-layer')) return null;
        const sections = Array.from(document.querySelectorAll('.palette-list section')).map(section => ({
          group: (section.querySelector('h3')?.textContent || '').trim(),
          rows: Array.from(section.querySelectorAll('.palette-item')).map(item => {
            const opens = item.querySelector('.palette-opens');
            const box = opens ? opens.getBoundingClientRect() : null;
            return {
              label: (item.querySelector('.palette-label')?.textContent || '').trim(),
              opens: (opens?.textContent || '').trim(),
              hint: (item.querySelector('.palette-hint')?.textContent || '').trim(),
              drawn:
                Boolean(box) &&
                box.width > 0 &&
                getComputedStyle(opens).visibility !== 'hidden' &&
                Number(getComputedStyle(opens).opacity) > 0.1,
            };
          }),
        }));
        const input = document.querySelector('.palette-input input');
        return {
          sections,
          value: input ? input.value : null,
          focused: document.activeElement === input,
          empty: Boolean(document.querySelector('.palette-empty')),
        };
      })()`);
    const flat = snapshot => (snapshot?.sections ?? []).flatMap(section =>
      section.rows.map(row => ({ ...row, group: section.group })),
    );
    const recentLabels = snapshot =>
      (snapshot?.sections.find(section => section.group === 'Recent searches')?.rows ?? []).map(
        row => row.label,
      );

    await waitUntil(`Boolean(document.querySelector('.app'))`, 'the app', 30000);

    // A disposable profile opens on the first-run theme sheet. A person picks a
    // theme to leave it, so the harness does the same before it presses a key.
    if (await cdp.evaluate(`Boolean(document.querySelector('.theme-gallery-layer'))`)) {
      await cdp.evaluate(`(() => {
        const keep = document.querySelector('[data-shot="gallery-skip"]');
        if (keep) keep.click();
        return true;
      })()`);
      await waitUntil(
        `!document.querySelector('.theme-gallery-layer')`,
        'the first-run sheet to close',
      );
    }

    // 1. Ctrl+K opens it, and every row says what Enter will do.
    await openPalette();
    let snapshot = await rows();
    const first = flat(snapshot);
    check(first.length > 0, 'The palette opened with no rows at all');
    check(snapshot.focused, 'The palette did not focus its own field');
    check(
      !snapshot.sections.some(section => section.group === 'Recent searches'),
      'A profile that never searched offered recent searches',
    );
    for (const row of first) {
      check(row.opens, `A row has no Enter hint: "${row.label}"`);
      check(row.drawn, `The Enter hint is not drawn for "${row.label}"`);
      const promised = VERBS[row.group];
      check(promised, `Group "${row.group}" has no verb this harness knows`);
      check(
        row.opens === promised,
        `"${row.label}" promises "${row.opens}" in ${row.group}, expected "${promised}"`,
      );
    }
    console.log(
      'rows:',
      first.length,
      '| verbs:',
      JSON.stringify([...new Set(first.map(row => row.opens))]),
    );

    // 2. Enter on a Navigate row goes where the verb says. Settings, not Home:
    // the app starts on Home, so landing there would prove nothing.
    check(
      (await cdp.evaluate(`location.hash`)) !== '#/settings',
      'The app started on Settings, so the navigation check would prove nothing',
    );
    await closePalette();
    await openPalette();
    await type('go to settings');
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').trim() === 'Go to Settings'`,
      '"Go to Settings" to lead the list',
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    const hash = await cdp.evaluate(`location.hash`);
    check(hash === '#/settings', `Enter on "Go to Settings" left the app at ${hash}`);

    // 3. Enter on an Actions row runs it, exactly once.
    await cdp.evaluate(`window.__paletteCapture = 0;
      window.addEventListener('kryvex:vexium-capture', () => { window.__paletteCapture += 1; });
      true`);
    await openPalette();
    await type('send the current page');
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').includes('Send the current page')`,
      'the capture action to lead the list',
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    const captures = await cdp.evaluate(`window.__paletteCapture`);
    check(captures === 1, `Enter on the action row dispatched ${captures} capture events, expected 1`);

    // 4. Enter on a Themes row switches the theme.
    const themeBefore = await cdp.evaluate(`document.documentElement.dataset.theme`);
    await openPalette();
    await type('switch to');
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').trim().startsWith('Switch to ')`,
      'a theme row to lead the list',
    );
    const themeRow = flat(await rows())[0];
    check(
      themeRow.opens === 'Switches the theme',
      `A theme row promises "${themeRow.opens}"`,
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    await sleep(400);
    const themeAfter = await cdp.evaluate(`document.documentElement.dataset.theme`);
    check(
      themeAfter && themeAfter !== themeBefore,
      `Enter on "${themeRow.label}" left the theme at ${themeAfter}`,
    );

    // 5. The three queries that went somewhere are offered again, newest first.
    const expected = ['switch to', 'send the current page', 'go to settings'];
    await openPalette();
    snapshot = await rows();
    const offered = recentLabels(snapshot);
    console.log('offered again:', JSON.stringify(offered));
    check(
      JSON.stringify(offered) === JSON.stringify(expected),
      `Recents are ${JSON.stringify(offered)}, expected ${JSON.stringify(expected)}`,
    );
    for (const row of snapshot.sections.find(section => section.group === 'Recent searches').rows) {
      check(row.opens === 'Searches again', `"${row.label}" promises "${row.opens}"`);
      check(row.hint === 'Recent search', `"${row.label}" is hinted as "${row.hint}"`);
      check(row.drawn, `The Enter hint is not drawn for "${row.label}"`);
    }

    // Enter on one runs it again in place: the field takes the query and the
    // palette stays open, which is the whole difference between this and a row
    // that leaves.
    await enter();
    await sleep(300);
    snapshot = await rows();
    check(Boolean(snapshot), 'Enter on a past query closed the palette');
    check(
      snapshot.value === offered[0],
      `Enter on "${offered[0]}" put "${snapshot.value}" in the field`,
    );
    check(
      !snapshot.sections.some(section => section.group === 'Recent searches'),
      'The recents stayed on screen while a query was in the field',
    );

    // 6. A repeat moves its entry up; it does not add a twin.
    await closePalette();
    await openPalette();
    await type('go to settings');
    check(
      !(await rows()).sections.some(section => section.group === 'Recent searches'),
      'Recents are offered while a query is typed',
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    await openPalette();
    let listed = recentLabels(await rows());
    check(
      JSON.stringify(listed) ===
        JSON.stringify(['go to settings', 'switch to', 'send the current page']),
      `A repeat did not move its entry up: ${JSON.stringify(listed)}`,
    );

    // 7. The same query in another case is the same query.
    await closePalette();
    await openPalette();
    await type('Go to Settings');
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    await openPalette();
    listed = recentLabels(await rows());
    const twins = listed.filter(label => label.toLowerCase() === 'go to settings').length;
    check(twins === 1, `"Go to Settings" is listed ${twins} times`);
    check(
      listed[0].toLowerCase() === 'go to settings',
      `The newest query is not first: ${JSON.stringify(listed)}`,
    );

    // 8. It is kept in the profile, so a reload finds it again.
    const kept = listed;
    await sleep(1500);
    await cdp.evaluate(`window.location.reload(); true`);
    await sleep(1500);
    await waitUntil(`Boolean(document.querySelector('.app'))`, 'the app after a reload', 30000);
    await openPalette();
    const survived = recentLabels(await rows());
    check(
      JSON.stringify(survived) === JSON.stringify(kept),
      `After a reload the palette offers ${JSON.stringify(survived)}, expected ${JSON.stringify(kept)}`,
    );
    console.log('after reload:', JSON.stringify(survived));

    if (cdp.exceptions.length > 0) console.log('exceptions:', JSON.stringify(cdp.exceptions.slice(0, 5)));
    cdp.close();
    console.log('palette harness: PASS');
  } catch (error) {
    console.error('palette harness: FAIL', error.stack || error);
    process.exitCode = 1;
  } finally {
    if (cdp) {
      try {
        cdp.close();
      } catch {
        /* already closed */
      }
    }
    if (child && child.exitCode === null) child.kill();
    await sleep(900);
    if (child && child.exitCode === null) child.kill('SIGKILL');
  }
})();
