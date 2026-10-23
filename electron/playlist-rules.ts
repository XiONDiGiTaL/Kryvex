import type { PlaylistImportTrack } from './types';

/**
 * Rules for turning a public playlist page into queue rows. This module is pure:
 * it takes the HTML or JSON the main process fetched and returns data, so the
 * parsers can be tested without a network or an Electron window.
 *
 * Spotify is read from its public embed page. That page exposes the same
 * 30-second preview URL the embed itself plays, which is why this importer only
 * claims previews. YouTube is read from the playlist page's initial data and its
 * continuation responses; playback happens in the embed, never by downloading
 * media.
 */

export const MAX_PLAYLIST_TRACKS = 500;
const MAX_PAGES = 8;

export type PlaylistTarget =
  | {
      provider: 'spotify';
      kind: 'playlist' | 'album' | 'track';
      id: string;
      canonicalUrl: string;
    }
  | {
      provider: 'youtube';
      kind: 'playlist';
      id: string;
      canonicalUrl: string;
    }
  | {
      provider: 'youtube';
      kind: 'video';
      id: string;
      canonicalUrl: string;
    };

export class PlaylistError extends Error {
  constructor(public readonly code: 'not-found' | 'unavailable' | 'offline' | 'empty' | 'too-large') {
    super(code);
  }
}

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function spotifyId(value: string): boolean {
  return /^[A-Za-z0-9]{10,64}$/.test(value);
}

function youtubeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,100}$/.test(value);
}

function youtubeVideoId(value: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(value);
}

/**
 * Recognises the public page shapes users actually paste. A watch URL that
 * carries a `list` parameter stays a video: importing the whole list when
 * someone pasted one track would be surprising. `/playlist` is explicit.
 */
export function classifyPlaylistUrl(input: string): PlaylistTarget | null {
  const raw = input.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();

  if (hostMatches(host, ['open.spotify.com', 'play.spotify.com'])) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    // Spotify inserts a locale such as `intl-de` before the entity type.
    if (parts[0]?.startsWith('intl-')) parts.shift();
    const [kind, id] = parts;
    if (!id || !spotifyId(id)) return null;
    if (kind !== 'playlist' && kind !== 'album' && kind !== 'track') return null;
    return {
      provider: 'spotify',
      kind,
      id,
      canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
    };
  }

  if (hostMatches(host, ['youtube.com', 'youtu.be'])) {
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
      return youtubeVideoId(id)
        ? {
            provider: 'youtube',
            kind: 'video',
            id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          }
        : null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'playlist') {
      const id = parsed.searchParams.get('list') ?? '';
      return youtubeId(id)
        ? {
            provider: 'youtube',
            kind: 'playlist',
            id,
            canonicalUrl: `https://www.youtube.com/playlist?list=${id}`,
          }
        : null;
    }
    if (parts[0] === 'watch') {
      const id = parsed.searchParams.get('v') ?? '';
      return youtubeVideoId(id)
        ? {
            provider: 'youtube',
            kind: 'video',
            id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          }
        : null;
    }
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
      const id = parts[1] ?? '';
      return youtubeVideoId(id)
        ? {
            provider: 'youtube',
            kind: 'video',
            id,
            canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
          }
        : null;
    }
  }

  return null;
}

export function isSpotifyEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return hostMatches(url.hostname.toLowerCase(), ['open.spotify.com']) &&
      url.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

