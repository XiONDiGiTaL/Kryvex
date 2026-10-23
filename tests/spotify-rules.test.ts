import { describe, expect, it } from 'vitest';
import {
  SKIP_COOLDOWN_MS,
  adProbeScript,
  adSkipScript,
  canAttemptSkip,
  isPodcastPath,
  isSpotifyPage,
  parseAdProbe,
  restoreMuted,
  shouldAttemptSkip,
} from '../electron/spotify-rules';
import { sanitizePlayer } from '../src/lib/store';

describe('isSpotifyPage', () => {
  it('accepts the web player over https', () => {
    expect(isSpotifyPage('https://open.spotify.com/')).toBe(true);
    expect(isSpotifyPage('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(isSpotifyPage('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBe(true);
    expect(isSpotifyPage('https://spotify.com/')).toBe(true);
  });

  it('rejects lookalikes, other protocols and empty values', () => {
    expect(isSpotifyPage('https://open.spotify.com.evil.test/')).toBe(false);
    expect(isSpotifyPage('https://notspotify.com/')).toBe(false);
    expect(isSpotifyPage('http://open.spotify.com/')).toBe(false);
    expect(isSpotifyPage('not a url')).toBe(false);
    expect(isSpotifyPage(undefined)).toBe(false);
    expect(isSpotifyPage(42)).toBe(false);
  });
});

describe('isPodcastPath', () => {
  it('recognises episode and show pages', () => {
    expect(isPodcastPath('/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBe(true);
    expect(isPodcastPath('/show/2mTUnDkuKUkhiueKcVWoP0')).toBe(true);
    expect(isPodcastPath('/EPISODE/abc')).toBe(true);
  });

  it('does not treat tracks, playlists or the home page as podcasts', () => {
    expect(isPodcastPath('/track/abc')).toBe(false);
    expect(isPodcastPath('/playlist/abc')).toBe(false);
    expect(isPodcastPath('/')).toBe(false);
    expect(isPodcastPath('/episode')).toBe(false);
    expect(isPodcastPath(undefined)).toBe(false);
  });
});

describe('ad probe', () => {
  it('parses as JavaScript and returns the richer state object', () => {
    const script = adProbeScript();
    expect(() => new Function(`return ${script}`)).not.toThrow();
    expect(script).toContain('now-playing-widget');
    expect(script).toContain('return { ad, podcast, track, skipAd }');
    expect(script).toContain('navigator.mediaSession');
    expect(script).toContain('advertisement');
    expect(script).toContain('podcast');
  });

  it('keeps the sidebar slot out and carries the podcast escape hatch', () => {
    const script = adProbeScript();
    expect(script).not.toContain('ad-slot-container');
    expect(script).toContain('context-item-info-show');
    expect(script).toContain('context-item-info-artist');
    expect(script).toContain('control-button-skip-ad');
  });

  it('reads only a clean probe shape from the guest', () => {
    expect(parseAdProbe({ ad: true, podcast: true, track: false, skipAd: true })).toEqual({
      ad: true,
      podcast: true,
      track: false,
      skipAd: true,
    });
    expect(parseAdProbe({ ad: 'true', podcast: 1, track: 'yes', skipAd: null })).toEqual({
      ad: false,
      podcast: false,
      track: false,
      skipAd: false,
    });
    expect(parseAdProbe(null)).toEqual({ ad: false, podcast: false, track: false, skipAd: false });
    expect(parseAdProbe(['ad'])).toEqual({ ad: false, podcast: false, track: false, skipAd: false });
  });
});

describe('ad skip', () => {
  it('uses only an explicit Skip ad control when Next is not allowed', () => {
    const script = adSkipScript(false);
    expect(() => new Function(`return ${script}`)).not.toThrow();
    expect(script).toContain('control-button-skip-ad');
    expect(script).toContain('aria-disabled');
    expect(script).not.toContain('control-button-skip-forward');
    expect(script).toContain('return false;');
  });

  it('keeps the Next fallback for a track, album or playlist ad', () => {
    const script = adSkipScript(true);
    expect(() => new Function(`return ${script}`)).not.toThrow();
    expect(script).toContain('control-button-skip-ad');
    expect(script).toContain('control-button-skip-forward');
    expect(script).toContain('button.click()');
  });
});

describe('canAttemptSkip', () => {
  it('needs an explicit control unless the context is a track', () => {
    expect(canAttemptSkip({ ad: true, podcast: false, track: true, skipAd: false })).toBe(true);
    expect(canAttemptSkip({ ad: true, podcast: true, track: false, skipAd: true })).toBe(true);
    expect(canAttemptSkip({ ad: true, podcast: true, track: false, skipAd: false })).toBe(false);
    expect(canAttemptSkip({ ad: true, podcast: false, track: false, skipAd: false })).toBe(false);
    expect(canAttemptSkip({ ad: false, podcast: false, track: true, skipAd: false })).toBe(false);
  });
});

describe('shouldAttemptSkip', () => {
  it('allows the first click and then waits out the cooldown', () => {
    const now = 1_000_000;
    expect(shouldAttemptSkip(0, now)).toBe(true);
    expect(shouldAttemptSkip(now - 1000, now)).toBe(false);
    expect(shouldAttemptSkip(now - SKIP_COOLDOWN_MS, now)).toBe(true);
    expect(shouldAttemptSkip(now - SKIP_COOLDOWN_MS - 1, now)).toBe(true);
  });

  it('refuses a clock it cannot trust', () => {
    expect(shouldAttemptSkip(0, Number.NaN)).toBe(false);
    expect(shouldAttemptSkip(Number.NaN, 1000)).toBe(true);
  });
});

describe('restoreMuted', () => {
  it('keeps a module muted only when its own policy says so', () => {
    expect(restoreMuted(true)).toBe(true);
    expect(restoreMuted(false)).toBe(false);
  });
});

describe('spotify guard setting', () => {
  it('defaults to off and survives a saved true', () => {
    expect(sanitizePlayer(undefined).spotifyAdGuard).toBe(false);
    expect(sanitizePlayer({}).spotifyAdGuard).toBe(false);
    expect(sanitizePlayer({ spotifyAdGuard: true }).spotifyAdGuard).toBe(true);
    expect(sanitizePlayer({ spotifyAdGuard: 'yes' }).spotifyAdGuard).toBe(false);
  });

  it('does not disturb the existing page media defaults', () => {
    const player = sanitizePlayer({});
    expect(player.serviceVolume).toBe(1);
    expect(player.serviceRepeat).toBe(false);
  });
});
