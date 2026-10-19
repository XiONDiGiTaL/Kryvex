import { describe, expect, it } from 'vitest';
import {
  isMagnetLink,
  MAX_ACTIVE_TORRENTS,
  parseMagnet,
  peerCounts,
  restoreTorrentQueue,
  safeTorrentName,
  torrentFolderName,
  torrentProtocols,
} from '../electron/torrent-rules';

const HASH = '0123456789abcdef0123456789abcdef01234567';

describe('parseMagnet', () => {
  it('accepts a BitTorrent magnet with a display name and trackers', () => {
    const result = parseMagnet(
      `magnet:?xt=urn:btih:${HASH}&dn=Ubuntu%20ISO&tr=udp%3A%2F%2Ftracker.example%3A80%2Fannounce&tr=https%3A%2F%2Ftracker.example%2Fannounce`,
    );
    expect(result).toMatchObject({
      infoHash: HASH,
      name: 'Ubuntu ISO',
      trackers: ['udp://tracker.example:80/announce', 'https://tracker.example/announce'],
    });
  });

  it('accepts a base32 info hash and rejects missing or malformed hashes', () => {
    expect(parseMagnet('magnet:?xt=urn:btih:abcdefghijklmnopqrstuvwxyz234567')).not.toBeNull();
    expect(parseMagnet('magnet:?dn=NoHash')).toBeNull();
    expect(parseMagnet('magnet:?xt=urn:btih:notahash')).toBeNull();
    expect(parseMagnet(`magnet:?xt=urn:btih:${HASH}&tr=javascript%3Aalert(1)`)).toMatchObject({
      trackers: [],
    });
  });

  it('rejects non-magnet strings and oversized input', () => {
    expect(parseMagnet('https://example.com/file.torrent')).toBeNull();
    expect(parseMagnet(undefined)).toBeNull();
    expect(parseMagnet(`magnet:?xt=urn:btih:${HASH}&dn=${'x'.repeat(17_000)}`)).toBeNull();
  });
});

describe('isMagnetLink', () => {
  it('only treats validated magnet URIs as torrent navigation', () => {
    expect(isMagnetLink(`magnet:?xt=urn:btih:${HASH}`)).toBe(true);
    expect(isMagnetLink('magnet:?dn=missing-hash')).toBe(false);
    expect(isMagnetLink('https://example.com')).toBe(false);
  });
});

describe('safeTorrentName', () => {
  it('reduces remote names to one safe basename', () => {
    expect(safeTorrentName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeTorrentName('My:Torrent?.mkv')).toBe('My_Torrent_.mkv');
    expect(safeTorrentName('CON')).toBe('_CON');
    expect(safeTorrentName('')).toBe('torrent');
  });

  it('prefixes a torrent folder with a short info-hash suffix', () => {
    expect(torrentFolderName('Ubuntu ISO', HASH)).toBe('Ubuntu ISO-01234567');
    expect(torrentFolderName('..', HASH)).toBe('torrent-01234567');
  });
});

describe('peerCounts', () => {
  it('separates complete seeders from connected leechers', () => {
    expect(peerCounts([{ isSeeder: true }, { isSeeder: true }, {}, { isSeeder: false }])).toEqual({
      peers: 4,
      seeders: 2,
      leechers: 2,
    });
  });

  it('reports no peers for an empty wire list', () => {
    expect(peerCounts([])).toEqual({ peers: 0, seeders: 0, leechers: 0 });
  });
});

describe('torrentProtocols', () => {
  it('lists only the transport and discovery layers that are active', () => {
    expect(
      torrentProtocols({ tcp: true, utp: true, dht: true, pex: true, lsd: false, webSeeds: true }),
    ).toEqual(['TCP', 'uTP', 'DHT', 'PEX', 'Web seeds']);
    expect(torrentProtocols({ tcp: true, dht: false })).toEqual(['TCP']);
  });
});