export function isYouTubeEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return hostMatches(url.hostname.toLowerCase(), ['youtube.com']) &&
      url.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function child(value: unknown, ...keys: Array<string | number>): unknown {
  let current = value;
  for (const key of keys) {
    current =
      typeof key === 'number'
        ? Array.isArray(current)
          ? current[key]
          : undefined
        : record(current)?.[key];
  }
  return current;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface SpotifyEmbedParse {
  title: string;
  tracks: PlaylistImportTrack[];
  skipped: number;
}

function spotifyTrack(item: unknown, fallbackId = ''): PlaylistImportTrack | null {
  const track = record(item);
  if (!track) return null;
  const id = text(track.id) || text(track.uri).split(':').pop() || fallbackId;
  if (!spotifyId(id)) return null;
  const preview = text(child(track, 'audioPreview', 'url'));
  if (!preview || !/^https:\/\/p\.scdn\.co\//.test(preview)) return null;
  const title = text(track.title) || text(track.name);
  const artist = text(track.subtitle) || array(track.artists)
    .map(entry => text(child(entry, 'name')))
    .filter(Boolean)
    .join(', ');
  if (!title) return null;
  return {
    title,
    artist,
    url: preview,
    externalUrl: `https://open.spotify.com/track/${id}`,
    durationMs: number(track.duration),
    platform: 'spotify',
    sourceId: id,
  };
}

/** Reads the server-rendered Spotify embed payload. */
export function parseSpotifyEmbed(html: string): SpotifyEmbedParse {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new PlaylistError('unavailable');
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new PlaylistError('unavailable');
  }
  const pageProps = child(data, 'props', 'pageProps');
  if (child(pageProps, 'status') === 404) throw new PlaylistError('not-found');
  const entity = child(pageProps, 'state', 'data', 'entity');
  const entityRecord = record(entity);
  if (!entityRecord) throw new PlaylistError('unavailable');
  const title = text(entityRecord.title) || text(entityRecord.name);
  const listed = array(entityRecord.trackList);
  const candidates =
    listed.length > 0
      ? listed
      : entityRecord.type === 'track'
        ? [entityRecord]
        : [];
  const tracks: PlaylistImportTrack[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const candidate of candidates) {
    const parsed = spotifyTrack(candidate);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (seen.has(parsed.sourceId)) {
      skipped += 1;
      continue;
    }
    if (tracks.length >= MAX_PLAYLIST_TRACKS) {
      throw new PlaylistError('too-large');
    }
    seen.add(parsed.sourceId);
    tracks.push(parsed);
  }
  if (tracks.length === 0) throw new PlaylistError('empty');
  return { title: title || 'Spotify playlist', tracks, skipped };
}

export interface YouTubeContinuation {
  token: string;
  apiKey: string;
  clientVersion: string;
  visitorData: string;
}

export interface YouTubePageParse {
  title: string;
  tracks: PlaylistImportTrack[];
  continuation: YouTubeContinuation | null;
}

function parseClock(value: string): number {
  const parts = value.split(':').map(part => Number(part));
  if (parts.some(part => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return (parts[0]! * 60 + parts[1]!) * 1000;
  if (parts.length === 3) return (parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000;
  return 0;
}

function lockupTrack(value: unknown): PlaylistImportTrack | null {
  const lockup = record(value);
  if (!lockup) return null;
  const id = text(lockup.contentId);
  if (!youtubeVideoId(id)) return null;
  const meta = child(lockup, 'metadata', 'lockupMetadataViewModel');
  const title = text(child(meta, 'title', 'content'));
  if (!title) return null;
  const rows = array(child(meta, 'metadata', 'contentMetadataViewModel', 'metadataRows'));
  const firstRow = record(rows[0]);
  const artist = array(child(firstRow, 'metadataParts'))
    .map(part => text(child(part, 'text', 'content')))
    .filter(Boolean)[0] ?? '';
  const badges = array(child(lockup, 'contentImage', 'thumbnailViewModel', 'overlays'));
  let duration = 0;
  for (const badge of badges) {
    const stamp = text(child(badge, 'thumbnailBottomOverlayViewModel', 'badges', 0, 'thumbnailBadgeViewModel', 'text'));
    if (/^\d+(?::\d{2}){1,2}$/.test(stamp)) {
      duration = parseClock(stamp);
      break;
    }
  }
  return {
    title,
    artist,
    url: `https://www.youtube.com/watch?v=${id}`,
    externalUrl: `https://www.youtube.com/watch?v=${id}`,
    durationMs: duration,
    platform: 'youtube',
    sourceId: id,
  };
}

function collectLockups(node: unknown, out: PlaylistImportTrack[], seen: Set<string>): void {
  if (out.length >= MAX_PLAYLIST_TRACKS) return;
  if (Array.isArray(node)) {
    for (const item of node) collectLockups(item, out, seen);
    return;
  }
  const value = record(node);
  if (!value) return;
  const lockup = record(value.lockupViewModel);
  if (lockup) {
    const parsed = lockupTrack(lockup);
    if (parsed && !seen.has(parsed.sourceId)) {
      seen.add(parsed.sourceId);
      out.push(parsed);
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'lockupViewModel') continue;
    collectLockups(entry, out, seen);
  }
}

function findContinuationToken(node: unknown): string {
  const value = record(node);
  if (!value) return '';
  const direct = text(child(value, 'continuationCommand', 'innertubeCommand', 'continuationCommand', 'token'));
  if (direct) return direct;
  const bare = text(child(value, 'continuationCommand', 'token'));
  if (bare) return bare;
  for (const entry of Object.values(value)) {
    const found = findContinuationToken(entry);
    if (found) return found;
  }
  return '';
}

function initialContinuationToken(data: unknown): string {
  const items = array(
    child(
      data,
      'contents',
      'twoColumnBrowseResultsRenderer',
      'tabs',
      0,
      'tabRenderer',
      'content',
      'sectionListRenderer',
      'contents',
      0,
      'itemSectionRenderer',
      'contents',
    ),
  );
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const token = findContinuationToken(items[index]);
    if (token) return token;
  }
  return findContinuationToken(data);
}

function youtubeConfig(html: string): Omit<YouTubeContinuation, 'token'> {
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? '';
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? '';
  const visitorData = html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1] ?? '';
  return { apiKey, clientVersion, visitorData };
}

/** Reads a YouTube playlist page; the page contains 100 rows by default. */
export function parseYouTubePage(html: string): YouTubePageParse {
  const match =
    html.match(/var ytInitialData = ([\s\S]*?);<\/script>/) ??
    html.match(/window\["ytInitialData"\] = ([\s\S]*?);<\/script>/);
  if (!match?.[1]) {
    if (/This playlist does not exist|This playlist is private/i.test(html)) {
      throw new PlaylistError('not-found');
    }
    throw new PlaylistError('unavailable');
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new PlaylistError('unavailable');
  }
  const title =
    text(child(data, 'metadata', 'playlistMetadataRenderer', 'title')) ||
    text(child(data, 'header', 'pageHeaderRenderer', 'pageTitle'));
  const tracks: PlaylistImportTrack[] = [];
  collectLockups(data, tracks, new Set());
  if (tracks.length === 0) {
    if (/This playlist does not exist|This playlist is private/i.test(html)) {
      throw new PlaylistError('not-found');
    }
    throw new PlaylistError('empty');
  }
  const config = youtubeConfig(html);
  const token = initialContinuationToken(data);
  return {
    title: title || 'YouTube playlist',
    tracks,
    continuation:
      token && config.apiKey && config.clientVersion ? { token, ...config } : null,
  };
}

export interface YouTubeContinuationParse {
  tracks: PlaylistImportTrack[];
  next: string;
}

/** Reads one browse-continuation response and the token that follows it. */
export function parseYouTubeContinuation(data: unknown): YouTubeContinuationParse {
  const actions = array(child(data, 'onResponseReceivedActions'));
  const appended = array(
    child(actions[0], 'appendContinuationItemsAction', 'continuationItems'),
  );
  const tracks: PlaylistImportTrack[] = [];
  const seen = new Set<string>();
  if (appended.length > 0) {
    collectLockups(appended, tracks, seen);
  } else {
    collectLockups(child(data, 'continuationContents'), tracks, seen);
  }
  let next = '';
  for (let index = appended.length - 1; index >= 0; index -= 1) {
    next = findContinuationToken(appended[index]);
    if (next) break;
  }
  return { tracks, next };
}

/** Keeps one malformed page from growing without bound. */
export function pageBudget(pages: number): boolean {
  return pages < MAX_PAGES;
}
