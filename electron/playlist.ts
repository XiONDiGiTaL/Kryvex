import type { PlaylistImportResult, PlaylistImportTrack } from './types';
import {
  MAX_PLAYLIST_TRACKS,
  PlaylistError,
  classifyPlaylistUrl,
  pageBudget,
  parseSpotifyEmbed,
  parseYouTubeContinuation,
  parseYouTubePage,
  type PlaylistTarget,
  type YouTubeContinuation,
} from './playlist-rules';

/**
 * Fetches and normalizes public playlist pages in the main process. The shell
 * receives only the final queue rows; raw page HTML, visitor data and API keys
 * never cross the bridge. No credentials are read or stored.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const TIMEOUT_MS = 18_000;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

async function requestText(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: string } = {},
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      body: init.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new PlaylistError('offline');
  }
  if (response.status === 404) throw new PlaylistError('not-found');
  // Spotify and YouTube answer 403 on a challenge or 429 when this network is
  // being throttled; calling that "offline" sent people to check their Wi-Fi.
  if (response.status === 403 || response.status === 429) {
    throw new PlaylistError('blocked');
  }
  if (!response.ok) throw new PlaylistError('unavailable');
  const length = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_TEXT_BYTES) {
    throw new PlaylistError('too-large');
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new PlaylistError('offline');
  }
  if (text.length > MAX_TEXT_BYTES) throw new PlaylistError('too-large');
  return text;
}

function dedupe(tracks: PlaylistImportTrack[]): PlaylistImportTrack[] {
  const seen = new Set<string>();
  const kept: PlaylistImportTrack[] = [];
  for (const track of tracks) {
    const key = `${track.platform}:${track.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(track);
  }
  return kept;
}

async function resolveSpotify(target: Extract<PlaylistTarget, { provider: 'spotify' }>): Promise<PlaylistImportResult> {
  const html = await requestText(
    `https://open.spotify.com/embed/${target.kind}/${encodeURIComponent(target.id)}`,
  );
  const parsed = parseSpotifyEmbed(html);
  return {
    ok: true,
    provider: 'spotify',
    title: parsed.title,
    tracks: parsed.tracks,
    skipped: parsed.skipped,
  };
}

async function resolveYouTubeVideo(
  target: Extract<PlaylistTarget, { provider: 'youtube'; kind: 'video' }>,
): Promise<PlaylistImportResult> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    target.canonicalUrl,
  )}&format=json`;
  let payload: unknown;
  try {
    payload = JSON.parse(await requestText(endpoint));
  } catch (error) {
    if (error instanceof PlaylistError) throw error;
    throw new PlaylistError('unavailable');
  }
  const data =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) throw new PlaylistError('unavailable');
  const artist = typeof data.author_name === 'string' ? data.author_name.trim() : '';
  return {
    ok: true,
    provider: 'youtube',
    title,
    tracks: [
      {
        title,
        artist,
        url: target.canonicalUrl,
        externalUrl: target.canonicalUrl,
        durationMs: 0,
        platform: 'youtube',
        sourceId: target.id,
      },
    ],
    skipped: 0,
  };
}

async function requestYouTubeContinuation(
  continuation: YouTubeContinuation,
): Promise<{ tracks: PlaylistImportTrack[]; next: string }> {
  const body = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: continuation.clientVersion,
        hl: 'en',
        gl: 'US',
        visitorData: continuation.visitorData,
      },
    },
    continuation: continuation.token,
  };
  const raw = await requestText(
    `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=${encodeURIComponent(
      continuation.apiKey,
    )}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new PlaylistError('unavailable');
  }
  return parseYouTubeContinuation(payload);
}

async function resolveYouTubePlaylist(
  target: Extract<PlaylistTarget, { provider: 'youtube'; kind: 'playlist' }>,
): Promise<PlaylistImportResult> {
  const html = await requestText(target.canonicalUrl);
  const page = parseYouTubePage(html);
  const collected = [...page.tracks];
  let continuation = page.continuation;
  let pages = 0;
  let truncated = false;

  while (continuation && pageBudget(pages) && collected.length < MAX_PLAYLIST_TRACKS) {
    pages += 1;
    try {
      const next = await requestYouTubeContinuation(continuation);
      collected.push(...next.tracks);
      if (next.tracks.length === 0) break;
      continuation = next.next
        ? { ...continuation, token: next.next }
        : null;
    } catch {
      // The first 100 rows are already a useful queue. A continuation failure
      // should shorten the list, not discard what loaded.
      break;
    }
  }

  const tracks = dedupe(collected).slice(0, MAX_PLAYLIST_TRACKS);
  if (tracks.length === 0) throw new PlaylistError('empty');
  if (tracks.length >= MAX_PLAYLIST_TRACKS) truncated = true;
  return {
    ok: true,
    provider: 'youtube',
    title: page.title,
    tracks,
    skipped: 0,
    truncated,
  };
}

export class PlaylistImporter {
  async resolve(input: unknown): Promise<PlaylistImportResult> {
    if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
      return { ok: false, error: 'unsupported' };
    }
    const target = classifyPlaylistUrl(input);
    if (!target) return { ok: false, error: 'unsupported' };
    try {
      if (target.provider === 'spotify') return await resolveSpotify(target);
      if (target.kind === 'video') return await resolveYouTubeVideo(target);
      return await resolveYouTubePlaylist(target);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof PlaylistError ? error.code : 'offline',
      };
    }
  }
}

export const playlistImporter = new PlaylistImporter();
