/* eslint-disable no-console */
/**
 * Wallpaper check against the real Electron app.
 *
 * Proves the backdrop is opt-in: a fresh profile paints only the theme, the
 * switch turns on a wash built from the active accent (not a fixed gradient),
 * the wash follows a theme change, and the user's own image takes over after
 * switching the source. Also checks the choice survives a reload.
 *
 * Run `pnpm build` first (or use `pnpm verify:wallpaper`).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-wallpaper-profile');
const port = Number(process.env.KRYVEX_CDP_PORT || 9352);
const userData = path.join(profile, 'Kryvex');

const APP = `document.querySelector('.app')`;
const SWITCH = `document.querySelector('.wallpaper-panel [role="switch"]')`;

const style = `(() => {
  const app = ${APP};
  if (!app) return null;
  const computed = getComputedStyle(app);
  return {
    cls: app.className,
    image: computed.backgroundImage,
    fit: app.getAttribute('data-wallpaper'),
    wash: computed.getPropertyValue('--wallpaper-wash').trim(),
  };
})()`;

let child = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function seedProfile() {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
}

function launch() {
  child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: userData,
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function target() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Evaluation failed.');
    }
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('DOM.enable');
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

/** Optional visual evidence: KRYVEX_CAPTURE_WALLPAPER=1 writes screenshots/. */
async function shot(cdp, evaluate, name) {
  if (!process.env.KRYVEX_CAPTURE_WALLPAPER) return;
  await evaluate(
    `document.querySelector('.wallpaper-panel').scrollIntoView({ block: 'center' }); true`,
  );
  await sleep(400);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const dir = path.join(root, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`shot: screenshots/${name}.png`);
}

