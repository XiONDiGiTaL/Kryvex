/* eslint-disable no-console */
/**
 * Couch co-op harness: two real app instances, one shared emulator, four seats.
 *
 * Instance A pops Rooms out into its own window, opens a room there, shares the
 * screen, then goes to the emulator route and loads a SNES cartridge. Instance B
 * starts link play, a controller claims seat 2, B joins through the invite,
 * watches the share, asks for control, and A allows it from the emulator panel.
 * B then holds an arrow key and the check reads the *core's own* view of the
 * world: the host's frame overrides `navigator.getGamepads()`, so
 * `pads[2].buttons[14]` being pressed is what a game would see for player 3 —
 * with `pads[1].buttons[3]` held on the controller in seat 2 and `pads[0]` clear,
 * which is the part that matters for two players on one screen. Finally the
 * host's window is minimized, because the seat loop is a `requestAnimationFrame`
 * clock and a throttled renderer would stop reading the pad without an error.
 *
 * The cartridge is supplied by the machine, never by the repository:
 * `KRYVEX_COUCH_ROM` (or the default path below) points at a file that is not
 * committed, and the harness refuses to run without it. It is staged into a
 * temporary folder inside the workspace before the file input is driven, because
 * Chromium's devtools file injection only resolves paths on the app's own volume.
 *
 * Run `pnpm build` first (or use `pnpm verify:couch`).
 */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const PORT_A = Number(process.env.KRYVEX_COUCH_PORT_A || 9361);
const PORT_B = Number(process.env.KRYVEX_COUCH_PORT_B || 9362);
const FIXTURE_PORT = 8161;

const ROM =
  process.env.KRYVEX_COUCH_ROM ||
  'D:\\Emulators\\SNES\\Roms\\Battletoads & Double Dragon - The Ultimate Team (U) [!].smc';

const SERVICE = {
  id: 's-couch',
  name: 'Couch fixture',
  url: `http://127.0.0.1:${FIXTURE_PORT}/fixture`,
  category: 'other',
  color: '#38BDF8',
  letter: 'C',
  pinned: true,
  createdAt: 1,
};

function stateFor(name) {
  return {
    version: 1,
    services: [SERVICE],
    bookmarks: [],
    history: [],
    recent: [],
    browser: { tabs: [], activeTabId: null },
    settings: { party: { displayName: name, color: name === 'Ada' ? '#38BDF8' : '#A78BFA' } },
  };
}

const stageDirectory = path.join(root, '.tmp-couch-rom');

const profiles = {
  a: path.join(root, '.tmp-couch-a'),
  b: path.join(root, '.tmp-couch-b'),
};

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    `<!doctype html><html><head><title>Couch fixture</title></head>
     <body style="font:16px sans-serif;padding:24px">
       <h1>Couch fixture</h1>
       <p>An app Kryvex can share into a room.</p>
     </body></html>`,
  );
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const children = [];

function seed(key, name) {
  const profile = profiles[key];
  fs.rmSync(profile, { recursive: true, force: true });
  const userData = path.join(profile, 'Kryvex');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(path.join(profile, 'local'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'kryvex-state.json'), JSON.stringify(stateFor(name)), 'utf8');
}

function launch(key, port) {
  const profile = profiles[key];
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
  child.stderr.on('data', data => process.stderr.write(`[${key}] ${data}`));
  children.push(child);
  return child;
}

async function target(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Failed.');
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { evaluate, send, close: () => socket.close() };
}

/**
 * The emulator frame, as its own devtools target.
 *
 * The frame is `sandbox="allow-scripts"`, so it has an opaque origin and the
 * browser puts it in its own process: the shell's frame tree only holds an
 * `about:blank` placeholder, and evaluating in *that* context reads an empty
 * document that never receives a message. The frame's real document — the one
 * running the core — is a separate target of type `iframe`, and that is the only
 * place `navigator.getGamepads()` means anything.
 */
