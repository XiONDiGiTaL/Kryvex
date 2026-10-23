import { describe, expect, it } from 'vitest';
import {
  clampPageVolume,
  cleanArtwork,
  cleanText,
  controlScript,
  dockGuardScript,
  isMediaAction,
  mediaTitle,
  parseMediaSample,
  sampleScript,
} from '../electron/media-rules';

describe('media actions', () => {
  it('accepts only the four transport actions', () => {
    expect(isMediaAction('play')).toBe(true);
    expect(isMediaAction('pause')).toBe(true);
    expect(isMediaAction('next')).toBe(true);
    expect(isMediaAction('previous')).toBe(true);
    expect(isMediaAction('stop')).toBe(false);
    expect(isMediaAction('')).toBe(false);
    expect(isMediaAction(1)).toBe(false);
  });
});

describe('media sample sanitizing', () => {
  it('keeps text but caps it and flattens whitespace', () => {
    expect(cleanText('  A   title\n here ')).toBe('A title here');
    expect(cleanText('x'.repeat(500)).length).toBe(180);
    expect(cleanText(42)).toBe('');
  });

  it('accepts https artwork only', () => {
    expect(cleanArtwork('https://i.ytimg.com/vi/a/hq.jpg')).toBe('https://i.ytimg.com/vi/a/hq.jpg');
    expect(cleanArtwork('http://example.com/a.png')).toBe('');
    expect(cleanArtwork('javascript:alert(1)')).toBe('');
    expect(cleanArtwork('not a url')).toBe('');
  });

  it('rejects junk and normalizes numbers', () => {
    expect(parseMediaSample(null)).toBeNull();
    expect(parseMediaSample('title')).toBeNull();
    const sample = parseMediaSample({
      title: 'Song',
      artist: 'Artist',
      artwork: 'https://example.com/a.jpg',
      playing: true,
      position: 12.6,
      duration: 210.2,
    });
    expect(sample).toEqual({
      title: 'Song',
      artist: 'Artist',
      artwork: 'https://example.com/a.jpg',
      playing: true,
      position: 13,
      duration: 210,
    });
    expect(
      parseMediaSample({ playing: 'yes', position: -3, duration: Number.NaN }),
    ).toEqual({ title: '', artist: '', artwork: '', playing: false, position: 0, duration: 0 });
  });
});

describe('control scripts', () => {
  it('uses the site button for each known service', () => {
    expect(controlScript('https://www.youtube.com/watch?v=1', 'pause')).toContain('ytp-play-button');
    expect(controlScript('https://www.youtube.com/watch?v=1', 'next')).toContain('ytp-next-button');
    expect(controlScript('https://open.spotify.com/album/1', 'play')).toContain(
      'control-button-playpause',
    );
    expect(controlScript('https://soundcloud.com/a/b', 'next')).toContain('skipControl__next');
  });

  it('falls back to the media element only for play and pause', () => {
    const play = controlScript('https://example.com/audio', 'play');
    expect(play).toContain('media.play()');
    expect(controlScript('https://example.com/audio', 'pause')).toContain('media.pause()');
    expect(controlScript('https://example.com/audio', 'next')).toContain('return false');
  });

  it('does not leak a selector from one service to another', () => {
    expect(controlScript('https://example.com/watch', 'next')).not.toContain('ytp-next-button');
    expect(controlScript('https://notspotify.com', 'next')).not.toContain(
      'control-button-skip-forward',
    );
  });

  it('produces valid JavaScript', () => {
    const factory = new Function(`return ${controlScript('https://www.youtube.com', 'play')}`);
    expect(typeof factory).toBe('function');
    const sampler = new Function(`return ${sampleScript()}`);
    expect(typeof sampler).toBe('function');
  });
});

describe('dock volume and repeat', () => {
  it('keeps page volume a fraction, and treats junk as unmuted', () => {
    expect(clampPageVolume(0.35)).toBe(0.35);
    expect(clampPageVolume(0)).toBe(0);
    expect(clampPageVolume(4)).toBe(1);
    expect(clampPageVolume(-2)).toBe(0);
    expect(clampPageVolume('0.5')).toBe(0.5);
    expect(clampPageVolume(Number.NaN)).toBe(1);
    expect(clampPageVolume(undefined)).toBe(1);
  });

  it('carries both settings into the page guard', () => {
    const script = dockGuardScript(0.4, true);
    expect(script).toContain('"volume":0.4');
    expect(script).toContain('"repeat":true');
    // A repeat request that is not exactly true must not loop anything.
    expect(dockGuardScript(1, 'yes')).toContain('"repeat":false');
  });

  it('listens on the document so a replaced media element still counts', () => {
    const script = dockGuardScript(0.8, true);
    expect(script).toContain("addEventListener('play'");
    expect(script).toContain("addEventListener('ended'");
    expect(script).toContain('location.reload()');
    const factory = new Function(`return ${script}`);
    expect(typeof factory).toBe('function');
  });
});

describe('mediaTitle', () => {
  it('prefers the page title, then the artist, then the host', () => {
    expect(mediaTitle({ title: 'Track', artist: 'Artist', url: 'https://a.test' })).toBe('Track');
    expect(mediaTitle({ title: '', artist: 'Artist', url: 'https://a.test' })).toBe('Artist');
    expect(mediaTitle({ title: '', artist: '', url: 'https://www.youtube.com/watch' })).toBe(
      'youtube.com',
    );
  });
});
