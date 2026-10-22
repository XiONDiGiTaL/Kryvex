import type { RepeatMode } from '../types';

/**
 * Player rules. The queue is deliberately in-memory: a browser cannot reopen a
 * local file after a reload without asking the user again, so pretending to
 * restore one would only produce broken rows. Preferences (volume, repeat,
 * shuffle) are persisted; the list itself is a session.
 */

export type MediaKind = 'audio' | 'video';
export type MediaOrigin = 'file' | 'link';

export interface PlayerTrack {
  id: string;
  title: string;
  subtitle: string;
  /** Blob URL for an imported file, or the http(s) link itself. */
  url: string;
  kind: MediaKind;
  origin: MediaOrigin;
  size: number;
  addedAt: number;
}

export type PlatformId = 'youtube' | 'spotify' | 'twitch' | 'soundcloud' | 'vimeo';

export interface Platform {
  id: PlatformId;
  name: string;
  /** Where the user can play it inside Kryvex. */
  url: string;
}

export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'] as const;
export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'flac',
  'weba',
] as const;

export const MEDIA_ACCEPT = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]
  .map(extension => `.${extension}`)
  .join(',');

export const MAX_TRACK_BYTES = 4 * 1024 * 1024 * 1024;

const PLATFORM_HOSTS: Array<{ id: PlatformId; name: string; hosts: string[]; url: string }> = [
  {
    id: 'youtube',
    name: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
    url: 'https://www.youtube.com',
  },
  {
    id: 'spotify',
    name: 'Spotify',
    hosts: ['open.spotify.com', 'spotify.com', 'www.spotify.com'],
    url: 'https://open.spotify.com',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    hosts: ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'],
    url: 'https://www.twitch.tv',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
    url: 'https://soundcloud.com',
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    hosts: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    url: 'https://vimeo.com',
  },
];

export function platformFor(url: string): Platform | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const match = PLATFORM_HOSTS.find(platform =>
    platform.hosts.some(candidate => host === candidate || host.endsWith(`.${candidate}`)),
  );
  return match ? { id: match.id, name: match.name, url: match.url } : null;
}

export function extensionOf(value: string): string {
  const clean = value.split(/[?#]/)[0] ?? '';
  const name = clean.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function mediaKindFor(value: string): MediaKind | null {
  const extension = extensionOf(value);
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return 'video';
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return 'audio';
  return null;
}

/** Files are known to be files; their MIME type is a useful hint, not a rule. */
export function fileMediaKind(file: File): MediaKind {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return mediaKindFor(file.name) ?? 'audio';
}

export function fileValidation(file: File): string | null {
  const extension = extensionOf(file.name);
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension) &&
      !(VIDEO_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Choose audio or video Kryvex can play: MP3, M4A, AAC, WAV, OGG, Opus, FLAC, MP4, WebM, MOV or MKV.';
  }
  if (file.size > MAX_TRACK_BYTES) return 'That file is too large to open in the player.';
  return null;
}

/** Human title from a URL, without the query string or extension. */
export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
    const withoutExtension = name.replace(/\.[a-z0-9]{1,5}$/i, '');
    const cleaned = withoutExtension.replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) return cleaned;
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'Stream';
  }
}

export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export type LinkClassification =
  | { ok: true; url: string; kind: MediaKind; title: string }
  | { ok: false; reason: 'invalid' | 'platform' | 'unsupported'; platform?: Platform };

/**
 * A link is playable when it is a direct media file. Platform pages are not
 * media files: they are handed to their own module, because pulling a YouTube
 * or Twitch page into an <audio> tag would only produce a decode error.
 */
export function classifyMediaLink(input: string): LinkClassification {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'invalid' };
  let url: URL;
  try {
    url = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported' };
  }
  const platform = platformFor(url.toString());
  if (platform) return { ok: false, reason: 'platform', platform };
  const kind = mediaKindFor(url.toString());
  if (!kind) return { ok: false, reason: 'unsupported' };
  return { ok: true, url: url.toString(), kind, title: titleFromUrl(url.toString()) };
}

export interface NextOptions {
  current: number;
  length: number;
  repeat: RepeatMode;
  shuffle: boolean;
  direction: 1 | -1;
  /** Automatic advance at the end of a track, as opposed to a Next press. */
  auto?: boolean;
  random?: () => number;
}

/**
 * Returns the next index, or -1 when playback should stop. Repeat-one only
 * loops on automatic advance; pressing Next must still move on.
 */
export function nextIndex({
  current,
  length,
  repeat,
  shuffle,
  direction,
  auto = false,
  random = Math.random,
}: NextOptions): number {
  if (length <= 0) return -1;
  if (length === 1) {
    if (auto && repeat === 'one') return 0;
    if (auto && repeat === 'off') return -1;
    return 0;
  }
  if (auto && repeat === 'one') return current;
  if (shuffle) {
    const pick = Math.floor(random() * (length - 1));
    const candidate = pick >= current ? pick + 1 : pick;
    return candidate >= 0 && candidate < length ? candidate : 0;
  }
  const next = current + direction;
  if (next >= length) return auto && repeat === 'off' ? -1 : 0;
  if (next < 0) return length - 1;
  return next;
}

export const REPEAT_ORDER: RepeatMode[] = ['off', 'all', 'one'];

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  const index = REPEAT_ORDER.indexOf(mode);
  return REPEAT_ORDER[(index + 1) % REPEAT_ORDER.length] ?? 'off';
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.max(0, Math.min(1, value));
}

export function trackCountLabel(count: number): string {
  return count === 1 ? '1 track' : `${count} tracks`;
}
