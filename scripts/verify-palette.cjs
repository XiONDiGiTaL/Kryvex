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
 *   - a page the app's own Browser visits becomes a history row, and Enter on
 *     it takes the Browser back to that page;
 *   - a file the app's own Browser downloads becomes a download row, and Enter on
 *     it hands the file to the OS instead of opening a page;
 *   - a page the app's own Browser bookmarks becomes a bookmark row, and Enter on
 *     it opens that page again.
 *
 * All three are real: the harness serves one page and one file from a loopback
 * port nobody else has, opens them through the same deep link the palette itself
 * uses, bookmarks the page with the button in the tab strip, and waits for each
 * to reach the app's index before it searches. It also points the app's download
 * folder at its own disposable profile, so a run never leaves a file in the
 * person's Downloads, and removes the file through the app at the end. No row it
 * checks is written into a state file by hand.
 *
 * Run after `pnpm build`:
 *
 *   node scripts/verify-palette.cjs
 *
 * Env: `KRYVEX_CDP_PORT` picks the debugging port.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
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
  History: 'Opens in Browser',
  Bookmarks: 'Opens in Browser',
  Downloads: 'Shows the file',
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

/** A page and a file only this machine can serve, so the app meets both for real. */
const FIXTURE_PAGE =
  '<!doctype html><title>Palette history fixture</title><h1>Visited in the app\'s own Browser</h1>';
// An extension no desktop opens by itself: Enter asks the OS for the file, and
// the OS cannot launch an editor the run would then have to close.
const DOWNLOAD_NAME = 'kryvex-palette-proof.bin';
const PAYLOAD = Buffer.from('Kryvex palette download proof\n'.repeat(512), 'utf8');

function serve() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/palette-proof.bin') {
        response.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': PAYLOAD.length,
          'content-disposition': `attachment; filename="${DOWNLOAD_NAME}"`,
        });
        response.end(PAYLOAD);
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(FIXTURE_PAGE);
    });
    server.once('error', reject);
    // Port 0 asks the system for a free one: two runs never fight over a port,
    // and nothing outside this machine can answer on it.
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** Windows compares paths without case, so this does too. */
function samePath(a, b) {
  const key = value => (process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value));
  return key(a) === key(b);
}

let child = null;
let cdp = null;
let fixtureServer = null;

