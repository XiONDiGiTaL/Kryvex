/**
 * Pure torrent rules shared by the main process and unit tests.
 *
 * Kryvex is a BitTorrent client, not a directory. These helpers validate the
 * identifier the user supplied and keep every derived filesystem name inside
 * the fixed torrent download folder.
 */

import type { TorrentFileRecord, TorrentRecord, TorrentSource } from './types';

export const MAX_MAGNET_LENGTH = 16 * 1024;
export const MAX_TORRENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ACTIVE_TORRENTS = 25;
export const MAX_TRACKERS = 24;

export interface MagnetDetails {
  infoHash: string;
  /** Raw `dn` display name, if the magnet supplied one. */
  name: string;
  trackers: string[];
}

export interface TorrentPeerCounts {
  peers: number;
  seeders: number;
  leechers: number;
}

function tracker(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'udp:', 'wss:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Accepts only a magnet URI with a BitTorrent info hash. */
export function parseMagnet(value: unknown): MagnetDetails | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw.length < 20 || raw.length > MAX_MAGNET_LENGTH || !/^magnet:\?/i.test(raw)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'magnet:') return null;

  const xt = url.searchParams
    .getAll('xt')
    .map(item => item.trim())
    .find(item => /^urn:btih:/i.test(item));
  if (!xt) return null;
  const infoHash = xt.slice('urn:btih:'.length).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(infoHash) && !/^[a-z2-7]{32}$/.test(infoHash)) {
    return null;
  }

  const trackers: string[] = [];
  for (const item of url.searchParams.getAll('tr')) {
    const next = tracker(item);
    if (next && !trackers.includes(next)) trackers.push(next);
    if (trackers.length >= MAX_TRACKERS) break;
  }

  return {
    infoHash,
    name: String(url.searchParams.get('dn') ?? '').slice(0, 180),
    trackers,
  };
}

/** A navigation or popup target that should be handed to the torrent queue. */
export function isMagnetLink(value: unknown): value is string {
  return typeof value === 'string' && /^magnet:\?/i.test(value.trim()) && parseMagnet(value) !== null;
}

/**
 * Filesystem-safe display name. Torrent metadata is remote data, so it is
 * reduced to a single basename with no traversal, controls or Windows device
 * names. Empty names become "torrent".
 */
export function safeTorrentName(value: unknown): string {
  if (typeof value !== 'string') return 'torrent';
  let name = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/g, '')
    .trim();
  if (!name || name === '.' || name === '..') return 'torrent';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) name = `_${name}`;
  return name.slice(0, 80) || 'torrent';
}

/** A stable per-torrent folder keeps root-level files from colliding. */
export function torrentFolderName(name: string, infoHash: string): string {
  const stem = safeTorrentName(name);
  const suffix = infoHash.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'torrent';
  return `${stem}-${suffix}`;
}

/**
 * WebTorrent exposes connected wires and marks complete peers. Seeders are
 * complete peers; leechers are the remaining connected peers.
 */
export function peerCounts(wires: ReadonlyArray<{ isSeeder?: boolean }>): TorrentPeerCounts {
  const peers = wires.length;
  const seeders = wires.filter(wire => Boolean(wire.isSeeder)).length;
  return { peers, seeders, leechers: Math.max(0, peers - seeders) };
}

/** The protocol badges shown in the downloads hub. */
export function torrentProtocols(capabilities: {
  tcp?: boolean;
  utp?: boolean;
  dht?: boolean;
  pex?: boolean;
  lsd?: boolean;
  webSeeds?: boolean;
}): string[] {
  const list: string[] = [];
  if (capabilities.tcp !== false) list.push('TCP');
  if (capabilities.utp) list.push('uTP');
  if (capabilities.dht) list.push('DHT');
  if (capabilities.pex) list.push('PEX');
  if (capabilities.lsd) list.push('LSD');
  if (capabilities.webSeeds) list.push('Web seeds');
  return list;
}

