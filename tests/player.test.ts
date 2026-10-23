import { describe, expect, it } from 'vitest';
import { playlistTargetFor } from '../src/lib/player';

describe('player playlist targets', () => {
  it('recognises Spotify playlists, albums and tracks', () => {
    expect(playlistTargetFor('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toEqual({
      provider: 'spotify',
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
    });
    expect(playlistTargetFor('open.spotify.com/intl-fr/album/1DFixLWuPkv3KT3TnV35m3')).toMatchObject({
      provider: 'spotify',
      kind: 'album',
    });
    expect(playlistTargetFor('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toMatchObject({
      kind: 'track',
    });
  });

  it('recognises YouTube lists and videos, including short links', () => {
    expect(
      playlistTargetFor('https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'),
    ).toMatchObject({ provider: 'youtube', kind: 'playlist' });
    expect(
      playlistTargetFor('https://music.youtube.com/playlist?list=OLAK5uy_lZbQdT3mnx1yhVJkS3gOYzM'),
    ).toMatchObject({ provider: 'youtube', kind: 'playlist' });
    expect(playlistTargetFor('https://youtu.be/jNQXAC9IVRw')).toMatchObject({
      provider: 'youtube',
      kind: 'video',
      id: 'jNQXAC9IVRw',
    });
    expect(playlistTargetFor('https://www.youtube.com/shorts/jNQXAC9IVRw')).toMatchObject({
      kind: 'video',
    });
  });

  it('leaves other pages to the platform handoff', () => {
    expect(playlistTargetFor('https://www.twitch.tv/somechannel')).toBeNull();
    expect(playlistTargetFor('https://example.com/file.mp3')).toBeNull();
    expect(playlistTargetFor('not a link')).toBeNull();
  });
});