async function frameTarget(port) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(response =>
        response.json(),
      );
      const target = list.find(item => item.type === 'iframe' && item.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error(`The emulator frame never appeared as a devtools target on ${port}.`);
}

async function clickText(nav, text, scope = 'button') {
  const clicked = await nav.evaluate(`(() => {
    const match = Array.from(document.querySelectorAll(${JSON.stringify(scope)}))
      .find(node => (node.textContent || '').trim() === ${JSON.stringify(text)});
    if (!match) return false;
    match.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`No ${scope} reading "${text}".`);
}

async function waitFor(evaluate, expression, label, attempts = 450) {
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

async function stop() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    child.kill();
  }
  await sleep(1200);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

/** The pressed mask of one seat's pad, as the core reads it. */
const padProbe = seat => `(() => {
  const pads = navigator.getGamepads();
  const pad = pads[${seat}];
  if (!pad) return null;
  return {
    pressed: pad.buttons.map(button => button.pressed),
    axes: pad.axes,
  };
})()`;

server.listen(FIXTURE_PORT, '127.0.0.1');

(async () => {
  try {
    check(fs.existsSync(ROM), `No cartridge at ${ROM}. Set KRYVEX_COUCH_ROM to a ROM file.`);
    fs.rmSync(stageDirectory, { recursive: true, force: true });
    fs.mkdirSync(stageDirectory, { recursive: true });
    const staged = path.join(stageDirectory, path.basename(ROM));
    fs.copyFileSync(ROM, staged);
    console.log('cartridge:', ROM);

    seed('a', 'Ada');
    seed('b', 'Grace');
    const hostProcess = launch('a', PORT_A);

    const pageA = await target(PORT_A);
    const a = await connect(pageA.webSocketDebuggerUrl);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.app'))`, 'shell A');

    // A mounts the fixture service (so the picker has an app source) and opens
    // Rooms on its route, which is the only surface that offers the pop-out.
    await a.evaluate(`window.location.hash = '#/service/s-couch'; true`);
    await waitFor(
      a.evaluate,
      `(() => { const w = document.querySelector('webview'); try { return Boolean(w) && !w.isLoading(); } catch { return false; } })()`,
      'fixture service',
    );
    await a.evaluate(`window.location.hash = '#/rooms'; true`);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.rooms-lobby'))`, 'Rooms lobby');

    // Pop out first, then open the room inside the window: that is the setup
    // this check exists for — the room lives over the app, not on the route.
    await clickText(a, 'Pop out');
    await waitFor(
      a.evaluate,
      `Boolean(document.querySelector('.service-frame.is-tool-window .rooms-lobby'))`,
      'Rooms in its window',
    );
    console.log('rooms: popped out');

    await clickText(a, 'Create a room');
    const room = await waitFor(
      a.evaluate,
      `document.querySelector('.service-frame.is-tool-window .room-code')?.textContent?.trim() ?? null`,
      'room code',
    );
    console.log('room:', room);
    check(/^[0-9a-hjkmnp-tv-z]{26}$/.test(room), `Unexpected room code: ${room}`);

    // Share the screen from the window, the same picker a user sees.
    await a.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('.service-frame.is-tool-window button'))
        .find(node => node.textContent.includes('Share something'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await waitFor(
      a.evaluate,
      `Boolean(document.querySelector('.service-frame.is-tool-window .room-picker .room-source'))`,
      'share picker',
    );
    await a.evaluate(`(() => {
      const group = Array.from(document.querySelectorAll('.room-source-group'))
        .find(node => node.textContent.includes('SCREENS'));
      const tile = group?.querySelector('.room-source');
      if (!tile) return false;
      tile.click();
      return true;
    })()`);
    await a.evaluate(`(() => {
      const start = Array.from(document.querySelectorAll('.room-picker button'))
        .find(node => node.textContent.includes('Start sharing'));
      if (!start) return false;
      start.click();
      return true;
    })()`);
    await waitFor(
      a.evaluate,
      `(() => { const v = document.querySelector('.service-frame.is-tool-window .room-tile video'); return Boolean(v) && v.videoWidth > 0; })()`,
      'local preview frames',
    );
    console.log('screen share: live');

    // The host goes to the emulator with the room still running in its window.
    await a.evaluate(`window.location.hash = '#/emulator'; true`);
    await waitFor(a.evaluate, `Boolean(document.querySelector('.emulator-frame'))`, 'emulator view');

    // Hand the cartridge to the real file input, the way a chooser would.
    const document_ = await a.send('DOM.getDocument', { depth: -1 });
    const input = await a.send('DOM.querySelector', {
      nodeId: document_.root.nodeId,
      selector: 'input[type="file"][multiple]',
    });
    check(input.nodeId, 'The cartridge input was not found.');
    await a.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [staged] });
    const loadedName = await waitFor(
      a.evaluate,
      `(() => {
        const text = document.querySelector('.emulator-slot strong')?.textContent?.trim() ?? '';
        return text && text !== 'Drop a ROM here' ? text : null;
      })()`,
      'cartridge in the slot',
    );
    check(
      /battletoads/i.test(loadedName),
      `The slot shows "${loadedName}" rather than the cartridge.`,
    );
    console.log('cartridge:', loadedName);

    // ---- A physical controller, in seat 2 ---------------------------------
    // Seats become pad frames only while link play runs, so the host starts it:
    // that is the state a couch session is actually in.
    // Hosting is offered once the core reports itself running, so this is also
    // where a slow or failed core start shows up. Say what the panel said
    // instead of timing out on a disabled button.
    try {
      await waitFor(
        a.evaluate,
        `(() => {
          const button = Array.from(document.querySelectorAll('button'))
            .find(node => (node.textContent || '').trim() === 'Host this cartridge');
          return Boolean(button) && !button.disabled;
        })()`,
        'hosting is available',
      );
    } catch (error) {
      console.log(
        'emulator at the time:',
        JSON.stringify(
          await a.evaluate(`(() => ({
            slot: document.querySelector('.emulator-slot strong')?.textContent?.trim() ?? '',
            error: document.querySelector('.emulator-error')?.textContent?.trim() ?? '',
            hint: document.querySelector('.emulator-hint')?.textContent?.trim() ?? '',
            stage: (document.querySelector('.emulator-stage')?.textContent || '').trim().slice(0, 240),
          }))()`),
        ),
      );
      throw error;
    }
    await clickText(a, 'Host this cartridge');
    await waitFor(
      a.evaluate,
      `(() => { const p = document.querySelector('.emulator-netplay-role'); return Boolean(p) && p.textContent.includes('host'); })()`,
      'A is hosting link play',
    );
    console.log('link play: hosting');

    // A controller, plugged in after hosting so player 1 keeps its keyboard.
    // `navigator.getGamepads()` is the only thing the seat loop reads, so a live
    // pad is exactly what a USB controller looks like from inside the app — the
    // stub below is the whole difference, and nothing in the app knows it.
    await a.evaluate(`(() => {
      window.__pad = {
        id: 'Fake controller (STANDARD GAMEPAD)',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      // A real pad hands out a fresh snapshot per call, and the seat loop
      // decides a claim by comparing two of them. Returning one mutable object
      // would let the "before" snapshot change along with the press, which
      // hides the up-to-down edge and makes the claim a race.
      navigator.getGamepads = () => [
        {
          id: window.__pad.id,
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: window.__pad.axes.slice(),
          buttons: window.__pad.buttons.map(button => ({ ...button })),
        },
        null,
        null,
        null,
      ];
      window.__press = (index, down) => {
        window.__pad.buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 };
        return true;
      };
      return true;
    })()`);

    // Seat 2 is armed, then the pad's first button press claims it. Player 1 is
    // left alone: the claim is for the seat the user asked for, not "the free
    // one", so the keyboard in seat 1 keeps its corner.
    await a.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('.emulator-couch-seats li'))[1];
      const button = row
        ? Array.from(row.querySelectorAll('button')).find(node => node.textContent.includes('Use a controller'))
        : null;
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await a.evaluate(`window.__press(0, true)`);
    const padSeat = await waitFor(
      a.evaluate,
      `(() => {
        const row = Array.from(document.querySelectorAll('.emulator-couch-seats li'))[1];
        const text = row?.querySelector('.emulator-couch-seat em')?.textContent?.trim() ?? '';
        return /Controller/.test(text) ? text : null;
      })()`,
      'the controller claimed seat 2',
    );
    console.log('seat 2:', padSeat);
    await a.evaluate(`window.__press(0, false)`);

    const beforeGuest = await a.evaluate(
      `(() => Array.from(document.querySelectorAll('.emulator-couch-seat em')).map(node => node.textContent.trim()))()`,
    );
    console.log('seats before the guest:', JSON.stringify(beforeGuest));
    check(
      /W A S D/.test(beforeGuest[0]),
      `Player 1 lost the keyboard when a controller was claimed: ${beforeGuest[0]}`,
    );

    // B joins through the invite link and takes the share.
    launch('b', PORT_B);
    const pageB = await target(PORT_B);
    const b = await connect(pageB.webSocketDebuggerUrl);
    await waitFor(b.evaluate, `Boolean(document.querySelector('.app'))`, 'shell B');
    await b.evaluate(`window.location.hash = '#/rooms?room=' + ${JSON.stringify(room)}; true`);
    await waitFor(
      b.evaluate,
      `(() => {
        const rows = Array.from(document.querySelectorAll('.room-person'));
        return rows.length >= 2 && rows.some(row => row.textContent.includes('Ada'));
      })()`,
      'peer B sees Ada',
    );
    const remote = await waitFor(
      b.evaluate,
      `(() => { const v = document.querySelector('.room-tile video'); return v && v.videoWidth > 0 ? { width: v.videoWidth, height: v.videoHeight } : null; })()`,
      'remote video frames',
    );
    console.log('share at B:', JSON.stringify(remote));

    await clickText(b, 'Ask to control');
    await waitFor(
      a.evaluate,
      `(() => { const p = document.querySelector('.emulator-couch-control'); return Boolean(p) && p.textContent.includes('asking to control'); })()`,
      'control request at A',
    );
    await clickText(a, 'Allow');
    const granted = await waitFor(
      a.evaluate,
      `document.querySelector('.emulator-couch-control')?.textContent?.trim() ?? null`,
      'granted control at A',
    );
    console.log('control:', granted);
    check(/Grace/.test(granted), `The emulator does not name the holder: ${granted}`);
    // Grace has not pressed a key yet, so the seat she is about to be given is
    // the first free one: seat 3, because the controller holds seat 2.
    check(/player 3/.test(granted), `The holder was not seated after the controller: ${granted}`);

    // The tile only becomes a keyboard target once the viewer has been told it
    // holds control, which is the part that used to be dropped on the floor.
    await waitFor(
      b.evaluate,
      `(() => {
        const tile = document.querySelector('.room-tile');
        const badge = document.querySelector('.room-tile-badge')?.textContent?.trim();
        return tile?.classList.contains('is-controlling') && badge === 'REMOTE CONTROL';
      })()`,
      'B holds control of the share',
    );
    console.log('viewer control: granted');
    // Bring B's window forward before touching it: keys go to the focused
    // window, and A's window was launched later and is therefore on top.
    await b.send('Page.bringToFront');
    await sleep(400);
    // Focus the tile the way a viewer does — by clicking it, which is what its
    // own pointer handler does — because a bare `.focus()` on a node the panel
    // has just re-rendered does not reliably leave the keys going anywhere.
    const box = await b.evaluate(`(() => {
      const video = document.querySelector('.room-tile video');
      video.scrollIntoView({ block: 'center' });
      const rect = video.getBoundingClientRect();
      const x = Math.round(rect.x + rect.width / 2);
      const y = Math.round(rect.y + rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        hit: hit ? hit.tagName + (hit.className ? '.' + hit.className : '') : null,
      };
    })()`);
    console.log('tile centre:', JSON.stringify(box));
    check(
      box.hit && box.hit.startsWith('VIDEO'),
      `The share is not under the pointer at its centre: ${box.hit}`,
    );
    await b.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    });
    await b.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    });
    const focused = await waitFor(
      b.evaluate,
      `document.activeElement?.tagName === 'VIDEO'
        ? { tag: document.activeElement.tagName, hasFocus: document.hasFocus() }
        : null`,
      'B focused the share',
    );
    console.log('focus at B:', JSON.stringify(focused));

    const press = async (type, key, code) =>
      b.send('Input.dispatchKeyEvent', {
        type,
        key,
        code,
        windowsVirtualKeyCode: 37,
        nativeVirtualKeyCode: 37,
      });

    // The core's own view of the pads. Loading a cartridge remounts the frame,
    // so this connects after the cartridge is in the slot and reconnects if the
    // target it was talking to has gone away.
    let frame = await connect((await frameTarget(PORT_A)).webSocketDebuggerUrl);
    const frameEval = async expression => {
      try {
        return await frame.evaluate(expression);
      } catch {
        frame.close();
        frame = await connect((await frameTarget(PORT_A)).webSocketDebuggerUrl);
        return frame.evaluate(expression);
      }
    };

    // Grace holds left. Her key goes to the first free seat — seat 3, because
    // the controller holds seat 2 — and it must not disturb the pad or player 1.
    await press('keyDown', 'ArrowLeft', 'ArrowLeft');
    const seats = await waitFor(
      a.evaluate,
      `(() => {
        const rows = Array.from(document.querySelectorAll('.emulator-couch-seats li'));
        const values = rows.map(row => ({
          device: row.querySelector('.emulator-couch-seat em')?.textContent?.trim() ?? '',
          keys: row.querySelector('select.emulator-couch-keys')?.value ?? '',
        }));
        return values[2] && values[2].keys === 'arrows' ? values : null;
      })()`,
      'Grace seated on the arrows in seat 3',
      60,
    );
    console.log('seats:', JSON.stringify(seats));
    check(
      /Controller/.test(seats[1].device),
      `Seat 2 lost its controller when the guest typed: ${seats[1].device}`,
    );
    check(
      /W A S D/.test(seats[0].device),
      `Player 1's keys moved to ${seats[0].device} when the guest typed.`,
    );

    let seen = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      seen = await frameEval(padProbe(2));
      if (seen && seen.pressed[14]) break;
      await sleep(150);
    }
    check(
      seen !== null,
      `The core sees no pad for player 3: ${JSON.stringify(
        await frameEval(`(() => ({
          overridden: String(navigator.getGamepads).includes('netplayPads'),
          pads: Array.from(navigator.getGamepads()).map(pad => (pad ? pad.id : null)),
        }))()`),
      )}`,
    );
    check(seen.pressed[14], `Player 3 never received left: ${JSON.stringify(seen.pressed)}`);
    console.log('player 3 left: pressed');

    const playerOne = await frameEval(padProbe(0));
    check(playerOne !== null, 'The core sees no pad for player 1.');
    check(
      !playerOne.pressed[14],
      `Player 1's left was pressed by player 3's key: ${JSON.stringify(playerOne.pressed)}`,
    );
    console.log('player 1 left: clear');

    const seatTwo = await frameEval(padProbe(1));
    check(seatTwo !== null, 'The core sees no pad for player 2.');
    check(
      !seatTwo.pressed[14] && !seatTwo.pressed[0],
      `The guest's key moved the controller in player 2's seat: ${JSON.stringify(seatTwo.pressed)}`,
    );
    console.log('player 2 controller: untouched by the guest key');

    // Both inputs at once: the controller in seat 2 and the remote keys in seat
    // 3. This is the case a two-player couch session actually lives in.
    await a.evaluate(`window.__press(3, true)`);
    let both = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      both = { pad: await frameEval(padProbe(1)), remote: await frameEval(padProbe(2)) };
      if (both.pad?.pressed[3] && both.remote?.pressed[14]) break;
      await sleep(150);
    }
    check(
      both.pad?.pressed[3],
      `The controller in seat 2 never reached the core: ${JSON.stringify(both.pad?.pressed)}`,
    );
    check(
      both.remote?.pressed[14],
      `Player 3's key was dropped while the controller was held: ${JSON.stringify(both.remote?.pressed)}`,
    );
    console.log('both inputs: held together');

    await press('keyUp', 'ArrowLeft', 'ArrowLeft');
    let released = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      released = { pad: await frameEval(padProbe(1)), remote: await frameEval(padProbe(2)) };
      if (released.remote && !released.remote.pressed[14]) break;
      await sleep(150);
    }
    check(
      released.remote && !released.remote.pressed[14],
      `Player 3's left stayed down after the key came up: ${JSON.stringify(released.remote?.pressed)}`,
    );
    check(
      released.pad?.pressed[3],
      `Releasing the guest's key also released the controller in seat 2: ${JSON.stringify(released.pad?.pressed)}`,
    );
    console.log('player 3 left: released; player 2 still held');

    await a.evaluate(`window.__press(3, false)`);
    let cleared = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      cleared = await frameEval(padProbe(1));
      if (cleared && !cleared.pressed[3]) break;
      await sleep(150);
    }
    check(
      cleared && !cleared.pressed[3],
      `The controller in seat 2 stayed down after its button came up: ${JSON.stringify(cleared?.pressed)}`,
    );
    console.log('player 2 controller: released');

    console.log(
      'host visibility during the hold:',
      await a.evaluate(`document.visibilityState`),
      '· frames arrived:',
      both.pad?.pressed[3] === true,
    );

    // A minimized host is the case that could kill a seat loop quietly: it runs
    // on requestAnimationFrame, which a throttled renderer may pause, and the
    // person sharing their screen is exactly the one who looks away. This
    // Electron build exposes no window state to devtools, so the OS handle is
    // the only way to stage it. Without a handle the step is skipped and said
    // so, rather than passing on an assumption.
    let minimized = false;
    try {
      const output = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);'; ` +
            `$p = Get-Process -Id ${hostProcess.pid}; ` +
            `if ($p.MainWindowHandle -ne 0) { [Native.Win]::ShowWindowAsync($p.MainWindowHandle, 6); 'minimized' } else { 'no-handle' }`,
        ],
        { encoding: 'utf8' },
      ).trim();
      minimized = output.includes('minimized');
      if (!minimized) console.log('minimize skipped: the host window has no handle');
    } catch (error) {
      console.log('minimize skipped:', String(error.message || error).split('\n')[0]);
    }
    if (minimized) {
      await sleep(2500);
      await a.evaluate(`window.__press(2, true)`);
      let hidden = null;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        hidden = await frameEval(padProbe(1));
        if (hidden && hidden.pressed[2]) break;
        await sleep(200);
      }
      await a.evaluate(`window.__press(2, false)`);
      check(
        hidden && hidden.pressed[2],
        `A minimized host stopped reading its controller: ${JSON.stringify(hidden?.pressed)}`,
      );
      console.log('player 2 controller: arrived while the host was minimized');
    }

    frame.close();
    a.close();
    b.close();
    await stop();
    console.log('couch co-op harness: PASS');
  } catch (error) {
    console.error('couch co-op harness: FAIL', error.stack || error);
    await stop();
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(stageDirectory, { recursive: true, force: true });
  }
})();