(async () => {
  try {
    const fixture = await serve();
    fixtureServer = fixture.server;
    const visited = `http://127.0.0.1:${fixture.port}/visited`;
    const profile = path.join(root, '.tmp-palette-profile');
    fs.rmSync(profile, { recursive: true, force: true });
    fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
    // The app saves downloads where its storage file says; pointing that at the
    // disposable profile keeps a run out of the person's own Downloads folder.
    // The app's own answer is checked below, so a seed it ignored cannot pass.
    const downloadDir = path.join(profile, 'Downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    const userData = path.join(profile, 'Kryvex');
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(
      path.join(userData, 'kryvex-storage.json'),
      JSON.stringify({
        version: 1,
        downloadDir,
        downloadRoots: [downloadDir],
        torrentRoots: [path.join(downloadDir, 'Kryvex Torrents')],
      }),
      'utf8',
    );
    child = launch(profile);

    const page = await target(PORT);
    cdp = await connect(page.webSocketDebuggerUrl);

    const waitUntil = async (expression, label, timeout = 8000) => {
      const started = Date.now();
      const deadline = started + timeout;
      while (Date.now() < deadline) {
        if (await cdp.evaluate(expression)) {
          const spent = Date.now() - started;
          if (spent * 2 > timeout) console.log(`slow wait: ${label} took ${spent}ms of ${timeout}ms`);
          return;
        }
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
      // One press normally, but a press that lands in the same frame as the
      // window losing focus can be dropped by the renderer, and a person who
      // saw nothing happen would press again. Retrying is what makes this
      // harness about the shortcut rather than about input timing.
      let presses = 0;
      while (presses < 4) {
        if (await cdp.evaluate(`Boolean(document.querySelector('.palette-layer'))`)) break;
        await key('k', 'KeyK', 75, 2);
        presses += 1;
        await sleep(450);
      }
      if (presses > 1) console.log(`palette opened after ${presses} Ctrl+K presses`);
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
      // Let the unmount settle before the next key, as a person's hands do.
      await sleep(250);
    };
    const type = text => cdp.send('Input.insertText', { text });
    const clickOn = async selector => {
      const box = await cdp.evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
      })()`);
      check(box && box.width > 0 && box.height > 0, `The window is not drawing ${selector}`);
      const point = { x: box.x, y: box.y };
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none' });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...point,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...point,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    };
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

    // 9. A page the app's own Browser visited is a history row, and Enter on it
    // takes the Browser back to the page instead of only naming it.
    await closePalette();
    await cdp.evaluate(
      `location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(visited)}); true`,
    );
    const loaded = `(() => {
      const view = document.querySelector('webview');
      if (!view) return false;
      try {
        return !view.isLoading() && view.getURL() === ${JSON.stringify(visited)};
      } catch {
        return false;
      }
    })()`;
    await waitUntil(loaded, 'the Browser to load the fixture page', 15000);
    // The row is drawn from the index the main process builds, so wait for the
    // visit to reach it rather than for a pixel that may still be a start page.
    await waitUntil(
      `window.kryvex.searchQuery('127.0.0.1').then(hits =>
        hits.some(hit => hit.source === 'history' && hit.url === ${JSON.stringify(visited)}))`,
      'the visit to reach the local index',
      15000,
    );
    await cdp.evaluate(`location.hash = '#/home'; true`);
    await waitUntil(`!document.querySelector('webview')`, 'the Browser to leave the screen', 15000);
    await sleep(300);
    await openPalette();
    await type('127.0.0.1');
    // A history entry is titled with the host it was served from — port and all
    // when it has one — rather than with the page's title, so the row is found
    // by the host it names instead of by a title the app never recorded.
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').trim().includes('127.0.0.1')`,
      'the visited page to lead the list',
    );
    const historyRow = flat(await rows()).find(row => row.group === 'History');
    check(historyRow, 'The palette found the visit but drew no History row');
    check(
      historyRow.opens === 'Opens in Browser',
      `A history row promises "${historyRow.opens}"`,
    );
    check(
      historyRow.label.includes('127.0.0.1'),
      `The history row is labelled "${historyRow.label}", which does not name the host`,
    );
    check(historyRow.hint === '127.0.0.1', `A history row is hinted as "${historyRow.hint}"`);
    check(historyRow.drawn, `The Enter hint is not drawn for "${historyRow.label}"`);
    console.log(
      'history row:',
      JSON.stringify({ label: historyRow.label, hint: historyRow.hint, opens: historyRow.opens }),
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    const reopened = await cdp.evaluate(`location.hash`);
    check(
      reopened.startsWith('#/browser?url='),
      `Enter on a history row left the app at ${reopened}`,
    );
    await waitUntil(loaded, 'the Browser to open the page the row promised', 15000);

    // 10. A file the app's own Browser downloads is a download row, and Enter on
    // it hands the file to the OS rather than taking the app to a page.
    await cdp.evaluate(`location.hash = '#/home'; true`);
    await waitUntil(`!document.querySelector('webview')`, 'the Browser to leave the screen', 15000);
    const fetched = `http://127.0.0.1:${fixture.port}/palette-proof.bin`;
    await cdp.evaluate(
      `location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(fetched)}); true`,
    );
    // The manager answers only for a download that reached its last byte, so the
    // wait is on the record's state rather than on the webview's empty page.
    const finished = `(() => window.kryvex.downloadsList().then(records => {
      const record = records.find(item => item.filename === ${JSON.stringify(DOWNLOAD_NAME)} && item.state === 'completed');
      return record ? { id: record.id, filename: record.filename, savePath: record.savePath } : null;
    }))()`;
    await waitUntil(finished, 'the download the Browser started to finish', 30000);
    const record = await cdp.evaluate(finished);
    const location = await cdp.evaluate(`window.kryvex.downloadsLocation()`);
    check(
      location && samePath(location.path, downloadDir),
      `The app is saving downloads to ${location?.path ?? 'nowhere'}, not the folder this run gave it`,
    );
    const savedBytes =
      record.savePath && fs.existsSync(record.savePath) ? fs.statSync(record.savePath).size : -1;
    check(
      savedBytes === PAYLOAD.length,
      `The app recorded "${DOWNLOAD_NAME}" but ${record.savePath || 'no path'} holds ${savedBytes} bytes, expected ${PAYLOAD.length}`,
    );
    console.log('download:', JSON.stringify({ ...record, bytes: savedBytes }));

    await waitUntil(
      `window.kryvex.searchQuery('palette-proof').then(hits =>
        hits.some(hit => hit.source === 'download' && hit.title === ${JSON.stringify(DOWNLOAD_NAME)}))`,
      'the download to reach the local index',
      15000,
    );
    await cdp.evaluate(`location.hash = '#/home'; true`);
    await waitUntil(`!document.querySelector('webview')`, 'the Browser to leave the screen', 15000);
    await sleep(300);
    await openPalette();
    await type('palette-proof');
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').trim() === ${JSON.stringify(DOWNLOAD_NAME)}`,
      'the downloaded file to lead the list',
    );
    const downloadRow = flat(await rows()).find(row => row.group === 'Downloads');
    check(downloadRow, 'The palette found the download but drew no Downloads row');
    check(
      downloadRow.opens === 'Shows the file',
      `A download row promises "${downloadRow.opens}"`,
    );
    check(downloadRow.hint === '127.0.0.1', `A download row is hinted as "${downloadRow.hint}"`);
    check(downloadRow.drawn, `The Enter hint is not drawn for "${downloadRow.label}"`);
    console.log(
      'download row:',
      JSON.stringify({ label: downloadRow.label, hint: downloadRow.hint, opens: downloadRow.opens }),
    );

    const stayed = await cdp.evaluate(`location.hash`);
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    // What the OS does with the file is not visible to the window, so what is
    // checked here is the branch the row took: a download row carries the URL it
    // came from, and a row that fell through to opening one would have left the
    // app on the Browser instead of the screen it was on.
    await sleep(1200);
    check(
      (await cdp.evaluate(`location.hash`)) === stayed,
      'Enter on a download row moved the app to another screen',
    );
    check(
      !(await cdp.evaluate(`Boolean(document.querySelector('webview'))`)),
      'Enter on a download row opened a tab',
    );
    check(fs.existsSync(record.savePath), 'Enter on a download row moved the file');
    const stillListed = await cdp.evaluate(
      `window.kryvex.downloadsList().then(records => records.some(item => item.id === ${JSON.stringify(record.id)}))`,
    );
    check(stillListed, 'Enter on a download row dropped it from the download list');

    // Leave the folder as it was found: the run saved a real file, so it takes
    // it away through the same app that wrote it.
    const removed = await cdp.evaluate(
      `window.kryvex.downloadsRemove(${JSON.stringify(record.id)}, true)`,
    );
    check(
      removed && removed.ok,
      `The download this run made could not be removed: ${removed?.message ?? 'no answer'}`,
    );
    check(!fs.existsSync(record.savePath), 'The removed download is still on disk');

    // 11. A page the app's own Browser bookmarks is a bookmark row, and Enter on
    // it opens that page again.
    const pageTitle = 'Palette history fixture';
    await cdp.evaluate(
      `location.hash = '#/browser?url=' + encodeURIComponent(${JSON.stringify(visited)}); true`,
    );
    await waitUntil(loaded, 'the Browser to load the fixture page again', 15000);
    // A bookmark is saved with the page's own title, so the title has to arrive
    // before the button is pressed; without it the row would carry the host. The
    // strip draws the very state the button copies, so a drawn title is proof the
    // press will carry it — no fixed pause on a guest that may be ahead of it.
    await waitUntil(
      `(document.querySelector('.tab.is-active .tab-title')?.textContent || '').trim() === ${JSON.stringify(pageTitle)}`,
      'the tab strip to draw the page title',
      15000,
    );
    // The button is dead while the active tab has no URL, and the title can be
    // drawn before the URL arrives, so what the press needs is the state the
    // button itself draws once it would do something.
    const readyToBookmark =
      `Boolean(document.querySelector('[aria-label="Bookmark this page"]:not([disabled])'))`;
    const bookmarkSaved = `Boolean(document.querySelector('[aria-label="Remove bookmark"]'))`;
    await waitUntil(readyToBookmark, 'the bookmark button to offer the page', 15000);
    // A press can be dropped when it lands in the same frame as a re-layout, and a
    // window narrow enough to squeeze the tab strip draws this button partially
    // clipped, where its centre is outside the strip and a click there lands on
    // the strip instead. So the point is hit-tested first: a point that really is
    // the button is clicked, and one the strip has clipped away is reached by
    // focusing the button and pressing Enter. Both are actions a person has, and
    // neither can undo a saved bookmark, because a press only happens while the
    // strip still offers to bookmark the page.
    let presses = 0;
    while (presses < 4 && !(await cdp.evaluate(bookmarkSaved))) {
      const hit = await cdp.evaluate(`(() => {
        const button = document.querySelector('[aria-label="Bookmark this page"]');
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const target = document.elementFromPoint(x, y);
        return {
          x: Math.round(x),
          y: Math.round(y),
          onButton: Boolean(target) && (target === button || button.contains(target)),
          target: target
            ? target.tagName.toLowerCase() +
              (target.getAttribute('aria-label')
                ? '[' + target.getAttribute('aria-label') + ']'
                : '')
            : 'nothing',
          window: window.innerWidth + 'x' + window.innerHeight,
        };
      })()`);
      check(hit, 'The window is not drawing the bookmark button');
      if (hit.onButton) {
        await clickOn('[aria-label="Bookmark this page"]');
      } else {
        const focused = await cdp.evaluate(`(() => {
          const button = document.querySelector('[aria-label="Bookmark this page"]');
          button.focus();
          return document.activeElement === button;
        })()`);
        check(focused, 'The bookmark button could not be focused for a key press');
        await key('Enter', 'Enter', 13);
      }
      presses += 1;
      console.log('bookmark press', presses, JSON.stringify(hit));
      try {
        await waitUntil(bookmarkSaved, 'the strip to draw the bookmark it saved', 3000);
      } catch {
        // Still offering to bookmark the page: that press did not land.
      }
    }
    const flipped = await cdp.evaluate(bookmarkSaved);
    if (!flipped) {
      // Say what the strip drew, so a failure here names the state the press
      // needed rather than only the index it never reached.
      const drawn = await cdp.evaluate(`(() => {
        const button = document.querySelector('[aria-label="Bookmark this page"], [aria-label="Remove bookmark"]');
        if (!button) return 'no bookmark button';
        return button.getAttribute('aria-label') + (button.disabled ? ' (disabled)' : '');
      })()`);
      check(false, `After ${presses} presses the strip still draws ${drawn}`);
    }
    const bookmarked = `(() => window.kryvex.searchQuery('fixture').then(hits => {
      const hit = hits.find(item => item.source === 'bookmark' && item.url === ${JSON.stringify(visited)});
      return hit ? { title: hit.title, subtitle: hit.subtitle } : null;
    }))()`;
    // The saved bookmark reaches the local index asynchronously, so a slow index
    // is waited out rather than read as a missing bookmark.
    await waitUntil(bookmarked, 'the bookmark to reach the local index', 30000);
    const savedBookmark = await cdp.evaluate(bookmarked);
    check(
      savedBookmark.title === pageTitle,
      `The bookmark is titled "${savedBookmark.title}", expected the page's own title`,
    );
    console.log('bookmark:', JSON.stringify(savedBookmark));

    await cdp.evaluate(`location.hash = '#/home'; true`);
    await waitUntil(`!document.querySelector('webview')`, 'the Browser to leave the screen', 15000);
    await sleep(300);
    await openPalette();
    await type('fixture');
    await waitUntil(
      `(document.querySelector('.palette-item .palette-label')?.textContent || '').trim() === ${JSON.stringify(pageTitle)}`,
      'the bookmark to lead the list',
    );
    const bookmarkRow = flat(await rows()).find(row => row.group === 'Bookmarks');
    check(bookmarkRow, 'The palette found the bookmark but drew no Bookmarks row');
    check(
      bookmarkRow.opens === 'Opens in Browser',
      `A bookmark row promises "${bookmarkRow.opens}"`,
    );
    check(bookmarkRow.hint === '127.0.0.1', `A bookmark row is hinted as "${bookmarkRow.hint}"`);
    check(bookmarkRow.drawn, `The Enter hint is not drawn for "${bookmarkRow.label}"`);
    console.log(
      'bookmark row:',
      JSON.stringify({ label: bookmarkRow.label, hint: bookmarkRow.hint, opens: bookmarkRow.opens }),
    );
    await enter();
    await waitUntil(`!document.querySelector('.palette-layer')`, 'the palette to close on Enter');
    const bookmarkTarget = await cdp.evaluate(`location.hash`);
    check(
      bookmarkTarget.startsWith('#/browser?url='),
      `Enter on a bookmark row left the app at ${bookmarkTarget}`,
    );
    await waitUntil(loaded, 'the Browser to open the bookmarked page', 15000);

    if (cdp.exceptions.length > 0) console.log('exceptions:', JSON.stringify(cdp.exceptions.slice(0, 5)));
    console.log(`::notice title=Palette harness::${first.length} rows, ${new Set(first.map(row => row.opens)).size} verbs, ${kept.length} remembered queries, a visited page offered as history, a downloaded file offered as a download row, a bookmarked page offered as a bookmark, all checks passed`);
    cdp.close();
    console.log('palette harness: PASS');
  } catch (error) {
    const message = String(error?.message || error).replace(/\r?\n/g, ' ').slice(0, 900);
    // The batch runs this inside a long job log; an annotation is the only part
    // of a CI run that reports the reason without scrolling.
    console.error(`::error title=Palette harness::${message}`);
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
    if (fixtureServer) fixtureServer.close();
  }
})();