function savedState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, 'kryvex-state.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function waitForSaved(predicate, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = savedState();
    if (state && predicate(state.settings?.wallpaper ?? {})) return state;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for the saved wallpaper settings to show ${label}.`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

// A decodable PNG: importWallpaper re-encodes it through a canvas, so the
// renderer must actually decode the file rather than just echo the bytes.
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function makePng(size = 16) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      raw[offset] = Math.round((255 * x) / (size - 1));
      raw[offset + 1] = 90;
      raw[offset + 2] = Math.round((255 * y) / (size - 1));
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PNG = makePng();

(async () => {
  const fixture = path.join(profile, 'fixture.png');
  try {
    seedProfile();
    fs.writeFileSync(fixture, PNG);
    launch();
    const page = await target();
    const cdp = await connect(page.webSocketDebuggerUrl);
    await waitFor(cdp.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');

    // A fresh profile opens the first-run theme gallery over Settings.
    if (await cdp.evaluate(`Boolean(document.querySelector('.theme-gallery-layer'))`)) {
      await cdp.evaluate(`document.querySelector('[data-shot="gallery-skip"]').click(); true`);
      await waitFor(
        cdp.evaluate,
        `!document.querySelector('.theme-gallery-layer')`,
        'the first-run gallery to close',
      );
    }

    await cdp.evaluate(`window.location.hash = '#/settings'; true`);
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.wallpaper-panel [role="switch"]'))`,
      'wallpaper panel',
    );

    // ---- Off by default ------------------------------------------------
    const fresh = savedState();
    check(
      !fresh || fresh.settings?.wallpaper?.enabled !== true,
      'A fresh profile already enabled the wallpaper.',
    );
    check(
      (await cdp.evaluate(`${SWITCH}.getAttribute('aria-checked')`)) === 'false',
      'The wallpaper switch is not off on a fresh profile.',
    );
    const off = await cdp.evaluate(style);
    check(off && !/has-wallpaper/.test(off.cls), 'The shell paints a backdrop while the switch is off.');
    check(
      off.image === 'none',
      `The shell still has a background image while off: ${off.image}`,
    );
    check(off.fit === null, 'A fit mode was applied while the wallpaper was off.');
    await shot(cdp, cdp.evaluate, 'wallpaper-off');
    check(
      (await cdp.evaluate(`!document.querySelector('.wallpaper-sources')`)) === true,
      'The source picker is visible while the wallpaper is off.',
    );
    console.log('off:  no background image, no source picker');

    // ---- Switch on: theme wash -----------------------------------------
    await cdp.evaluate(`${SWITCH}.click(); true`);
    await waitFor(
      cdp.evaluate,
      `${APP}.className.includes('has-wallpaper')`,
      'the theme wash',
    );
    const wash = await cdp.evaluate(style);
    check(
      /radial-gradient|linear-gradient/.test(wash.image),
      `The theme wash is not a gradient: ${wash.image}`,
    );
    check(!wash.image.includes('url('), 'The theme wash loaded an image or file.');
    check(wash.fit === null, 'A fit mode was applied to the gradient wash.');
    check(
      (await cdp.evaluate(`Boolean(document.querySelector('.wallpaper-sources'))`)) === true,
      'Turning the wallpaper on did not reveal the source picker.',
    );
    check(
      (await cdp.evaluate(
        `getComputedStyle(document.querySelector('.wallpaper-preview')).backgroundImage.includes('gradient')`,
      )) === true,
      'The preview does not show the theme wash.',
    );
    await waitForSaved(wallpaper => wallpaper.enabled === true, 'enabled');

    // The wash must be theme-derived, not a fixed rainbow.
    const beforeAccent = wash.image;
    const originalAccent = await cdp.evaluate(
      `document.documentElement.style.getPropertyValue('--accent')`,
    );
    check(originalAccent.length > 0, 'The active theme exposes no accent token.');
    await cdp.evaluate(`document.documentElement.style.setProperty('--accent', '#ff2d55'); true`);
    await sleep(120);
    const afterAccent = (await cdp.evaluate(style)).image;
    check(
      afterAccent !== beforeAccent,
      'The wash did not change when the theme accent changed: it is not theme-derived.',
    );
    await cdp.evaluate(
      `document.documentElement.style.setProperty('--accent', ${JSON.stringify(originalAccent)}); true`,
    );
    await sleep(250);
    await shot(cdp, cdp.evaluate, 'wallpaper-theme-wash');
    console.log('on:   theme wash follows the accent');

    // ---- Source: my image, with no file yet -----------------------------
    await cdp.evaluate(`document.querySelector('.wallpaper-sources button:nth-child(2)').click(); true`);
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.wallpaper-pick input[type="file"]'))`,
      'the image picker',
    );
    const empty = await cdp.evaluate(style);
    check(
      /gradient/.test(empty.image),
      'Choosing "My image" with no file lost the backdrop instead of falling back to the wash.',
    );
    check(
      (await cdp.evaluate(`document.querySelector('.wallpaper-preview').textContent.includes('No image')`)) ===
        true,
      'The empty image state is not labelled.',
    );

    // ---- Import a file through the real picker --------------------------
    const doc = await cdp.send('DOM.getDocument', { depth: -1 });
    const node = await cdp.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '.wallpaper-pick input[type="file"]',
    });
    check(node.nodeId > 0, 'The wallpaper file input was not found in the DOM.');
    await cdp.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [fixture] });
    await waitFor(
      cdp.evaluate,
      `Boolean(document.querySelector('.wallpaper-preview img'))`,
      'the imported wallpaper preview',
    );
    await waitFor(
      cdp.evaluate,
      `getComputedStyle(${APP}).backgroundImage.includes('data:image/')`,
      'the imported wallpaper to paint the shell',
    );
    const image = await cdp.evaluate(style);
    check(
      /data:image\/(webp|png)/.test(image.image),
      `The shell is not painting the imported image: ${image.image.slice(0, 80)}`,
    );
    check(
      (await cdp.evaluate(`Boolean(document.querySelector('.wallpaper-fits'))`)) === true,
      'The fill controls did not appear for the image source.',
    );
    const savedImage = await waitForSaved(
      wallpaper => wallpaper.enabled === true && wallpaper.source === 'image',
      'image source',
    );
    check(
      savedImage.settings.wallpaper.fit === 'cover',
      'The saved fit mode drifted from the default.',
    );
    console.log('image: imported file paints the shell and is saved');

    // ---- Fill modes still apply to the image ---------------------------
    await cdp.evaluate(`document.querySelector('.wallpaper-fits button:nth-child(3)').click(); true`);
    await waitForSaved(wallpaper => wallpaper.fit === 'tile', 'tile fit');
    check(
      (await cdp.evaluate(`${APP}.getAttribute('data-wallpaper')`)) === 'tile',
      'The tile fit was not applied to the shell.',
    );

    // ---- Off, then reload: the choice persists --------------------------
    await cdp.evaluate(`${SWITCH}.click(); true`);
    await waitFor(cdp.evaluate, `!${APP}.className.includes('has-wallpaper')`, 'the wallpaper to turn off');
    const afterOff = await cdp.evaluate(style);
    check(
      afterOff.image === 'none',
      `The shell still paints a backdrop after switching off: ${afterOff.image}`,
    );
    await waitForSaved(wallpaper => wallpaper.enabled === false, 'disabled');
    await cdp.send('Page.enable');
    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(
      cdp.evaluate,
      `document.readyState === 'complete' && Boolean(document.querySelector('.app'))`,
      'the reloaded shell',
    );
    const reloaded = await waitFor(cdp.evaluate, style, 'the reloaded shell style');
    check(
      !/has-wallpaper/.test(reloaded.cls),
      'The wallpaper came back after a reload even though it was switched off.',
    );
    check(reloaded.image === 'none', 'The reloaded shell painted a disabled backdrop.');
    console.log('persisted: off stays off across a reload');

    cdp.close();
    console.log('PASS wallpaper is opt-in, theme-derived and user-image capable');
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  } finally {
    await stop();
  }
})();