describe('restoreTorrentQueue', () => {
  const id = 'tr-11111111-2222-3333-4444-555555555555';
  const magnet = `magnet:?xt=urn:btih:${HASH}&dn=Ubuntu%20ISO&tr=udp%3A%2F%2Ftracker.example%3A80%2Fannounce`;

  it('forces saved rows to paused with no live counters or speeds', () => {
    const record = restoreTorrentQueue([
      {
        id,
        name: 'Ubuntu ISO',
        infoHash: HASH,
        magnetURI: magnet,
        source: 'magnet',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\Ubuntu ISO-01234567',
        state: 'downloading',
        length: 1000,
        downloaded: 600,
        uploaded: 100,
        downloadSpeed: 2048,
        uploadSpeed: 128,
        ratio: 0.5,
        progress: 0.6,
        timeRemaining: 30000,
        peers: 9,
        seeders: 4,
        leechers: 5,
        protocols: ['TCP', 'DHT', 'Unknown'],
        trackers: ['udp://tracker.example:80/announce', 'javascript:alert(1)'],
        files: [
          { name: 'ubuntu.iso', path: 'ubuntu.iso', length: 1000, downloaded: 600, progress: 0.6 },
        ],
        createdAt: 100,
        updatedAt: 200,
      },
    ])[0]!;

    expect(record).toMatchObject({
      id,
      name: 'Ubuntu ISO',
      source: 'magnet',
      state: 'paused',
      length: 1000,
      downloaded: 600,
      uploaded: 100,
      progress: 0.6,
      ratio: 0.5,
      downloadSpeed: 0,
      uploadSpeed: 0,
      timeRemaining: 0,
      peers: 0,
      seeders: 0,
      leechers: 0,
      protocols: ['TCP', 'DHT'],
      trackers: ['udp://tracker.example:80/announce'],
      createdAt: 100,
      updatedAt: 200,
    });
    expect(record.files).toEqual([
      { name: 'ubuntu.iso', path: 'ubuntu.iso', length: 1000, downloaded: 600, progress: 0.6 },
    ]);
    expect(record.error).toBeUndefined();
  });

  it('drops malformed rows and duplicate hashes but keeps a file row', () => {
    const fileId = 'tr-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const records = restoreTorrentQueue([
      { id: 'bad', source: 'magnet', magnetURI: magnet, savePath: 'C:\\x' },
      {
        id,
        name: 'Ubuntu ISO',
        infoHash: HASH,
        magnetURI: magnet,
        source: 'magnet',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\a',
      },
      {
        id: 'tr-99999999-9999-9999-9999-999999999999',
        name: 'Duplicate',
        infoHash: HASH,
        magnetURI: magnet,
        source: 'magnet',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\b',
      },
      {
        id: 'tr-ffffffff-ffff-ffff-ffff-ffffffffffff',
        name: 'No magnet',
        source: 'magnet',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\c',
      },
      {
        id: fileId,
        name: 'Archive',
        infoHash: '',
        magnetURI: '',
        source: 'file',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\d',
        state: 'seeding',
        length: 50,
        downloaded: 50,
        progress: 1,
      },
    ]);

    expect(records.map(record => record.id)).toEqual([id, fileId]);
    expect(records[1]?.state).toBe('paused');
    expect(records[1]?.magnetURI).toBe('');
    expect(records[1]?.progress).toBe(1);
  });

  it('clamps counters and caps the restored queue', () => {
    const record = restoreTorrentQueue([
      {
        id,
        name: 'Clamp',
        source: 'file',
        savePath: 'C:\\Downloads\\Kryvex Torrents\\clamp',
        length: 100,
        downloaded: 900,
        progress: 4,
        ratio: -2,
      },
    ])[0]!;
    expect(record.downloaded).toBe(100);
    expect(record.progress).toBe(1);
    expect(record.ratio).toBe(0);

    const many = Array.from({ length: MAX_ACTIVE_TORRENTS + 5 }, (_, index) => ({
      id: `tr-${String(index).padStart(8, '0')}-0000-0000-0000-000000000000`,
      name: `Torrent ${index}`,
      source: 'file',
      savePath: `C:\\Downloads\\Kryvex Torrents\\${index}`,
    }));
    expect(restoreTorrentQueue(many)).toHaveLength(MAX_ACTIVE_TORRENTS);
  });
});
