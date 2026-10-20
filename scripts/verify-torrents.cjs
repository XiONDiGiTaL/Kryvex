/* eslint-disable no-console */
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-torrent-check-'));
const downloads = path.join(tempRoot, 'Downloads');
const movedDownloads = path.join(tempRoot, 'Moved Downloads');
const userData = path.join(tempRoot, 'UserData');
const queueFile = path.join(userData, 'kryvex-torrents.json');
const metadataDir = path.join(userData, 'kryvex-torrent-metadata');
fs.mkdirSync(downloads, { recursive: true });

// The torrent manager only needs Electron's path API. Running this harness in
// Node avoids Electron's native WebTorrent teardown fault while still loading
// the exact compiled main-process module.
const electron = {
  app: {
    getPath(name) {
      if (name === 'downloads') return downloads;
      if (name === 'userData') return userData;
      throw new Error(`Unsupported path: ${name}`);
    },
  },
  dialog: {},
  shell: { openPath: async () => '' },
};
const load = Module._load;
Module._load = function loadWithElectron(request, parent, isMain) {
  if (request === 'electron') return electron;
  return load.call(this, request, parent, isMain);
};

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

async function main() {
  const { torrents } = require('../dist-electron/torrents.js');
  const storage = require('../dist-electron/storage.js');
  torrents.init();
  const WebTorrent = (await import('webtorrent')).default;
  const seeder = new WebTorrent({ dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false });
  let restored = null;

  try {
    const seedFile = (name, payload) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Seeder did not create ${name}`)), 10000);
        seeder.seed(payload, { name, announce: [] }, torrent => {
          clearTimeout(timer);
          resolve(torrent);
        });
      });

    const seeded = await seedFile(
      'kryvex-check.txt',
      Buffer.from('Kryvex torrent verification\n', 'utf8'),
    );
    const magnetSeed = await seedFile(
      'kryvex-magnet.txt',
      Buffer.from('Kryvex restored magnet verification\n', 'utf8'),
    );

    const torrentFile = path.join(tempRoot, 'kryvex-check.torrent');
    fs.writeFileSync(torrentFile, Buffer.from(seeded.torrentFile));

    const added = await torrents.addTorrentFile(torrentFile);
    if (!added.ok) throw new Error(`addTorrentFile failed: ${added.message}`);
    if (!added.record || added.record.source !== 'file') throw new Error('Missing file torrent record');
    const fileId = added.record.id;

    const ready = await waitFor(
      () => torrents.list().find(item => item.id === fileId && item.files.length > 0),
      'torrent metadata',
    );
    if (ready.files[0]?.name !== 'kryvex-check.txt') {
      throw new Error(`Unexpected file list: ${JSON.stringify(ready.files)}`);
    }
    if (!fs.existsSync(ready.savePath)) throw new Error('Torrent folder was not created');
    if (!path.resolve(ready.savePath).startsWith(`${path.resolve(torrents.root())}${path.sep}`)) {
      throw new Error(`Torrent did not start in the managed root: ${ready.savePath}`);
    }

    // New torrents must follow a changed download location while the file
    // added above keeps its original path.
    storage.setDownloadLocation(movedDownloads);
    const movedRoot = path.join(movedDownloads, 'Kryvex Torrents');
    if (torrents.root() !== movedRoot) {
      throw new Error(`Torrent root did not follow the location: ${torrents.root()}`);
    }

    const paused = torrents.pause(ready.id);
    if (!paused.ok || paused.records[0]?.state !== 'paused') throw new Error('Pause failed');
    const resumed = await torrents.resume(ready.id);
    if (!resumed.ok) throw new Error(`Resume failed: ${resumed.message}`);

    const magnetic = await torrents.addMagnet(magnetSeed.magnetURI);
    if (!magnetic.ok) throw new Error(`addMagnet failed: ${magnetic.message}`);
    if (!magnetic.record?.infoHash) throw new Error('Magnet record has no info hash');
    if (!magnetic.record.magnetURI.startsWith('magnet:?')) throw new Error('Magnet URI was not retained');
    if (!path.resolve(magnetic.record.savePath).startsWith(`${path.resolve(movedRoot)}${path.sep}`)) {
      throw new Error(`Magnet did not use the changed root: ${magnetic.record.savePath}`);
    }
    const magnetId = magnetic.record.id;

    // Two real WebTorrent peers on loopback: the harness seeder and the app's
    // manager. This checks metadata, transfer progress and live peer counts.
    const entry = torrents.entries.get(magnetId);
    if (!entry) throw new Error('Manager entry is missing');
    entry.torrent.addPeer(`127.0.0.1:${seeder.torrentPort}`);
    const downloaded = await waitFor(
      () => torrents.list().find(item => item.id === magnetId && item.progress >= 1),
      'loopback download',
      30000,
    );
    if (downloaded.downloaded <= 0) throw new Error('Torrent downloaded zero bytes');
    if (downloaded.seeders < 1) throw new Error(`Expected a seeder, got ${downloaded.seeders}`);

    await torrents.shutdown();
    if (!fs.existsSync(queueFile)) throw new Error('Torrent queue file was not written');
    if (!fs.existsSync(path.join(metadataDir, `${fileId}.torrent`))) {
      throw new Error('Torrent metadata was not saved');
    }

    // A fresh manager is the same state a relaunched app sees. It must list
    // both rows as paused without constructing a WebTorrent client.
    delete require.cache[require.resolve('../dist-electron/torrents.js')];
    const fresh = require('../dist-electron/torrents.js').torrents;
    fresh.init();
    restored = fresh;
    if (fresh.client !== null) throw new Error('Restore started a WebTorrent client');
    if (fresh.root() !== movedRoot) throw new Error('Fresh manager lost the changed root');
    const rows = fresh.list();
    if (rows.length !== 2) throw new Error(`Expected 2 restored rows, got ${rows.length}`);
    for (const row of rows) {
      if (row.state !== 'paused') throw new Error(`Restored row is ${row.state}, not paused`);
      if (row.downloadSpeed !== 0 || row.uploadSpeed !== 0) {
        throw new Error('Restored row kept a live transfer speed');
      }
      if (row.peers !== 0 || row.seeders !== 0 || row.leechers !== 0) {
        throw new Error('Restored row kept live peer counters');
      }
    }

    // Resume hydrates the saved .torrent, verifies the existing pieces and
    // returns the entry to the live queue.
    const resumedFile = await fresh.resume(fileId);
    if (!resumedFile.ok) throw new Error(`Restored file resume failed: ${resumedFile.message}`);
    if (!fresh.client) throw new Error('Resume did not create the torrent client');
    const restoredFileEntry = fresh.entries.get(fileId);
    if (!restoredFileEntry?.torrent) throw new Error('Restored file has no live torrent');
    await waitFor(() => restoredFileEntry.torrent.infoHash, 'restored file info hash');
    restoredFileEntry.torrent.addPeer(`127.0.0.1:${seeder.torrentPort}`);
    const hydratedFile = await waitFor(
      () => fresh.list().find(item => item.id === fileId && item.progress >= 1),
      'restored file hydration',
      30000,
    );
    if (hydratedFile.downloaded <= 0) throw new Error('Restored file did not verify its data');

    // The magnet row hydrates from its saved URI; the loopback peer supplies
    // metadata again because this harness does not use a public tracker.
    const resumedMagnet = await fresh.resume(magnetId);
    if (!resumedMagnet.ok) throw new Error(`Restored magnet resume failed: ${resumedMagnet.message}`);
    const restoredMagnet = fresh.entries.get(magnetId);
    if (!restoredMagnet?.torrent) throw new Error('Restored magnet has no live torrent');
    await waitFor(() => restoredMagnet.torrent.infoHash, 'restored magnet info hash');
    restoredMagnet.torrent.addPeer(`127.0.0.1:${seeder.torrentPort}`);
    const hydratedMagnet = await waitFor(
      () => fresh.list().find(item => item.id === magnetId && item.progress >= 1),
      'restored magnet hydration',
      30000,
    );
    if (hydratedMagnet.downloaded <= 0) throw new Error('Restored magnet downloaded zero bytes');

    const removedFile = await fresh.remove(fileId, true);
    if (!removedFile.ok) throw new Error(`remove failed: ${removedFile.message}`);
    if (fs.existsSync(ready.savePath)) throw new Error('Delete data left the torrent folder behind');
    if (fs.existsSync(path.join(metadataDir, `${fileId}.torrent`))) {
      throw new Error('Remove left the saved torrent metadata behind');
    }
    if (fresh.list().some(item => item.id === fileId)) throw new Error('Removed torrent still listed');

    const removedMagnet = await fresh.remove(magnetId, true);
    if (!removedMagnet.ok) throw new Error(`magnet remove failed: ${removedMagnet.message}`);
    if (fresh.list().length !== 0) throw new Error('Removed magnet still listed');

    const reset = storage.resetDownloadLocation();
    if (!reset.ok || storage.downloadLocation().path !== downloads) {
      throw new Error(`Torrent location did not reset: ${reset.message}`);
    }

    console.log('torrent harness: PASS');
    console.log(
      JSON.stringify({
        infoHash: downloaded.infoHash,
        files: downloaded.files.length,
        bytes: downloaded.downloaded,
        progress: downloaded.progress,
        seeders: downloaded.seeders,
        leechers: downloaded.leechers,
        protocols: downloaded.protocols,
        restoredRows: rows.length,
        restoredPaused: true,
        hydratedFile: hydratedFile.state,
        hydratedMagnet: hydratedMagnet.state,
        movedRoot,
        folderDeleted: !fs.existsSync(downloaded.savePath),
      }),
    );
  } catch (error) {
    console.error('torrent harness: FAIL', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (restored) await restored.shutdown();
    await torrents.shutdown();
    await new Promise(resolve => seeder.destroy(resolve));
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* the OS will clear its temp directory later */
    }
  }
}

main().catch(error => {
  console.error('torrent harness: FAIL', error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
