import { describe, expect, it } from 'vitest';
import {
  classifyPlaylistUrl,
  parseSpotifyEmbed,
  parseYouTubeContinuation,
  parseYouTubePage,
} from '../electron/playlist-rules';

function spotifyPage(payload: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    payload,
  )}</script></body></html>`;
}

function youtubePage(data: unknown): string {
  return [
    '<html><script>',
    `"INNERTUBE_API_KEY":"KEY";"INNERTUBE_CLIENT_VERSION":"2.20260101";"VISITOR_DATA":"VIS";`,
    `var ytInitialData = ${JSON.stringify(data)};</script></html>`,
  ].join('\n');
}

function lockup(id: string, title: string, artist: string, stamp: string) {
  return {
    lockupViewModel: {
      contentId: id,
      metadata: {
        lockupMetadataViewModel: {
          title: { content: title },
          metadata: {
            contentMetadataViewModel: {
              metadataRows: [{ metadataParts: [{ text: { content: artist } }] }],
            },
          },
        },
      },
      contentImage: {
        thumbnailViewModel: {
          overlays: [
            {
              thumbnailBottomOverlayViewModel: {
                badges: [{ thumbnailBadgeViewModel: { text: stamp } }],
              },
            },
          ],
        },
      },
    },
  };
}

describe('playlist URL classification', () => {
  it('recognises public Spotify entities and removes locale prefixes', () => {
    expect(classifyPlaylistUrl('https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M')).toEqual({
      provider: 'spotify',
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
      canonicalUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    });
    expect(classifyPlaylistUrl('open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3')?.kind).toBe('album');
    expect(classifyPlaylistUrl('https://open.spotify.com/show/abc')).toBeNull();
  });

  it('distinguishes a YouTube playlist from a single video', () => {
    expect(
      classifyPlaylistUrl('https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'),
    ).toMatchObject({ provider: 'youtube', kind: 'playlist' });
    expect(
      classifyPlaylistUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'),
    ).toMatchObject({ provider: 'youtube', kind: 'video', id: 'jNQXAC9IVRw' });
    expect(classifyPlaylistUrl('https://youtu.be/jNQXAC9IVRw')).toMatchObject({
      provider: 'youtube',
      kind: 'video',
      id: 'jNQXAC9IVRw',
    });
  });

  it('refuses unsupported hosts and protocols', () => {
    expect(classifyPlaylistUrl('https://example.com/playlist')).toBeNull();
    expect(classifyPlaylistUrl('file:///playlist')).toBeNull();
    expect(classifyPlaylistUrl('')).toBeNull();
  });
});

describe('Spotify embed parsing', () => {
  it('keeps previewable tracks and reports the rest as skipped', () => {
    const paragraph = parseSpotifyEmbed(
      spotifyPage({
        props: {
          pageProps: {
            state: {
              data: {
                entity: {
                  type: 'playlist',
                  title: 'Test list',
                  trackList: [
                    {
                      uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
                      title: 'Never Gonna Give You Up',
                      subtitle: 'Rick Astley',
                      duration: 213573,
                      audioPreview: { url: 'https://p.scdn.co/mp3-preview/abc' },
                    },
                    {
                      uri: 'spotify:track:0000000000000000000000',
                      title: 'Unavailable',
                      subtitle: 'Nobody',
                      audioPreview: null,
                    },
                  ],
                },
              },
            },
          },
        },
      }),
    );
    expect(paragraph.title).toBe('Test list');
    expect(paragraph.skipped).toBe(1);
    expect(paragraph.tracks).toEqual([
      {
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        url: 'https://p.scdn.co/mp3-preview/abc',
        externalUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        durationMs: 213573,
        platform: 'spotify',
        sourceId: '4cOdK2wGLETKBW3PvgPWqT',
      },
    ]);
  });

  it('reads a single track and recognises a missing page', () => {
    const single = parseSpotifyEmbed(
      spotifyPage({
        props: {
          pageProps: {
            state: {
              data: {
                entity: {
                  type: 'track',
                  id: '4cOdK2wGLETKBW3PvgPWqT',
                  title: 'Never Gonna Give You Up',
                  artists: [{ name: 'Rick Astley' }],
                  duration: 213573,
                  audioPreview: { url: 'https://p.scdn.co/mp3-preview/abc' },
                },
              },
            },
          },
        },
      }),
    );
    expect(single.tracks).toHaveLength(1);
    expect(single.tracks[0]?.artist).toBe('Rick Astley');

    expect(() =>
      parseSpotifyEmbed(spotifyPage({ props: { pageProps: { status: 404 } } })),
    ).toThrow('not-found');
  });
});

describe('YouTube playlist parsing', () => {
  it('reads initial lockups, title and continuation config', () => {
    const data = {
      metadata: { playlistMetadataRenderer: { title: 'Test videos' } },
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            lockup('jNQXAC9IVRw', 'Me at the zoo', 'jawed', '0:19'),
                            lockup('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley', '3:33'),
                            {
                              continuationItemViewModel: {
                                continuationCommand: {
                                  innertubeCommand: {
                                    continuationCommand: { token: 'TOKEN' },
                                  },
                                },
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    const page = parseYouTubePage(youtubePage(data));
    expect(page.title).toBe('Test videos');
    expect(page.tracks).toHaveLength(2);
    expect(page.tracks[1]).toMatchObject({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      durationMs: 213000,
      platform: 'youtube',
      sourceId: 'dQw4w9WgXcQ',
    });
    expect(page.continuation).toEqual({
      token: 'TOKEN',
      apiKey: 'KEY',
      clientVersion: '2.20260101',
      visitorData: 'VIS',
    });
  });

  it('reads an appended page and its next token', () => {
    const parsed = parseYouTubeContinuation({
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              lockup('jNQXAC9IVRw', 'Me at the zoo', 'jawed', '0:19'),
              {
                continuationItemViewModel: {
                  continuationCommand: {
                    innertubeCommand: { continuationCommand: { token: 'NEXT' } },
                  },
                },
              },
            ],
          },
        },
      ],
    });
    expect(parsed.tracks.map(track => track.sourceId)).toEqual(['jNQXAC9IVRw']);
    expect(parsed.next).toBe('NEXT');
  });
});
