/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.KRYVEX_CDP_PORT || 9333);
const PAGE = 'http://127.0.0.1:8765/scripts/media-test.html';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const pages = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(response => response.json());
  const page = pages.find(item => item.type === 'page' && item.title === 'Kryvex');
  if (!page) throw new Error('Kryvex page was not found on the DevTools port');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;

  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('DevTools socket failed'));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return result.result.value;
  };

  const waitFor = async (expression, label, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await delay(150);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');

    const loaded = await evaluate(`(async () => {
      const webview = document.querySelector('webview');
      if (!webview) return false;
      try {
        await webview.loadURL(${JSON.stringify(PAGE)});
      } catch (error) {
        if (!/ERR_ABORTED/.test(String(error))) throw error;
      }
      return true;
    })()`);
    if (!loaded) {
      await evaluate(
        `window.location.hash = '#/browser?url=${encodeURIComponent(PAGE)}&panel=downloads'; true`,
      );
    }

    const prompt = await waitFor(
      `(() => {
        const body = document.querySelector('.permission-request');
        if (!body) return null;
        return {
          text: body.innerText,
          title: document.querySelector('.modal h2')?.textContent || '',
          origin: body.querySelector('.permission-origin')?.textContent || '',
        };
      })()`,
      'permission prompt',
    );

    if (!prompt.text.includes('Microphone') && !prompt.text.includes('Cámara')) {
      throw new Error(`Prompt did not name a device: ${prompt.text}`);
    }
    if (!prompt.origin.includes('127.0.0.1:8765')) {
      throw new Error(`Prompt used the wrong origin: ${prompt.origin}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const target = path.join(process.cwd(), 'screenshots', 'media-permission.png');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(shot.data, 'base64'));

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.modal-actions button')]
        .find(item => item.textContent.includes('Allow'));
      button?.click();
      return Boolean(button);
    })()`);

    await waitFor(
      `!document.querySelector('.permission-request')`,
      'prompt dismissal',
    );

    const guestTitle = await waitFor(
      `(async () => {
        const guest = document.querySelector('webview');
        if (!guest) return '';
        try {
          const title = await guest.executeJavaScript('document.title');
          return /granted|blocked/i.test(title) ? title : '';
        } catch { return ''; }
      })()`,
      'guest page result',
    );

    console.log('permission UI harness: PASS');
    console.log(
      JSON.stringify({
        prompt: prompt.title,
        origin: prompt.origin,
        guestTitle,
        screenshot: 'screenshots/media-permission.png',
      }),
    );
  } finally {
    socket.close();
  }
}

main().catch(error => {
  console.error('permission UI harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
