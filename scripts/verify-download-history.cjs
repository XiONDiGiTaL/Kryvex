/* eslint-disable no-console */
const { app, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-download-check-'));
const downloadDir = path.join(tempRoot, 'Downloads');
const userData = path.join(tempRoot, 'userData');
fs.mkdirSync(downloadDir, { recursive: true });
app.setPath('downloads', downloadDir);
app.setPath('userData', userData);

const payload = Buffer.from('Kryvex persisted download verification\n'.repeat(2048), 'utf8');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await predicate();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

app.whenReady().then(async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': payload.length,
      'Content-Disposition': 'attachment; filename="kryvex-download-check.bin"',
    });
    response.end(payload);
  });

  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Download server did not start.');

    const { downloads } = require('../dist-electron/downloads.js');
    downloads.init();
    downloads.trackSession(session.defaultSession);
    session.defaultSession.downloadURL(`http://127.0.0.1:${address.port}/kryvex-download-check.bin`);

    const record = await waitFor(
      () => downloads.list().find(item => item.state === 'completed'),
      'completed download',
    );
    if (!fs.existsSync(record.savePath)) throw new Error('Downloaded file is missing.');
    if (fs.statSync(record.savePath).size !== payload.length) {
      throw new Error('Downloaded file size does not match the source.');
    }

    const stateFile = path.join(userData, 'kryvex-downloads.json');
    if (!fs.existsSync(stateFile)) throw new Error('Download history file was not written.');
    const stored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!Array.isArray(stored) || stored[0]?.id !== record.id) {
      throw new Error('Completed download was not persisted.');
    }

    // Reload the manager the same way a fresh Electron process would.
    delete require.cache[require.resolve('../dist-electron/downloads.js')];
    const fresh = require('../dist-electron/downloads.js').downloads;
    fresh.init();
    const restored = fresh.list();
    if (restored.length !== 1 || restored[0]?.filename !== 'kryvex-download-check.bin') {
      throw new Error(`Persisted download did not reload: ${JSON.stringify(restored)}`);
    }
    if (restored[0]?.state !== 'completed') {
      throw new Error(`Restored download has state ${restored[0]?.state}`);
    }

    const removed = fresh.remove(restored[0].id, true);
    if (!removed.ok) throw new Error(`Could not remove restored download: ${removed.message}`);
    if (fs.existsSync(record.savePath)) throw new Error('Delete file left the download behind.');

    delete require.cache[require.resolve('../dist-electron/downloads.js')];
    const empty = require('../dist-electron/downloads.js').downloads;
    empty.init();
    if (empty.list().length !== 0) throw new Error('Removed download returned after reload.');

    console.log('download history harness: PASS');
    console.log(
      JSON.stringify({
        filename: record.filename,
        bytes: payload.length,
        restored: true,
        deleted: true,
        stateFile: path.basename(stateFile),
      }),
    );
  } catch (error) {
    console.error('download history harness: FAIL', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  } finally {
    server.close();
    // Chromium still holds files in its profile, so removal happens after the
    // app has fully exited. A failure here must not mask the test result.
    app.once('quit', () => {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* the OS will clear its temp directory later */
      }
    });
    app.quit();
  }
});
