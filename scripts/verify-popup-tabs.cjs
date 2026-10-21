/* eslint-disable no-console */
/**
 * Popup tabs: a browser page's `window.open` must stay inside Kryvex.
 *
 * Run `pnpm build` first. Usage: `node scripts/verify-popup-tabs.cjs`.
 *
 * The fixture opener asks the real app to sign in with `window.open`. The check
 * then proves, against the running app:
 *
 * - the popup appears in the shell's tab strip (`tab.is-popup`);
 * - the opener page receives the provider's `postMessage`, which is the step
 *   that fails when a sign-in window leaves for the system browser;
 * - the popup window is positioned over the browser canvas, not somewhere else
 *   on the desktop;
 * - closing the popup removes the tab and returns to the opener.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.tmp-popup-tabs-profile');
const cdpPort = Number(process.env.KRYVEX_CDP_PORT || 9347);
const httpPort = Number(process.env.KRYVEX_POPUP_PORT || 8126);
const origin = `http://127.0.0.1:${httpPort}`;

let child = null;

const openerPage = `<!doctype html>
<title>Popup fixture</title>
<body style="margin:0;padding:40px;background:#101820;color:#eaf2ff;font:16px sans-serif">
<h1>Popup fixture</h1>
<button id="open" style="padding:14px 22px;font:16px sans-serif"
  onclick="window.kxPopup = window.open('/popup', 'kx-signin', 'width=480,height=640')">Sign in</button>
<p id="result">waiting</p>
<script>
  window.kxMessage = null;
  window.addEventListener('message', event => {
    window.kxMessage = event.data;
    document.getElementById('result').textContent = 'opener received ' + event.data;
  });
</script>`;

const popupPage = `<!doctype html>
<title>Fixture sign-in</title>
<body style="margin:0;padding:28px;background:#12233a;color:#fff;font:16px sans-serif">
<h1 style="font-size:20px">Signing you in…</h1>
<p id="state">checking opener…</p>
<script>
  window.kxHasOpener = Boolean(window.opener);
  document.getElementById('state').textContent = 'opener: ' + window.kxHasOpener;
  setTimeout(() => {
    try {
      window.opener.postMessage('kx-popup-ok', '*');
      window.kxPosted = true;
    } catch (error) {
      window.kxError = String(error);
    }
  }, 500);
  setTimeout(() => window.close(), 6000);
</script>`;

const server = http.createServer((request, response) => {
  const url = (request.url || '/').split('?')[0];
  if (url === '/popup') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(popupPage);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(openerPage);
});

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.join(profile, 'local'), { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch() {
  child = spawn(electron, ['.', `--remote-debugging-port=${cdpPort}`], {
    cwd: root,
    env: {
      ...process.env,
      KRYVEX_USER_DATA: path.join(profile, 'Kryvex'),
      APPDATA: profile,
      LOCALAPPDATA: path.join(profile, 'local'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', data => process.stderr.write(`[app:err] ${data}`));
}

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  return response.json();
}

async function waitForTarget(predicate, label) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const list = await listTargets();
      const found = list.find(predicate);
      if (found) return found;
    } catch {
      /* the app is still starting */
    }
    await sleep(250);
  }
  throw new Error(`Target not found: ${label}`);
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
  return { evaluate, send, close: () => socket.close() };
}

async function waitFor(evaluate, expression, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

/**
 * Window rectangles, read from the desktop rather than from the app: the whole
 * point is that the popup is a real window covering the canvas.
 */
function windowRects() {
  const script = `
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class KxWindows {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr extra);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public static List<string> List() {
    var found = new List<string>();
    EnumWindows((hWnd, extra) => {
      if (!IsWindowVisible(hWnd)) return true;
      var text = new StringBuilder(512);
      GetWindowText(hWnd, text, 512);
      RECT rect;
      if (!GetClientRect(hWnd, out rect)) return true;
      var origin = new POINT();
      ClientToScreen(hWnd, ref origin);
      found.Add(text.ToString() + "|" + origin.X + "," + origin.Y + "," + (rect.Right - rect.Left) + "," + (rect.Bottom - rect.Top));
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[KxWindows]::List() | ForEach-Object { Write-Output $_ }
`;
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8' },
  );
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [title, geometry] = line.split('|');
      const [x, y, width, height] = (geometry || '').split(',').map(Number);
      return { title, x, y, width, height };
    })
    .filter(rect => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite));
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

server.listen(httpPort, '127.0.0.1');

