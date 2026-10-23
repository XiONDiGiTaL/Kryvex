/* eslint-disable no-console */
/**
 * End-to-end check for the four surfaces added with 0.8.6:
 *
 *   - the resource panel reports Kryvex's own footprint and closes three ways;
 *   - the pinned rail opens a themed right-click menu;
 *   - a service page that plays audio produces a dock, accepts transport, and
 *     follows the dock's volume and repeat controls;
 *   - the resource panel can force-close one module without touching another;
 *   - parking the service (navigating Home) does not stop its audio.
 *
 * It drives the real app in a disposable profile against a local media page, so
 * it needs no account and no network. Run after `pnpm build`:
 *
 *   node scripts/verify-service-ux.cjs
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'screenshots');
const PORT = 9381;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

function wavTone() {
  const rate = 8000;
  const seconds = 1;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples);
  for (let i = 0; i < samples; i += 1) {
    data[i] = 128 + Math.round(18 * Math.sin((2 * Math.PI * 440 * i) / rate));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Tone Lab Theme</title>
<style>body{font:16px system-ui;background:#111;color:#eee;padding:40px}</style></head>
<body><h1>Tone Lab</h1><p>A local media page for the Kryvex dock check.</p>
<audio id="tone" loop autoplay src="/tone.wav"></audio>
<script>
  const audio = document.getElementById('tone');
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Tone Lab Theme',
      artist: 'Kryvex Verify',
    });
  } catch (error) {}
  const start = () => audio.play().catch(() => setTimeout(start, 250));
  start();
</script></body></html>`;

const TONE = wavTone();

async function serve() {
  const server = http.createServer((request, response) => {
    if (request.url === '/tone.wav') {
      response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': TONE.length });
      response.end(TONE);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(PAGE);
  });
  // Listen on every loopback family so the second fixture can use `localhost`.
  // Two services on one host would share a resource row, and the force-close
  // check needs each module to be attributed on its own.
  await new Promise(resolve => server.listen(0, resolve));
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

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-ux-'));
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'kryvex-state.json'),
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
          persistence: 'keep',
        },
        {
          id: 's-pause',
          name: 'Pause Lab',
          url: `${origin.replace('127.0.0.1', 'localhost')}pause`,
          category: 'other',
          color: '#2dd4bf',
          letter: 'P',
          pinned: true,
          createdAt: 2,
          persistence: 'pause',
        },
      ],
      bookmarks: [],
      history: [],
      recent: [],
      browser: { tabs: [], activeTabId: null },
      settings: {
        themeGallerySeen: true,
        resources: { enabled: true, sidebar: true },
      },
    }),
  );

  const port = launch(profile);
  const page = await target(port);
  const client = await connect(page.webSocketDebuggerUrl);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.pinned-item'))`, 12000, 'the shell');

  // 1. Pinned right-click menu.
  await client.evaluate(`(() => {
    const el = document.querySelector('.pinned-item');
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: 150, clientY: 260,
    }));
    return true;
  })()`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.service-context'))`, 3000, 'the service menu');
  const menu = await client.evaluate(`(() => {
    const node = document.querySelector('.service-context');
    const style = getComputedStyle(node);
    return {
      text: node.innerText,
      background: style.backgroundColor,
      radius: style.borderRadius,
      items: node.querySelectorAll('[role="menuitem"]').length,
    };
  })()`);
  for (const label of ['Edit', 'Remove', 'Mute sound', 'Notifications', 'Keep running', 'Unpin']) {
    check(menu.text.includes(label), `menu offers ${label}`);
  }
  check(menu.items >= 7, `menu has ${menu.items} actions`);
  check(menu.radius !== '0px' && menu.background !== 'rgba(0, 0, 0, 0)', 'menu is themed, not a native popup');
  await shot(client, 'verify-service-context-menu');

  await client.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`,
  );
  await waitFor(client.evaluate, `!document.querySelector('.service-context')`, 2500, 'Escape to close the menu');

  // 2. Activity panel: app-only numbers and three ways out.
  await client.evaluate(`document.querySelector('.header-tool.is-resources').click(); true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.resource-panel'))`, 3000, 'the resource panel');
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.resource-totals strong'))`,
    5000,
    'a resource sample',
  );
  const panel = await client.evaluate(`(() => {
    const node = document.querySelector('.resource-panel');
    return {
      text: node.innerText,
      cards: [...node.querySelectorAll('.resource-totals > div')].map(item => item.innerText),
      scope: node.querySelector('.resource-scope')?.textContent,
    };
  })()`);
  check(panel.scope === 'THIS APP ONLY', 'panel labels its scope');
  check(/KRYVEX CPU/.test(panel.text), 'panel shows Kryvex CPU');
  check(/KRYVEX MEMORY/.test(panel.text), 'panel shows Kryvex memory');
  check(!/MEMORY\s*\n?\s*26\.|26\.2 GB/.test(panel.text), 'panel does not present system memory as the app total');
  await shot(client, 'verify-resource-panel');

  await client.evaluate(
    `document.querySelector('.app-main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true;`,
  );
  await waitFor(client.evaluate, `!document.querySelector('.resource-panel')`, 2500, 'outside click to close the panel');
  await client.evaluate(`document.querySelector('.header-tool.is-resources').click(); true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.resource-panel'))`, 3000, 'the panel again');
  await client.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`,
  );
  await waitFor(client.evaluate, `!document.querySelector('.resource-panel')`, 2500, 'Escape to close the panel');

  const hideButton = await client.evaluate(
    `Boolean(document.querySelector('.sidebar-resources-hide'))`,
  );
  check(hideButton, 'sidebar resource block has a hide control');
  await client.evaluate(`document.querySelector('.sidebar-resources-hide').click(); true;`);
  await waitFor(client.evaluate, `!document.querySelector('.sidebar-resources')`, 2500, 'the sidebar block to hide');

  // 3. Media dock from a real service guest. At rest it is part of the status
  // bar; hovering opens the island only while the pointer is on the controls.
  await client.evaluate(`document.querySelector('.pinned-item').click(); true;`);
  await waitFor(client.evaluate, `Boolean(document.querySelector('.service-frame.is-active webview'))`, 8000, 'the service guest');
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.status-bar .media-dock-inline'))`,
    12000,
    'the inline media strip',
  );
  // Wake the strip from the edge before inspecting it, in case the page took
  // long enough to load that the idle timer already ran.
  const edgePoint = await client.evaluate(
    `(() => ({ x: 8, y: window.innerHeight - 20 }))()`,
  );
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: edgePoint.x,
    y: edgePoint.y,
  });
  await sleep(280);

  const inline = await client.evaluate(`(() => {
    const strip = document.querySelector('.media-dock-inline');
    const bar = document.querySelector('.status-bar');
    return {
      text: strip.innerText,
      insideBar: bar.contains(strip),
      panel: Boolean(document.querySelector('.media-dock')),
      height: strip.getBoundingClientRect().height,
    };
  })()`);
  check(inline.insideBar, 'media controls live inside the status bar');
  check(/Tone Lab Theme/.test(inline.text), 'the status strip shows the page title');
  check(!inline.panel, 'the island stays closed while the workspace is in use');
  check(inline.height <= 22, `the strip fits the status bar (${inline.height}px)`);
  await shot(client, 'verify-service-media-inline');

  // Leave the bottom edge and let the strip go idle.
  // Move over the service guest, which swallows the pointer moves above it.
  // The strip must still go idle instead of waiting forever for a host event.
  const workspacePoint = await client.evaluate(`(() => {
    const guest = document.querySelector('.service-frame.is-active webview');
    const box = guest.getBoundingClientRect();
    return {
      x: Math.round(box.left + box.width / 2),
      y: Math.round(box.top + box.height / 2),
    };
  })()`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: workspacePoint.x,
    y: workspacePoint.y,
  });
  await sleep(6000);
  const idle = await client.evaluate(`(() => {
    const slot = document.querySelector('.media-dock-slot');
    const strip = document.querySelector('.media-dock-inline');
    const style = getComputedStyle(strip);
    return {
      idle: slot.classList.contains('is-idle'),
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      panel: Boolean(document.querySelector('.media-dock')),
    };
  })()`);
  check(
    idle.idle,
    `the media strip fades after a few idle seconds (${JSON.stringify(idle)})`,
  );
  check(
    idle.opacity < 0.05 && idle.pointerEvents === 'none',
    `the faded strip stops taking clicks (opacity ${idle.opacity})`,
  );
  check(!idle.panel, 'idle does not leave the island open');

  // Approaching the bottom edge must bring it back without a click.
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: edgePoint.x,
    y: edgePoint.y,
  });
  await sleep(420);
  const revealed = await client.evaluate(`(() => {
    const slot = document.querySelector('.media-dock-slot');
    const strip = document.querySelector('.media-dock-inline');
    return {
      idle: slot.classList.contains('is-idle'),
      opacity: Number(getComputedStyle(strip).opacity),
    };
  })()`);
  check(
    !revealed.idle && revealed.opacity > 0.4,
    `approaching the bottom edge brings the strip back (opacity ${revealed.opacity})`,
  );

  const stripPoint = await client.evaluate(`(() => {
    const box = document.querySelector('.media-dock-inline').getBoundingClientRect();
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
  })()`);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: stripPoint.x, y: stripPoint.y });
  await waitFor(client.evaluate, `Boolean(document.querySelector('.media-dock'))`, 3000, 'hover to open the island');
  await sleep(260);
  const dock = await client.evaluate(`(() => {
    const node = document.querySelector('.media-dock');
    const bar = document.querySelector('.status-bar').getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return {
      text: node.innerText,
      buttons: [...node.querySelectorAll('button')].map(button => button.getAttribute('aria-label')),
      boxBottom: box.bottom,
      top: bar.top,
      left: box.left,
      slotLeft: document.querySelector('.media-dock-inline').getBoundingClientRect().left,
    };
  })()`);
  check(/Tone Lab Theme/.test(dock.text), 'the island shows the page title');
  check(dock.buttons.includes('Pause'), 'the island offers pause while playing');
  check(dock.buttons.includes('Next track'), 'the island offers next');
  check(
    dock.boxBottom <= dock.top,
    `the island opens above the status bar (${dock.boxBottom} <= ${dock.top})`,
  );
  check(dock.left >= dock.slotLeft - 2, 'the island is anchored to the media strip');
  await shot(client, 'verify-service-media-dock');

  // Move a real pointer through the gap and into the island. Without the hover
  // bridge the panel would unmount before the pointer reached it.
  const points = await client.evaluate(`(() => {
    const strip = document.querySelector('.media-dock-inline').getBoundingClientRect();
    const island = document.querySelector('.media-dock').getBoundingClientRect();
    return {
      x: Math.round(strip.left + strip.width / 2),
      gapY: Math.round(island.bottom + 4),
      islandY: Math.round(island.top + island.height / 2),
    };
  })()`);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.x, y: points.gapY });
  await sleep(180);
  check(
    await client.evaluate(`Boolean(document.querySelector('.media-dock'))`),
    'hover survives the gap to the island',
  );
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.x, y: points.islandY });
  await sleep(180);
  check(
    await client.evaluate(`Boolean(document.querySelector('.media-dock'))`),
    'the island stays open under the pointer',
  );
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 110, y: 520 });
  await waitFor(client.evaluate, `!document.querySelector('.media-dock')`, 2500, 'the island to close on real mouse leave');

  await client.evaluate(
    `document.querySelector('.media-dock-inline-btn[aria-label="Expand media controls"]').click(); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('.media-dock'))`, 3000, 'the pinned island');

  await client.evaluate(
    `document.querySelector('.media-dock button[aria-label="Pause"]').click(); true;`,
  );
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.media-dock button[aria-label="Play"]'))`,
    5000,
    'the dock to show Play after pausing',
  );
  const paused = await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript('document.getElementById("tone").paused')`,
  );
  check(paused === true, 'pause in the dock reached the guest page');

  await client.evaluate(
    `document.querySelector('.media-dock button[aria-label="Play"]').click(); true;`,
  );
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.media-dock button[aria-label="Pause"]'))`,
    5000,
    'the dock to show Pause after resuming',
  );

  // 4. Volume and repeat are page-level, so they have to reach the guest's own
  // media element and survive the player replacing it.
  const slider = await client.evaluate(`(() => {
    const input = document.querySelector('.media-dock-volume-range');
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '40');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
  check(slider === '40', 'the island offers a volume slider');
  await waitFor(
    client.evaluate,
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'Math.abs(document.getElementById("tone").volume - 0.4) < 0.02'
    )`,
    5000,
    'the page volume to follow the dock',
  );
  const pageVolume = await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'document.getElementById("tone").volume'
    )`,
  );
  check(Math.abs(pageVolume - 0.4) < 0.02, `the page volume follows the dock (${pageVolume})`);

  await client.evaluate(
    `document.querySelector('.media-dock button[aria-label="Repeat this clip"]').click(); true;`,
  );
  await waitFor(
    client.evaluate,
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'Boolean(window.__kryvexDock && window.__kryvexDock.repeat)'
    )`,
    5000,
    'the repeat guard to reach the page',
  );
  const guard = await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'JSON.stringify({ volume: window.__kryvexDock.volume, repeat: window.__kryvexDock.repeat })'
    )`,
  );
  check(JSON.parse(guard).volume === 0.4, 'the guard keeps the chosen volume');

  // The test page loops itself; disable that once so the guard's own restart is
  // the only thing that can keep the clip playing.
  await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      '(() => { const a = document.getElementById("tone"); a.loop = false; a.currentTime = Math.max(0, a.duration - 0.1); return true; })()'
    )`,
  );
  await sleep(2600);
  const looped = await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      '(() => { const a = document.getElementById("tone"); return { paused: a.paused, time: a.currentTime }; })()'
    )`,
  );
  check(
    looped && looped.paused === false && looped.time < 1,
    `repeat restarts the clip at the end (${JSON.stringify(looped)})`,
  );
  await client.evaluate(
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'document.getElementById("tone").loop = true; true;'
    )`,
  );
  await client.evaluate(
    `document.querySelector('.media-dock button[aria-label="Repeat this clip"]').click(); true;`,
  );
  await waitFor(
    client.evaluate,
    `document.querySelector('.service-frame.is-active webview').executeJavaScript(
      'window.__kryvexDock.repeat === false'
    )`,
    5000,
    'the repeat guard to stand down',
  );

  await client.evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true;`,
  );
  await waitFor(client.evaluate, `!document.querySelector('.media-dock')`, 2500, 'Escape to close the pinned island');

  // 5. Parking the service must not stop it.
  await client.evaluate(
    `document.querySelectorAll('.nav-item')[0].click(); true;`,
  );
  await sleep(1600);
  const parked = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame');
    const webview = document.querySelector('.service-frame webview');
    const style = frame ? getComputedStyle(frame) : null;
    return {
      hash: location.hash,
      display: style?.display,
      opacity: style?.opacity,
      dock: Boolean(document.querySelector('.media-dock-inline')),
      panel: Boolean(document.querySelector('.media-dock')),
    };
  })()`);
  check(parked.hash.startsWith('#/home'), 'navigated away from the service');
  check(parked.display === 'flex', 'the parked guest stays rendered');
  check(parked.dock, 'the status strip follows playback into another view');
  check(!parked.panel, 'the island is out of the way until it is needed');
  const stillPlaying = await client.evaluate(
    `document.querySelector('.service-frame webview').executeJavaScript('!document.getElementById("tone").paused')`,
  );
  check(stillPlaying === true, 'audio keeps playing while the service is parked');
  // Sample for two seconds: Chromium recomputes visibility after a route
  // change, and one early read can catch the transition.
  const visibilitySamples = [];
  for (let index = 0; index < 8; index += 1) {
    visibilitySamples.push(
      await client.evaluate(
        `document.querySelector('.service-frame webview').executeJavaScript('document.visibilityState')`,
      ),
    );
    await sleep(250);
  }
  check(
    visibilitySamples.filter(value => value === 'visible').length >= 7,
    `a parked guest stays visible to the page (${visibilitySamples.join(', ')})`,
  );
  await client.evaluate(
    `document.querySelector('.media-dock-inline').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); true;`,
  );
  await waitFor(client.evaluate, `Boolean(document.querySelector('.media-dock'))`, 3000, 'the parked island');
  await shot(client, 'verify-media-dock-home');
  await client.evaluate(`(() => {
    const slot = document.querySelector('.media-dock-inline');
    slot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    return true;
  })()`);

  // A module that opts into pause-when-hidden is the one exception: it may
  // leave layout, and its media must actually stop.
  await client.evaluate(`document.querySelectorAll('.pinned-item')[1].click(); true;`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-active[data-service="s-pause"]'))`,
    8000,
    'the pause-mode service',
  );
  const pauseFrame = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-service="s-pause"]');
    const style = getComputedStyle(frame);
    return { display: style.display, opacity: style.opacity };
  })()`);
  check(
    pauseFrame.display === 'flex' && pauseFrame.opacity === '1',
    'a pause-mode service is visible while it is active',
  );
  await client.evaluate(`document.querySelectorAll('.nav-item')[0].click(); true;`);
  await sleep(900);
  const pauseParked = await client.evaluate(`(() => {
    const frame = document.querySelector('.service-frame[data-service="s-pause"]');
    return frame ? getComputedStyle(frame).display : 'missing';
  })()`);
  check(pauseParked === 'none', 'a pause-mode service leaves layout when parked');
  const pauseStopped = await client.evaluate(
    `document.querySelector('.service-frame[data-service="s-pause"] webview').executeJavaScript('document.getElementById("tone").paused')`,
  );
  check(pauseStopped === true, 'its audio pauses while it is parked');

  // 6. Force-close is a two-press action and ends only the chosen module.
  await client.evaluate(`document.querySelectorAll('.pinned-item')[0].click(); true;`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.service-frame.is-active[data-service="s-tone"]'))`,
    8000,
    'the tone service again',
  );
  await client.evaluate(`document.querySelector('.header-tool.is-resources').click(); true;`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.resource-row .resource-kill'))`,
    5000,
    'a force-close button per service',
  );

  await client.evaluate(`(() => {
    const row = [...document.querySelectorAll('.resource-row')].find(item => /Tone Lab/.test(item.innerText));
    row?.querySelector('.resource-kill')?.click();
    return true;
  })()`);
  await waitFor(
    client.evaluate,
    `Boolean(document.querySelector('.resource-row .resource-kill.is-armed'))`,
    3000,
    'the armed force-close button',
  );
  const armed = await client.evaluate(`(() => {
    const button = document.querySelector('.resource-row .resource-kill.is-armed');
    return button ? { label: button.textContent.trim(), armed: true } : null;
  })()`);
  check(
    armed && armed.label === 'Kill?',
    `the first press only arms force-close (${JSON.stringify(armed)})`,
  );
  check(
    await client.evaluate(`Boolean(document.querySelector('.service-frame[data-service="s-tone"]'))`),
    'arming does not stop the service',
  );

  await client.evaluate(`(() => {
    const row = [...document.querySelectorAll('.resource-row')].find(item => /Tone Lab/.test(item.innerText));
    const button = row?.querySelector('.resource-kill');
    if (button) button.click();
    return true;
  })()`);
  await waitFor(
    client.evaluate,
    `!document.querySelector('.service-frame[data-service="s-tone"]')`,
    5000,
    'the killed frame to leave the stage',
  );
  check(
    await client.evaluate(`location.hash.startsWith('#/services')`),
    'force-close leaves the dead module behind',
  );
  check(
    await client.evaluate(`Boolean(document.querySelector('.service-frame[data-service="s-pause"]'))`),
    'force-close leaves every other module mounted',
  );
  await waitFor(
    client.evaluate,
    `![...document.querySelectorAll('.resource-row')].some(item => /Tone Lab/.test(item.innerText))`,
    5000,
    'the killed module to leave the panel',
  );

  server.close();
  client.close();
  console.log('PASS service UX (menu, resources, dock, parked playback)');
  return { profile, lines };
}

let exitCode = 0;
main()
  .catch(error => {
    exitCode = 1;
    console.error(`FAIL ${error && error.stack ? error.stack : error}`);
  })
  .finally(async () => {
    await stop();
    try {
      fs.writeFileSync(
        path.join(root, '.tmp-service-ux.log'),
        `${lines.join('\n')}\n${exitCode === 0 ? 'PASS' : 'FAIL'}\n`,
      );
    } catch {
      /* convenience only */
    }
    process.exit(exitCode);
  });
