/**
 * Rules for the service media dock.
 *
 * Kryvex does not own the audio when YouTube, Spotify or SoundCloud is playing
 * inside a service frame: the page does. The main process only reads what the
 * page's Media Session reports and, when the user presses a dock button, sends
 * one small script back into that guest. Everything here is pure so the
 * selectors, limits and sanitizing can be tested without Electron.
 */

export type MediaAction = 'play' | 'pause' | 'next' | 'previous';

export const MEDIA_ACTIONS: MediaAction[] = ['play', 'pause', 'next', 'previous'];

export function isMediaAction(value: unknown): value is MediaAction {
  return typeof value === 'string' && (MEDIA_ACTIONS as string[]).includes(value);
}

const MAX_TEXT = 180;
const MAX_ART = 2048;

export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
}

/** Artwork must be a real https image; a page cannot smuggle another scheme in. */
export function cleanArtwork(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_ART) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export interface MediaSample {
  title: string;
  artist: string;
  artwork: string;
  playing: boolean;
  position: number;
  duration: number;
}

/**
 * Reads the page's own Media Session first, then falls back to the visible
 * player chrome. The fallbacks matter because YouTube sets metadata a beat
 * after playback starts, and a channel page may never set it at all.
 */
export function sampleScript(): string {
  return `(() => {
  const pick = value => (typeof value === 'string' ? value : '');
  const meta = navigator.mediaSession && navigator.mediaSession.metadata;
  const artwork = meta && Array.isArray(meta.artwork) && meta.artwork.length
    ? meta.artwork[meta.artwork.length - 1].src
    : '';
  const media = document.querySelector('video, audio');
  const heading = document.querySelector(
    'h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata h1, #title h1 yt-formatted-string',
  );
  const channel = document.querySelector(
    '#owner #channel-name a, ytd-channel-name a, [data-testid="context-item-info-artist"]',
  );
  const title = pick(meta && meta.title)
    || (heading && pick(heading.textContent))
    || pick(document.title).replace(/\\s*[-–]\\s*YouTube$/, '');
  return {
    title,
    artist: pick(meta && meta.artist) || (channel && pick(channel.textContent)),
    artwork,
    playing: media ? !media.paused && !media.ended : false,
    position: media && Number.isFinite(media.currentTime) ? media.currentTime : 0,
    duration: media && Number.isFinite(media.duration) ? media.duration : 0,
  };
})()`;
}

export function parseMediaSample(raw: unknown): MediaSample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  return {
    title: cleanText(source.title),
    artist: cleanText(source.artist),
    artwork: cleanArtwork(source.artwork),
    playing: source.playing === true,
    position:
      typeof source.position === 'number' && Number.isFinite(source.position) && source.position >= 0
        ? Math.round(source.position)
        : 0,
    duration:
      typeof source.duration === 'number' && Number.isFinite(source.duration) && source.duration > 0
        ? Math.round(source.duration)
        : 0,
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const SELECTORS = {
  youtube: {
    play: '.ytp-play-button, .ytp-play-pause-button',
    pause: '.ytp-play-button, .ytp-play-pause-button',
    next: '.ytp-next-button, .ytp-next-button.ytp-button',
    previous: '.ytp-prev-button, .ytp-prev-button.ytp-button',
  },
  spotify: {
    play: '[data-testid="control-button-playpause"]',
    pause: '[data-testid="control-button-playpause"]',
    next: '[data-testid="control-button-skip-forward"]',
    previous: '[data-testid="control-button-skip-back"]',
  },
  soundcloud: {
    play: '.playControl, .playButton',
    pause: '.playControl, .playButton',
    next: '.skipControl__next',
    previous: '.skipControl__previous',
  },
} as const;

/**
 * One script per action. It always tries the site's own button first, because
 * that is what keeps the site's state and its scrobbling correct, and falls
 * back to the media element only for play/pause.
 */
export function controlScript(url: string, action: MediaAction): string {
  const host = hostOf(url);
  const family: keyof typeof SELECTORS | null = isHost(host, 'youtube.com')
    ? 'youtube'
    : isHost(host, 'spotify.com')
      ? 'spotify'
      : isHost(host, 'soundcloud.com')
        ? 'soundcloud'
        : null;
  const selector = family ? SELECTORS[family][action] : '';
  const fallback =
    action === 'play'
      ? `media.play().catch(() => undefined); return true;`
      : action === 'pause'
        ? `media.pause(); return true;`
        : `return false;`;
  return `(() => {
  const selector = ${JSON.stringify(selector)};
  const button = selector ? document.querySelector(selector) : null;
  if (button && typeof button.click === 'function') { button.click(); return true; }
  const media = document.querySelector('video, audio');
  if (!media) return false;
  ${fallback}
})()`;
}

/** A short, stable title for the dock when a page never sets one. */
export function mediaTitle(state: { title: string; artist: string; url: string }): string {
  if (state.title) return state.title;
  if (state.artist) return state.artist;
  const host = hostOf(state.url);
  return host ? host : 'Media';
}
