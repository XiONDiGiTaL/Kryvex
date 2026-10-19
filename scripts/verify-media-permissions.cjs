/* eslint-disable no-console */
const { app, BrowserWindow, ipcMain, session } = require('electron');
const http = require('node:http');
const path = require('node:path');

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.setPath('userData', path.join(require('node:os').tmpdir(), `kryvex-media-${process.pid}`));

let resolveResult;
const result = new Promise(resolve => {
  resolveResult = resolve;
});

const server = http.createServer((req, res) => {
  if (req.url === '/page') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>media check</title><script>
      navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
          window.__stream = stream;
          fetch('/result?ok=1&tracks=' + stream.getTracks().length);
        })
        .catch(error => {
          fetch('/result?ok=0&error=' + encodeURIComponent(error.name + ': ' + error.message));
        });
    </script>`);
    return;
  }
  if (req.url?.startsWith('/result')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    resolveResult(new URL(req.url, 'http://127.0.0.1').searchParams);
    return;
  }
  res.writeHead(404).end();
});

const timeout = setTimeout(() => {
  console.error('media harness: FAIL (timeout)');
  process.exitCode = 1;
  app.quit();
}, 20000);

app.whenReady().then(async () => {
  const { permissions } = require('../dist-electron/permissions.js');
  const { hardenSession } = require('../dist-electron/hardening.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  hardenSession(session.fromPartition('browser-permtest'));

  const shell = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'media-permission-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  permissions.attachWindow(shell);

  ipcMain.on('test:permission-answer', (_event, id, origin) => {
    permissions.respond(String(id), !String(origin).includes('denied.example'));
  });

  try {
    const html = `<!doctype html><webview src="${origin}/page" partition="browser-permtest"
      style="width:640px;height:420px"></webview>`;
    await shell.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const query = await result;
    if (query.get('ok') !== '1') throw new Error(query.get('error') || 'getUserMedia failed');
    if (Number(query.get('tracks')) < 2) throw new Error('Expected audio and video tracks');

    if (!permissions.check('media', origin, 'audio')) throw new Error('Audio grant was not recorded');
    if (!permissions.check('media', origin, 'video')) throw new Error('Video grant was not recorded');
    if (permissions.check('media', 'https://untrusted.example', 'audio')) {
      throw new Error('Untrusted origin inherited a grant');
    }
    if (permissions.check('geolocation', origin)) throw new Error('Geolocation was granted');

    const denied = await new Promise(resolve => {
      permissions.request(
        { getType: () => 'webview', getURL: () => 'https://denied.example/watch' },
        'media',
        resolve,
        { securityOrigin: 'https://denied.example', mediaTypes: ['video'] },
        '',
      );
    });
    if (denied !== false) throw new Error('Blocked media request was granted');
    if (permissions.check('media', 'https://denied.example', 'video')) {
      throw new Error('Blocked origin received a grant');
    }

    console.log('media harness: PASS');
    console.log(
      JSON.stringify({
        origin,
        tracks: Number(query.get('tracks')),
        audio: permissions.check('media', origin, 'audio'),
        video: permissions.check('media', origin, 'video'),
        untrusted: permissions.check('media', 'https://untrusted.example', 'audio'),
        blocked: denied,
      }),
    );
  } catch (error) {
    console.error('media harness: FAIL', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    shell.destroy();
    server.close();
    app.quit();
  }
});