(async () => {
  try {
    launch();
    const shellTarget = await waitForTarget(
      item => item.type === 'page' && item.title === 'Kryvex',
      'Kryvex shell',
    );
    const shell = await connect(shellTarget.webSocketDebuggerUrl);
    await waitFor(shell.evaluate, `Boolean(document.querySelector('.app'))`, 'shell');

    await shell.evaluate(
      `window.location.hash = '#/browser?url=' + encodeURIComponent('${origin}/'); true`,
    );
    const guestTarget = await waitForTarget(
      item => typeof item.url === 'string' && item.url.startsWith(`${origin}/`),
      'browser guest',
    );
    const guest = await connect(guestTarget.webSocketDebuggerUrl);
    await waitFor(guest.evaluate, `Boolean(document.getElementById('open'))`, 'fixture button');

    const canvas = await waitFor(
      shell.evaluate,
      `(() => {
        const node = document.querySelector('.browser-canvas');
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
      })()`,
      'canvas rectangle',
    );

    // A webview guest has no own compositor surface, so CDP pointer events do
    // not reach it; a click evaluated with `userGesture` does, and that
    // transient activation is what lets Chromium open the popup.
    const opened = await guest.evaluate(
      `window.kxPopup = window.open('/popup', 'kx-signin', 'width=480,height=640'); Boolean(window.kxPopup)`,
    );
    if (!opened) throw new Error('window.open was blocked inside the browser tab.');

    const tab = await waitFor(
      shell.evaluate,
      `(() => {
        const node = document.querySelector('.tab.is-popup');
        if (!node) return null;
        const title = node.querySelector('.tab-title')?.textContent || '';
        if (!title.includes('Fixture sign-in')) return null;
        return { title, active: node.classList.contains('is-active') };
      })()`,
      'popup tab with its page title',
    );
    if (!tab.active) throw new Error('The popup tab did not become the selected tab.');

    const message = await waitFor(guest.evaluate, `window.kxMessage`, 'opener postMessage');
    if (message !== 'kx-popup-ok') throw new Error(`Unexpected opener message: ${message}`);

    // Placement: the popup window must cover the canvas of the shell window.
    await sleep(400);
    const rects = windowRects();
    const shellRect = rects.find(rect => rect.title === 'Kryvex');
    const popupRect =
      rects.find(rect => rect.title.includes('Fixture sign-in')) ||
      // Some pages set the title after the first paint; fall back to the window
      // that is neither the shell nor a system surface.
      rects.find(
        rect =>
          rect.title !== 'Kryvex' &&
          rect.width > 100 &&
          Math.abs(rect.width - canvas.width) <= 6 &&
          Math.abs(rect.height - canvas.height) <= 6,
      );
    if (!shellRect) throw new Error('The shell window was not found on the desktop.');
    if (!popupRect) throw new Error('The popup window was not found on the desktop, so it left Kryvex.');
    const expected = {
      x: shellRect.x + canvas.x,
      y: shellRect.y + canvas.y,
      width: canvas.width,
      height: canvas.height,
    };
    const drift = Math.max(
      Math.abs(popupRect.x - expected.x),
      Math.abs(popupRect.y - expected.y),
      Math.abs(popupRect.width - expected.width),
      Math.abs(popupRect.height - expected.height),
    );
    if (drift > 4) {
      throw new Error(
        `Popup is not covering the canvas (drift ${drift}px): ${JSON.stringify({ popupRect, expected })}`,
      );
    }

    // Another tab must hide the popup instead of leaving it over the page.
    await shell.evaluate(
      `document.querySelector('.tab:not(.is-popup) .tab-label').click(); true`,
    );
    await sleep(500);
    const hidden = !windowRects().some(rect => rect.title.includes('Fixture sign-in'));
    if (!hidden) throw new Error('The popup stayed visible after switching tabs.');
    await shell.evaluate(`document.querySelector('.tab.is-popup .tab-label').click(); true`);
    await sleep(500);
    const shown = windowRects().some(rect => rect.title.includes('Fixture sign-in'));
    if (!shown) throw new Error('The popup did not come back when its tab was selected.');

    // Closing the popup is the page's own window.close(); the tab must follow.
    const popupTarget = (await listTargets()).find(item =>
      typeof item.url === 'string' && item.url.includes('/popup'),
    );
    if (popupTarget) {
      const popup = await connect(popupTarget.webSocketDebuggerUrl);
      await popup.evaluate('window.close(); true').catch(() => undefined);
      popup.close();
    }
    await waitFor(
      shell.evaluate,
      `document.querySelectorAll('.tab.is-popup').length === 0`,
      'popup tab removal',
    );
    const returned = await shell.evaluate(
      `document.querySelector('.tab.is-active .tab-title')?.textContent || ''`,
    );
    if (!returned.includes('Popup fixture')) {
      throw new Error(`Closing the popup did not return to the opener (active tab: ${returned}).`);
    }

    console.log('popup tabs harness: PASS');
    console.log(
      JSON.stringify({
        opener: guestTarget.url,
        tab: tab.title,
        openerMessage: message,
        canvas,
        popupRect,
        drift,
        returned,
      }),
    );
    guest.close();
    shell.close();
  } finally {
    await stop();
    server.close();
  }
})().catch(error => {
  console.error('popup tabs harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
