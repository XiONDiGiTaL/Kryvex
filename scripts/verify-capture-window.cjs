/* eslint-disable no-console */
/**
 * Drives a built app through the capture window, end to end.
 *
 * It takes a still of Kryvex's own window, finds the preview in its own CDP
 * target, checks the picture and the toolbar, saves it by accepting the real
 * Windows dialog (which lands in `Downloads\Kryvex Captures`), then records a
 * three-second clip and checks the window reopens on a video. Finally it presses
 * **New capture** and checks the shell came back with the card showing.
 *
 * Then the area path: the card is switched to *An area*, the picker has to open
 * on a frozen frame, a real pointer drag marks a box, and both a still and a
 * recording have to come back at the box's own size rather than the target's.
 *
 * Usage:
 *   pnpm build && pnpm verify:capture-window
 *
 * Windows only: accepting the dialog uses SendKeys, gated on the foreground
 * window belonging to the app process. Env: `KRYVEX_CDP_PORT` (default 9388).
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A fresh port per run: a leftover Electron from an earlier run can still hold a
// fixed one, and then every CDP call would talk to the wrong app.
const PORT = Number(process.env.KRYVEX_CDP_PORT || 9380 + Math.floor(Math.random() * 200));
const electron = require('electron');
const profile = path.join(os.tmpdir(), `kryvex-capture-window-${Date.now()}`);
const outDir = path.join(os.tmpdir(), 'kryvex-capture-check');
const target = path.join(outDir, `shot-${Date.now()}.png`);
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `, ${detail}` : ''}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.exceptions = [];
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data.toString());
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params?.exceptionDetails?.text ?? 'exception');
      }
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.ws.close();
  }
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

async function open(expression, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await expression()) return true;
    } catch {
      /* still loading */
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, KRYVEX_USER_DATA: profile },
    stdio: 'ignore',
  });
  console.log(`launched electron pid ${child.pid}`);

  let shellTarget = null;
  for (let attempt = 0; attempt < 60 && !shellTarget; attempt += 1) {
    await sleep(500);
    try {
      const list = await targets();
      shellTarget = list.find(item => item.type === 'page' && /dist\/index\.html/.test(item.url));
    } catch {
      /* not listening yet */
    }
  }
  if (!shellTarget) throw new Error('the shell never opened');
  check('the built app opened its shell', true);

  const shell = new Cdp(shellTarget.webSocketDebuggerUrl);
  await shell.ready();
  await shell.send('Runtime.enable');
  await sleep(1500);
  await shell.eval('location.hash = "#/home"; true');
  await sleep(1200);

  const picked = await shell.eval(`(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const customize = document.querySelector('.home-customize');
    if (!customize) return 'no picker';
    customize.click();
    await wait(400);
    const button = [...document.querySelectorAll('.home-widget-name')]
      .find(item => item.textContent.trim().toLowerCase() === 'screen capture');
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
    customize.click();
    await wait(700);
    return button ? 'on' : 'missing';
  })()`);
  check('the capture card can be switched on', picked === 'on', picked);

  const armed = await open(() =>
    shell.eval(`(() => {
      const select = document.querySelector('select');
      return Boolean(select) && select.options.length > 1;
    })()`),
  );
  check('the target list is populated', armed);

  const chosen = await shell.eval(`(() => {
    const select = document.querySelector('select');
    if (!select) return 'no select';
    const option = [...select.options].find(item => /kryvex/i.test(item.textContent));
    if (!option) return 'no kryvex window';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.textContent.trim();
  })()`);
  check('the app can capture its own window', typeof chosen === 'string' && /kryvex/i.test(chosen), String(chosen));
  await sleep(600);

  const clicked = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Capture still'));
    if (!button) return 'no button';
    if (button.disabled) return 'disabled';
    button.click();
    return 'clicked';
  })()`);
  check('a still can be taken', clicked === 'clicked', clicked);

  let previewTarget = null;
  for (let attempt = 0; attempt < 60 && !previewTarget; attempt += 1) {
    await sleep(500);
    try {
      const list = await targets();
      previewTarget = list.find(item => item.type === 'page' && /dist\/capture\.html/.test(item.url));
    } catch {
      /* keep waiting */
    }
  }
  if (!previewTarget) throw new Error('the preview window never opened');
  check('the capture opened in its own window', true, previewTarget.url);

  const preview = new Cdp(previewTarget.webSocketDebuggerUrl);
  await preview.ready();
  await preview.send('Runtime.enable');

  const loaded = await open(() =>
    preview.eval(`(() => {
      const image = document.querySelector('.cap-stage img');
      return Boolean(image) && image.complete && image.naturalWidth > 0;
    })()`),
  );
  const size = await preview.eval(`(() => {
    const image = document.querySelector('.cap-stage img');
    return image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  })()`);
  check('the picture renders in the window', loaded, size ? `${size.width}×${size.height}` : 'no image');

  const toolbar = await preview.eval(
    '[...document.querySelectorAll(".cap-tools button")].map(button => button.textContent.trim())',
  );
  check(
    'the toolbar offers the snipping-tool actions',
    ['Save as…', 'Copy', 'Always on top', 'Actual size', 'Close', 'New capture'].every(label =>
      toolbar.includes(label),
    ),
    toolbar.join(' | '),
  );

  const pinState = await preview.eval(`(async () => {
    const button = [...document.querySelectorAll('.cap-tools button')]
      .find(item => item.textContent.trim() === 'Always on top');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 400));
    return button.getAttribute('aria-pressed');
  })()`);
  check('the window can be pinned above others', pinState === 'true', String(pinState));

  const copyDone = await preview.eval('window.kryvexCapture.copy()');
  check('the still can go to the clipboard', copyDone === true, String(copyDone));

  // Save through the real dialog: press the window's own button, then accept the
  // native dialog the way a user does (it opens on Downloads\Kryvex Captures).
  const pressed = await preview.eval(`(() => {
    const button = document.querySelector('.cap-tools button.primary');
    if (!button) return 'no button';
    button.click();
    return 'clicked';
  })()`);
  check('the Save as… button opens the save flow', pressed === 'clicked', pressed);

  const dialog = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'save-dialog.ps1'),
      '-AppPid',
      String(child.pid),
      '-TargetPath',
      target,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  check('the native save dialog was accepted', /accepted/.test(dialog.stdout || ''), (dialog.stdout || dialog.stderr || '').trim());

  if (process.env.KRYVEX_DUMP_WINDOWS && !/accepted/.test(dialog.stdout || '')) {
    const dump = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', '.tmp-dump-windows.ps1')],
      { encoding: 'utf8', timeout: 30_000 },
    );
    const lines = (dump.stdout || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.includes(String(child.pid)) || /32770/.test(line));
    console.log('--- windows (app pid / dialogs) ---');
    for (const line of lines.slice(0, 20)) console.log('   ', line);
  }

  const savedShown = await open(
    () => preview.eval('document.querySelector(".cap-meta")?.textContent.includes("Saved to") ?? false'),
    40,
  );
  const footer = await preview.eval('document.querySelector(".cap-meta")?.textContent ?? ""');
  check('the window shows where the file went', savedShown, footer.trim().slice(0, 140));
  const reveal = await preview.eval(
    '[...document.querySelectorAll(".cap-tools button")].some(b => b.textContent.trim() === "Show in folder")',
  );
  check('the window offers the saved file in its folder', reveal === true);

  await sleep(1500);
  const statePath = path.join(profile, 'kryvex-state.json');
  let captures = [];
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    captures = state?.settings?.home?.screenCaptures ?? [];
  } catch {
    captures = [];
  }
  const entry = captures[0];
  check(
    'the board recorded the capture it never saw saved',
    Boolean(entry && entry.path && entry.path.includes('Kryvex Captures')),
    entry ? entry.path : `${captures.length} recent`,
  );

  const written = entry?.path ?? '';
  const onDisk = written && fs.existsSync(written) ? fs.statSync(written) : null;
  const signature = onDisk ? fs.readFileSync(written).subarray(0, 8) : Buffer.alloc(0);
  check(
    'the file is a real PNG on disk',
    Boolean(onDisk) && onDisk.size > 10_000 && signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    onDisk ? `${written} · ${onDisk.size} B` : `missing ${written}`,
  );
  if (onDisk) {
    try {
      fs.rmSync(written, { force: true });
    } catch {
      /* the file is the user's; leaving one behind is not a failure */
    }
  }

  // The same window takes a recording: close it, record three seconds, and the
  // window should reopen on a video rather than a still.
  await preview.eval('window.kryvexCapture.close()');
  await sleep(1200);
  const shellAfterClose = await targets();
  check(
    'the preview window closes on its own control',
    !shellAfterClose.some(item => /dist\/capture\.html/.test(item.url)),
  );

  const recorded = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Record');
    if (!button) return 'no record button';
    if (button.disabled) return 'disabled';
    button.click();
    return 'recording';
  })()`);
  check('a recording can be started', recorded === 'recording', recorded);
  await sleep(3500);
  const stopped = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Stop recording'));
    if (!button) return 'no stop button';
    button.click();
    return 'stopped';
  })()`);
  check('the recording can be stopped', stopped === 'stopped', stopped);

  let clipTarget = null;
  for (let attempt = 0; attempt < 40 && !clipTarget; attempt += 1) {
    await sleep(500);
    try {
      const list = await targets();
      clipTarget = list.find(item => item.type === 'page' && /dist\/capture\.html/.test(item.url));
    } catch {
      /* keep waiting */
    }
  }
  check('the recording opened in the preview window too', Boolean(clipTarget));

  if (clipTarget) {
    const clip = new Cdp(clipTarget.webSocketDebuggerUrl);
    await clip.ready();
    await clip.send('Runtime.enable');
    const playing = await open(
      () => clip.eval('(() => { const v = document.querySelector(".cap-stage video"); return Boolean(v) && v.readyState >= 2 && v.duration > 0; })()'),
      30,
    );
    const meta = await clip.eval(`(() => {
      const video = document.querySelector('.cap-stage video');
      return video ? { duration: Math.round(video.duration * 10) / 10, w: video.videoWidth } : null;
    })()`);
    check('the clip plays in the window', playing, meta ? `${meta.duration}s · ${meta.w}px` : 'no video');

    const kind = await clip.eval('document.querySelector(".cap-brand")?.textContent ?? ""');
    check('the window names it a recording', /Recording/.test(kind), kind.trim());

    // New capture hands the user back to the card that takes one.
    await clip.eval(`(() => {
      const button = [...document.querySelectorAll('.cap-tools button')].find(b => b.textContent.trim() === 'New capture');
      if (button) button.click();
      return true;
    })()`);
    const returned = await open(() => shell.eval('location.hash.includes("#/home")'), 20);
    const stillOpen = (await targets()).some(item => /dist\/capture\.html/.test(item.url));
    check('New capture returns to the board with the card showing', returned && !stillOpen);
    clip.close();
  }

  /* ------------------------------------------------- a dragged capture area --- */

  // Whole target stays the default; an area is the opt-in.
  const scope = await shell.eval(`(() => {
    const group = document.querySelector('.home-capture-scope');
    if (!group) return 'no control';
    const buttons = [...group.querySelectorAll('button')];
    const whole = buttons.find(item => /whole target/i.test(item.textContent));
    const area = buttons.find(item => /an area/i.test(item.textContent));
    if (!whole || !area) return 'no buttons';
    if (whole.getAttribute('aria-pressed') !== 'true' || area.getAttribute('aria-pressed') !== 'false') {
      return 'not on the whole target';
    }
    area.click();
    return 'area';
  })()`);
  check('the card starts on the whole target and offers an area', scope === 'area', scope);
  await sleep(400);

  const askedForArea = await shell.eval(`(() => {
    const hint = document.querySelector('.home-capture-area')?.textContent ?? '';
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Capture still'));
    if (!button) return 'no button';
    if (button.disabled) return 'disabled';
    window.__areaAt = performance.now();
    button.click();
    return /drag the area/i.test(hint) ? 'clicked' : 'no hint: ' + hint;
  })()`);
  check('an area capture says it will ask for the area', askedForArea === 'clicked', askedForArea);

  const pickerUp = await open(() =>
    shell.eval(`(() => {
      const image = document.querySelector('.capture-region-stage img');
      return Boolean(image) && image.complete && image.naturalWidth > 0;
    })()`),
  );
  const frame = await shell.eval(`(() => {
    const image = document.querySelector('.capture-region-stage img');
    return image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  })()`);
  const frozenMs = pickerUp ? await shell.eval('Math.round(performance.now() - window.__areaAt)') : -1;
  check(
    'the picker opens on a frozen frame of the target',
    pickerUp && Boolean(frame),
    frame ? `${frame.width}×${frame.height} in ${frozenMs}ms` : 'no image',
  );

  // A real drag, the way the browser delivers one.
  const dragged = await shell.eval(`(async () => {
    const stage = document.querySelector('.capture-region-stage');
    const layer = document.querySelector('.capture-region-drag');
    if (!stage || !layer) return { error: 'no picker' };
    const box = stage.getBoundingClientRect();
    const at = (x, y) => ({
      clientX: Math.round(box.left + x), clientY: Math.round(box.top + y),
      pointerId: 11, pointerType: 'mouse', buttons: 1, bubbles: true, cancelable: true, isPrimary: true,
    });
    const from = { x: Math.round(box.width / 4), y: Math.round(box.height / 4) };
    const to = { x: Math.round((box.width * 3) / 4), y: Math.round((box.height * 3) / 4) };
    layer.dispatchEvent(new PointerEvent('pointerdown', at(from.x, from.y)));
    layer.dispatchEvent(new PointerEvent('pointermove', at(to.x, to.y)));
    await new Promise(resolve => setTimeout(resolve, 60));
    layer.dispatchEvent(new PointerEvent('pointerup', at(to.x, to.y)));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const confirm = [...document.querySelectorAll('.capture-region-actions button')]
      .find(item => /capture this area/i.test(item.textContent));
    const image = document.querySelector('.capture-region-stage img');
    return {
      drawn: Boolean(document.querySelector('.capture-region-box')),
      label: (document.querySelector('.capture-region-size')?.textContent ?? '').trim(),
      hint: (document.querySelector('.capture-region-hint')?.textContent ?? '').trim(),
      confirm: Boolean(confirm) && !confirm.disabled,
      stage: { width: Math.round(box.width), height: Math.round(box.height) },
      frame: { width: image.naturalWidth, height: image.naturalHeight },
    };
  })()`);
  check(
    'a drag marks a box and offers to capture it',
    Boolean(dragged.drawn) && dragged.confirm === true,
    `${dragged.label ?? dragged.error ?? 'nothing'} (${dragged.hint ?? ''})`,
  );
  const areaSize = String(dragged.label ?? '')
    .split('×')
    .map(part => Number(part.trim()));
  check(
    'the box is smaller than the target it was drawn on',
    areaSize.length === 2 && areaSize.every(value => value > 0) && areaSize[0] < (dragged.frame?.width ?? 0),
    `${dragged.label} of ${dragged.frame?.width}×${dragged.frame?.height}`,
  );

  const confirmed = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('.capture-region-actions button')]
      .find(item => /capture this area/i.test(item.textContent));
    if (!button) return 'no confirm';
    if (button.disabled) return 'disabled';
    button.click();
    return 'confirmed';
  })()`);
  check('the picker confirms the area', confirmed === 'confirmed', confirmed);

  const findPreview = async (attempts = 40) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await sleep(500);
      try {
        const list = await targets();
        const found = list.find(item => item.type === 'page' && /dist\/capture\.html/.test(item.url));
        if (found) return found;
      } catch {
        /* keep waiting */
      }
    }
    return null;
  };

  const areaTarget = await findPreview();
  check('the cropped still opened in the preview window', Boolean(areaTarget));
  if (areaTarget) {
    const cropped = new Cdp(areaTarget.webSocketDebuggerUrl);
    await cropped.ready();
    await cropped.send('Runtime.enable');
    const shown = await open(() =>
      cropped.eval(`(() => {
        const image = document.querySelector('.cap-stage img');
        return Boolean(image) && image.complete && image.naturalWidth > 0;
      })()`),
    );
    const picture = await cropped.eval(`(() => {
      const image = document.querySelector('.cap-stage img');
      return image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
    })()`);
    check(
      'the still is the area, not the whole target',
      shown && Boolean(picture) && `${picture.width} × ${picture.height}` === dragged.label,
      picture ? `${picture.width}×${picture.height}, picker said ${dragged.label}` : 'no image',
    );
    await cropped.eval('window.kryvexCapture.close()');
    await sleep(1200);
    cropped.close();
  }

  // The remembered area drives a recording too, and that is the path that draws
  // through a canvas: the clip's own width has to be the area's width.
  const recordArea = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Record');
    if (!button) return 'no record button';
    if (button.disabled) return 'disabled';
    window.__areaRecordAt = performance.now();
    button.click();
    return 'recording';
  })()`);
  check('the chosen area is reused without asking again', recordArea === 'recording', recordArea);

  // Arming is the part that can be slow: the cropped recorder waits for the
  // first decoded frame before it starts, so this waits for the button and
  // reports how long it took rather than assuming a fixed delay.
  let areaArmed = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    areaArmed = await shell.eval(`(() => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Stop recording'));
      if (!button) return '';
      const spent = Math.round(performance.now() - window.__areaRecordAt);
      window.__areaRecordAt = performance.now();
      return String(spent);
    })()`);
    if (areaArmed) break;
    await sleep(150);
  }
  check('the cropped recording arms and runs', Boolean(areaArmed), areaArmed ? `${areaArmed}ms to start` : 'never started');
  await sleep(3500);
  const stopArea = await shell.eval(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('Stop recording'));
    if (!button) {
      // The card's own words, so a failed start says why rather than just not stopping.
      const card = document.querySelector('.home-capture-tool');
      const notes = [...(card?.querySelectorAll('.home-capture-note') ?? [])].map(node => node.textContent.trim());
      const labels = [...(card?.querySelectorAll('button') ?? [])].map(node => node.textContent.trim());
      return (
        'no stop button; notes ' + JSON.stringify(notes) +
        '; buttons ' + JSON.stringify(labels) +
        '; preview ' + Boolean(card?.querySelector('.home-capture-preview'))
      );
    }
    button.click();
    return 'stopped';
  })()`);
  check('the cropped recording can be stopped', stopArea === 'stopped', stopArea);

  const clipTargetArea = await findPreview();
  check('the cropped recording opened in the preview window', Boolean(clipTargetArea));
  if (clipTargetArea) {
    const clip = new Cdp(clipTargetArea.webSocketDebuggerUrl);
    await clip.ready();
    await clip.send('Runtime.enable');
    const plays = await open(() =>
      clip.eval(`(() => {
        const video = document.querySelector('.cap-stage video');
        return Boolean(video) && video.videoWidth > 0 && video.duration > 0;
      })()`),
      40,
    );
    const meta = await clip.eval(`(() => {
      const video = document.querySelector('.cap-stage video');
      return video ? { width: video.videoWidth, height: video.videoHeight, duration: Math.round(video.duration * 10) / 10 } : null;
    })()`);
    check(
      'the clip is the size of the area',
      plays && Boolean(meta) && Math.abs(meta.width - areaSize[0]) <= 2 && Math.abs(meta.height - areaSize[1]) <= 2,
      meta ? `${meta.width}×${meta.height} · ${meta.duration}s, area was ${dragged.label}` : 'no video',
    );
    await clip.eval('window.kryvexCapture.close()');
    await sleep(800);
    clip.close();
  }

  const errors = shell.exceptions.length + preview.exceptions.length;
  check('no page exception was raised', errors === 0, `${errors} exceptions`);

  preview.close();
  shell.close();
  await sleep(300);
  // Electron leaves helper processes behind when only the parent is killed, and
  // a survivor keeps the profile and the CDP port, so the whole tree goes.
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  try {
    fs.rmSync(target, { force: true });
  } catch {
    /* nothing to clean */
  }
  // The app may still be shutting down with the profile open; a locked file is
  // not a reason to fail a passing run.
  await sleep(1500);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    console.log(`  profile left at ${profile}`);
  }

  const failed = checks.filter(entry => !entry.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 300);
}

setTimeout(() => {
  console.log('watchdog: the harness ran out of time');
  process.exit(2);
}, 240_000).unref();

main().catch(error => {
  console.error(error);
  setTimeout(() => process.exit(1), 200);
});
