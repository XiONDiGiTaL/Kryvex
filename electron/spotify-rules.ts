/**
 * Spotify ad guard rules.
 *
 * Spotify's web player assigns no ids to its audio stream, so muting has to
 * happen at the guest level: the main process asks the page whether an ad is
 * showing, then mutes the whole web contents for the duration. The page is
 * never modified beyond one click on its own Skip ad or Next control.
 *
 * Track ads and podcast ad breaks are handled differently on purpose. A track
 * ad can be followed by pressing the player's Next control; during a podcast,
 * that same control advances to the next episode, so a podcast only gets an
 * explicit Skip ad control when Spotify offers one. Otherwise the break is
 * muted and left to finish.
 *
 * Detection is deliberately narrow. Only the now-playing bar and the Media
 * Session label are read, so a permanent sidebar ad slot cannot silence a song,
 * and an unlabelled host-read segment plays as before. Everything here is pure
 * so the selectors, cooldown and probe scripts can be tested without Electron.
 */

const SPOTIFY_HOSTS = ['spotify.com', 'open.spotify.com', 'www.spotify.com'];

export function isSpotifyPage(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return SPOTIFY_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/** A page that is clearly a podcast rather than a track or playlist. */
export function isPodcastPath(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  return /^\/(episode|show)\//i.test(raw);
}

/**
 * Markers Spotify ships inside the now-playing bar while an ad is playing.
 * `ad-slot-container` is intentionally absent: it can sit in the page for a
 * whole session and would mute every song. A Skip ad control is only present
 * during a break, so it is both an ad marker and the podcast escape hatch.
 */
export const SPOTIFY_AD_MARKERS = [
  '[data-testid="context-item-info-ad-subtitle"]',
  '[data-testid="now-playing-widget"] [href*="/ad/"]',
  '[data-testid="now-playing-bar"] [aria-label="Advertisement"]',
  '[data-testid="ad-playing"]',
  '[data-testid="ad-now-playing"]',
  '[data-testid="podcast-ad"]',
  '[data-testid="ad-countdown"]',
  '[data-testid="control-button-skip-ad"]',
  '[data-testid="ad-skip-button"]',
];

/** Podcast context markers, separate from the ad markers above. */
export const SPOTIFY_PODCAST_MARKERS = [
  '[data-testid="context-item-info-show"]',
  '[data-testid="context-item-info-podcast"]',
  '[data-testid="episode-badge"]',
];

export const SPOTIFY_SKIP_AD_SELECTOR =
  '[data-testid="control-button-skip-ad"], [data-testid="ad-skip-button"], button[aria-label*="skip ad" i]';

export interface SpotifyAdProbe {
  ad: boolean;
  podcast: boolean;
  /** A track, album or playlist page, where Next is a safe ad skip. */
  track: boolean;
  skipAd: boolean;
}

const EMPTY_PROBE: SpotifyAdProbe = { ad: false, podcast: false, track: false, skipAd: false };

/**
 * Validates what the guest returns. A page cannot smuggle another shape past
 * this, and a stale build without the object form reads as "no ad".
 */
export function parseAdProbe(raw: unknown): SpotifyAdProbe {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PROBE };
  const source = raw as Record<string, unknown>;
  return {
    ad: source.ad === true,
    podcast: source.podcast === true,
    track: source.track === true,
    skipAd: source.skipAd === true,
  };
}

/**
 * Returns the state of the player: whether an ad is showing, whether the
 * current context is a podcast, and whether Spotify is offering an explicit
 * Skip ad control. The visible label and the Media Session title are both read,
 * because podcast breaks often change metadata without changing the bar's
 * test ids.
 */
