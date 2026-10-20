/* eslint-disable no-console */
/**
 * Theme gallery harness.
 *
 * A disposable profile must open the first-run sheet, preview a family
 * without applying it, apply a specific theme, and then keep both the theme
 * and the dismissal across a reload. Settings must still render the whole
 * periodic table with the gallery below it. Run `pnpm build` first.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT = 9381;
const shots = path.join(root, 'screenshots');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  throw new Error('no devtools');
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
    if (message.method === 'Runtime.exceptionThrown') {
      console.log('[exception]', message.params.exceptionDetails?.exception?.description);
      return;
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
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out: ${label}`);
}

async function shoot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shots, name);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('saved', name, fs.statSync(file).size);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

let child = null;

(async () => {
  try {
    const profile = path.join(root, '.tmp-gallery-profile');
    fs.rmSync(profile, { recursive: true, force: true });
    const userData = path.join(profile, 'Kryvex');
    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
    child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
      cwd: root,
      env: {
        ...process.env,
        KRYVEX_USER_DATA: userData,
        APPDATA: profile,
        LOCALAPPDATA: path.join(profile, 'local'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', data => {
      const text = String(data);
      if (!text.includes('wgc_capturer')) process.stderr.write(`[app] ${text}`);
    });

    const page = await target(PORT);
    const cdp = await connect(page.webSocketDebuggerUrl);

    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.theme-gallery-layer'))`, 'first look');
    const cards = await cdp.evaluate(
      `Array.from(document.querySelectorAll('.theme-gallery-family-card')).map(card => card.textContent.trim())`,
    );
    console.log('families:', JSON.stringify(cards));
    check(cards.length === 8, `Expected 8 family cards, got ${cards.length}`);
    check(
      (await cdp.evaluate(
        `document.querySelectorAll('.theme-mock').length`,
      )) >= 9,
      'Mocks did not render',
    );

    // The previews are the gallery's whole point: a clipped one is a lie.
    const clippedMocks = await cdp.evaluate(`(() => Array.from(document.querySelectorAll('.theme-mock'))
      .filter(mock => mock.scrollHeight > mock.clientHeight + 1 || mock.scrollWidth > mock.clientWidth + 1)
      .length)()`);
    check(clippedMocks === 0, `${clippedMocks} theme previews clip their own content`);
    await shoot(cdp, 'first-look.png');

    // Preview a family without applying it.
    await cdp.evaluate(`(() => {
      const card = Array.from(document.querySelectorAll('.theme-gallery-family-card'))
        .find(node => node.textContent.includes('GEMS'));
      card.click();
      return true;
    })()`);
    await sleep(300);
    const previewName = await cdp.evaluate(
      `document.querySelector('.theme-gallery-preview-meta strong').textContent.trim()`,
    );
    const appliedBefore = await cdp.evaluate(`document.documentElement.dataset.theme`);
    console.log('preview:', previewName, 'active:', appliedBefore);
    check(previewName === 'Sapphire', `Family preview did not switch to its hero: ${previewName}`);
    check(appliedBefore === 'kryvex-dark', 'Clicking a family must not apply a theme');

    // Apply a specific theme from the family.
    await cdp.evaluate(`(() => {
      const chip = Array.from(document.querySelectorAll('.theme-gallery-swatch'))
        .find(node => node.textContent.trim() === 'Ruby');
      chip.click();
      return true;
    })()`);
    await sleep(500);
    const afterApply = await cdp.evaluate(`document.documentElement.dataset.theme`);
    check(afterApply === 'ruby', `Applying from the gallery failed: ${afterApply}`);
    const overlayGone = await cdp.evaluate(`!document.querySelector('.theme-gallery-layer')`);
    check(overlayGone, 'The first-run sheet stayed open after a pick');

    // The dismissal must survive a reload: no overlay on the next launch.
    await cdp.evaluate(`window.location.reload(); true`);
    await sleep(2500);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'reload');
    const overlayAfterReload = await cdp.evaluate(
      `Boolean(document.querySelector('.theme-gallery-layer'))`,
    );
    const themeAfterReload = await cdp.evaluate(`document.documentElement.dataset.theme`);
    console.log('after reload:', themeAfterReload, 'overlay:', overlayAfterReload);
    check(!overlayAfterReload, 'First-run sheet returned after a reload');
    check(themeAfterReload === 'ruby', 'Chosen theme did not persist');

    // Settings keeps the periodic table and adds the gallery below it.
    await cdp.evaluate(`window.location.hash = '#/settings'; true`);
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.theme-families')) && Boolean(document.querySelector('#theme-gallery'))`,
      'settings sections',
    );
    const order = await cdp.evaluate(`(() => {
      const families = document.querySelector('.theme-families');
      const gallery = document.querySelector('#theme-gallery');
      return {
        periodicCount: document.querySelectorAll('.theme-families .theme-card').length,
        galleryAfter: Boolean(
          families.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        galleryCards: document.querySelectorAll('#theme-gallery .theme-gallery-family-card').length,
      };
    })()`);
    console.log('settings:', JSON.stringify(order));
    check(order.periodicCount >= 79, 'Periodic table lost tiles');
    check(order.galleryAfter, 'Gallery is not below the periodic table');
    check(order.galleryCards === 8, 'Settings gallery is not rendering all families');

    await cdp.evaluate(`(() => {
      document.querySelector('#theme-gallery').scrollIntoView({ block: 'start' });
      return true;
    })()`);
    await sleep(600);
    await shoot(cdp, 'theme-gallery.png');

    cdp.close();
    console.log('gallery harness: PASS');
  } catch (error) {
    console.error('gallery harness: FAIL', error.stack || error);
    process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) child.kill();
    await sleep(900);
    if (child && child.exitCode === null) child.kill('SIGKILL');
  }
})();
