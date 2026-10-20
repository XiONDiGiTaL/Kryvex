/* eslint-disable no-console */
const { app, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-download-check-'));
const downloadDir = path.join(tempRoot, 'Downloads');
const customDownloadDir = path.join(tempRoot, 'Custom Downloads');
const movedDownloadDir = path.join(tempRoot, 'Moved Downloads');
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

    const storage = require('../dist-electron/storage.js');
    storage.initStorage();
    if (storage.downloadLocation().path !== downloadDir) {
      throw new Error(`Unexpected default download location: ${storage.downloadLocation().path}`);
    }
    storage.setDownloadLocation(customDownloadDir);
    const location = storage.downloadLocation();
    if (location.path !== customDownloadDir) {
      throw new Error(`Custom download location was not applied: ${location.path}`);
    }
    if (location.torrentPath !== path.join(customDownloadDir, 'Kryvex Torrents')) {
      throw new Error(`Torrent root did not follow the download location: ${location.torrentPath}`);
    }

    const { downloads } = require('../dist-electron/downloads.js');
    downloads.init();
    downloads.trackSession(session.defaultSession);
    session.defaultSession.downloadURL(`http://127.0.0.1:${address.port}/kryvex-download-check.bin`);

    const record = await waitFor(
      () => downloads.list().find(item => item.state === 'completed'),
      'completed download',
    );
    if (!fs.existsSync(record.savePath)) throw new Error('Downloaded file is missing.');
    if (!path.resolve(record.savePath).startsWith(`${path.resolve(customDownloadDir)}${path.sep}`)) {
      throw new Error(`Download did not use the chosen folder: ${record.savePath}`);
    }
    if (fs.statSync(record.savePath).size !== payload.length) {
      throw new Error('Downloaded file size does not match the source.');
    }

    const stateFile = path.join(userData, 'kryvex-downloads.json');
    if (!fs.existsSync(stateFile)) throw new Error('Download history file was not written.');
    const stored = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!Array.isArray(stored) || stored[0]?.id !== record.id) {
      throw new Error('Completed download was not persisted.');
    }

    // Move the configured location again before the next launch. The old
    // download must still restore and remain safe to delete from its retained
    // managed root.
    storage.setDownloadLocation(movedDownloadDir);
    if (storage.downloadLocation().path !== movedDownloadDir) {
      throw new Error('Second download location was not applied.');
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

    const reset = storage.resetDownloadLocation();
    if (!reset.ok || storage.downloadLocation().path !== downloadDir) {
      throw new Error(`Download location did not reset: ${reset.message}`);
    }
    if (storage.torrentRoot() !== path.join(downloadDir, 'Kryvex Torrents')) {
      throw new Error('Torrent root did not reset with the download location.');
    }

    console.log('download history harness: PASS');
    console.log(
      JSON.stringify({
        filename: record.filename,
        bytes: payload.length,
        restored: true,
        deleted: true,
        location: customDownloadDir,
        movedLocation: movedDownloadDir,
        resetToDownloads: true,
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