const TORRENT_ID = /^tr-[a-f0-9-]{16,64}$/i;
const INFO_HASH = /^(?:[a-f0-9]{40}|[a-z2-7]{32})$/;
const PROTOCOLS = new Set(['TCP', 'uTP', 'DHT', 'PEX', 'LSD', 'Web seeds']);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function amount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function fraction(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function stamp(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function restoreFiles(raw: unknown): TorrentFileRecord[] {
  if (!Array.isArray(raw)) return [];
  const files: TorrentFileRecord[] = [];
  for (const item of raw) {
    if (!object(item)) continue;
    const path = text(item.path, 1024);
    if (!path) continue;
    const name = text(item.name, 200) || path.split(/[\\/]/).pop() || 'file';
    const length = amount(item.length);
    files.push({
      name,
      path,
      length,
      downloaded: length > 0 ? Math.min(amount(item.downloaded), length) : amount(item.downloaded),
      progress: fraction(item.progress),
    });
    if (files.length >= 250) break;
  }
  return files;
}

function restoreTrackers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const trackers: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const next = tracker(item.trim());
    if (next && !trackers.includes(next)) trackers.push(next);
    if (trackers.length >= MAX_TRACKERS) break;
  }
  return trackers;
}

function restoreProtocols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && PROTOCOLS.has(item));
}

/**
 * Rebuild the saved queue for display after a restart. Every entry is forced
 * to `paused`, with live counters cleared, so loading the list cannot start a
 * transfer. The manager hydrates an entry only when the user presses Resume.
 * Records come from a file the user can edit, so malformed rows, duplicate
 * ids, duplicate info hashes and invalid magnets are dropped.
 */
export function restoreTorrentQueue(raw: unknown): TorrentRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: TorrentRecord[] = [];
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  for (const item of raw) {
    if (!object(item)) continue;
    const id = String(item.id ?? '');
    if (!TORRENT_ID.test(id) || seenIds.has(id)) continue;

    const source: TorrentSource | null =
      item.source === 'magnet' ? 'magnet' : item.source === 'file' ? 'file' : null;
    if (!source) continue;

    const savePath = text(item.savePath, 4096);
    if (!savePath) continue;

    const rawMagnet = text(item.magnetURI, MAX_MAGNET_LENGTH);
    const magnet = rawMagnet && parseMagnet(rawMagnet) ? rawMagnet : '';
    // A magnet-only row without a usable URI could never be resumed.
    if (source === 'magnet' && !magnet) continue;

    const parsed = magnet ? parseMagnet(magnet) : null;
    let infoHash = text(item.infoHash, 64).toLowerCase();
    if (parsed) infoHash = parsed.infoHash;
    if (!INFO_HASH.test(infoHash)) infoHash = '';
    if (infoHash && seenHashes.has(infoHash)) continue;

    const length = amount(item.length);
    const name = safeTorrentName(item.name);
    const now = Date.now();
    const files = restoreFiles(item.files);
    const trackers = restoreTrackers(item.trackers);
    const protocols = restoreProtocols(item.protocols);

    records.push({
      id,
      name,
      infoHash,
      magnetURI: magnet,
      source,
      savePath,
      state: 'paused',
      length,
      downloaded: length > 0 ? Math.min(amount(item.downloaded), length) : amount(item.downloaded),
      uploaded: amount(item.uploaded),
      downloadSpeed: 0,
      uploadSpeed: 0,
      ratio: amount(item.ratio),
      progress: fraction(item.progress),
      timeRemaining: 0,
      peers: 0,
      seeders: 0,
      leechers: 0,
      protocols,
      trackers,
      files,
      createdAt: stamp(item.createdAt, now),
      updatedAt: stamp(item.updatedAt, now),
    });
    seenIds.add(id);
    if (infoHash) seenHashes.add(infoHash);
    if (records.length >= MAX_ACTIVE_TORRENTS) break;
  }
  return records;
}