export function adProbeScript(): string {
  const markers = JSON.stringify(SPOTIFY_AD_MARKERS);
  const podcastMarkers = JSON.stringify(SPOTIFY_PODCAST_MARKERS);
  const skipSelector = JSON.stringify(SPOTIFY_SKIP_AD_SELECTOR);
  return `(() => {
  try {
    const bar = document.querySelector('[data-testid="now-playing-widget"], [data-testid="now-playing-bar"]');
    const markers = ${markers};
    const podcastMarkers = ${podcastMarkers};
    const adWord = /(^|[^a-z])advertisement([^a-z]|$)/;
    const podcastPath = /^\\/(episode|show)\\//i.test(location.pathname);
    const podcast = podcastPath || !!(bar && bar.querySelector(podcastMarkers.join(',')));
    const trackPath = /^\\/(track|album|playlist|artist|collection|search|section|genre|user)\\//i.test(location.pathname);
    const trackLink = !!(bar && bar.querySelector('[data-testid="context-item-info-artist"], a[href^="/artist/"]'));
    const track = !podcast && (trackPath || trackLink);
    const skipButton = document.querySelector(${skipSelector});
    const skipAd = !!(skipButton
      && !skipButton.disabled
      && skipButton.getAttribute('aria-disabled') !== 'true');
    let ad = false;
    if (bar && bar.querySelector(markers.join(','))) ad = true;
    if (!ad && bar) {
      const text = (bar.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      ad = adWord.test(text);
    }
    if (!ad) {
      const meta = navigator.mediaSession && navigator.mediaSession.metadata;
      const label = [meta && meta.title, meta && meta.album].filter(Boolean).join(' ').toLowerCase();
      ad = adWord.test(label);
    }
    // A Skip ad control is only rendered during a break, even when the bar's
    // own labels lag behind. Its presence alone is enough to mute.
    if (!ad && skipButton) ad = true;
    return { ad, podcast, track, skipAd };
  } catch {
    return { ad: false, podcast: false, track: false, skipAd: false };
  }
})()`;
}

/**
 * One click on a control the page itself exposes. A track, album or playlist
 * ad falls back to the player's Next button, which is what a manual skip would
 * do. A podcast, or a page whose context is unclear, never falls back to Next:
 * that could leave the episode rather than the ad, so it is muted only unless
 * Spotify offers an explicit Skip ad control.
 */
export function adSkipScript(allowNext: boolean): string {
  const skipAd = JSON.stringify(SPOTIFY_SKIP_AD_SELECTOR);
  const next = JSON.stringify('[data-testid="control-button-skip-forward"]');
  const fallback = allowNext ? `const button = document.querySelector(${next});
  if (!button) return false;
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
  if (typeof button.click !== 'function') return false;
  button.click();
  return true;` : 'return false;';
  return `(() => {
  const explicit = document.querySelector(${skipAd});
  if (explicit
    && !explicit.disabled
    && explicit.getAttribute('aria-disabled') !== 'true'
    && typeof explicit.click === 'function') {
    explicit.click();
    return true;
  }
  ${fallback}
})()`;
}

/**
 * Whether the guard may press anything at all. An explicit Skip ad control is
 * always usable; the generic Next fallback needs a track, album or playlist
 * context, so a podcast or an unclear page can only be muted.
 */
export function canAttemptSkip(probe: SpotifyAdProbe): boolean {
  return probe.ad === true && (probe.skipAd === true || probe.track === true);
}

/** Long enough that clicking Next cannot race through a whole ad break. */
export const SKIP_COOLDOWN_MS = 20_000;

export function shouldAttemptSkip(lastAttempt: number, now: number, cooldown = SKIP_COOLDOWN_MS): boolean {
  if (!Number.isFinite(now)) return false;
  if (!Number.isFinite(lastAttempt) || lastAttempt <= 0) return true;
  return now - lastAttempt >= cooldown;
}

/**
 * Mute is only borrowed: if the module was already muted by its own header
 * switch, the guard leaves it muted when the ad ends.
 */
export function restoreMuted(policyMuted: boolean): boolean {
  return policyMuted === true;
}
