# Media player: x531

The player is a secret service in the same series as Lexium: an element tile
marked **Mx / x531**, a full page at `#/player`, and a transport bar that docks
above the status bar (above the phone navigation on a narrow window) whenever
the queue has a track.

## What it plays

| Source | Behaviour |
| --- | --- |
| Local files | Picked or dropped onto the page. MP3, M4A, AAC, WAV, OGG, Opus, FLAC, WebM, MP4, MOV, MKV. The file is decoded by Chromium; no upload, no copy into the state file. |
| Direct links | A URL to a media file (`https://host/track.mp3`, `clip.mp4`, a stream that serves audio directly). |
| Spotify playlists, albums and tracks | The public embed page is read in the main process. Every track with a public preview becomes a queue row, with its artist and a link to the full track. The row plays Spotify's **30-second preview MP3**; the player never bypasses Spotify's player, DRM or account. |
| YouTube playlists and videos | The playlist page and its continuation responses become queue rows (up to 500). Rows play in an embedded YouTube player with working video, so the full public video/song plays and the queue can advance. |
| Twitch, SoundCloud, Vimeo | Recognised as web pages, not media files. The player offers **Open {name}** and hands the link to its own module. It does not pretend it can decode those pages. |

Playlist import accepts `open.spotify.com/playlist|album|track/…`,
`youtube.com/playlist?list=…`, `youtube.com/watch?v=…`, `youtu.be/…` and
YouTube Music playlist links. A watch URL that also carries a `list` parameter
stays a single video, because importing a whole list when one video was pasted
would be surprising. Duplicate rows are skipped, and the importer refuses a
playlist larger than 500 tracks rather than growing the queue without a bound.

The queue is intentionally session-only. A browser cannot reopen a local file
after a reload without asking again, so restoring a queue would only produce
broken rows. Volume, repeat mode and shuffle are persisted in Settings.

## Transport

- Play / pause, previous, next.
- Previous restarts the current track when it is more than three seconds in,
  which is the behaviour people expect from a music player.
- Repeat cycles **off → all → one**. Repeat-one loops only on automatic
  advance; pressing Next still moves on.
- Shuffle picks another track at random and never picks the current one.
- Seek, mute and volume are mirrored between the page and the dock, including
  YouTube rows.
- Closing the dock stops playback and empties the queue; removing one row
  revokes its object URL immediately.

## Two engines, one transport

Local files, direct links and Spotify previews use one detached `<video>`
element. YouTube rows use a sandboxed `<iframe>`; the player talks to it through
the embed's postMessage API (`playVideo`, `pauseVideo`, `seekTo`, `setVolume`,
`get…`) and reads state from its `infoDelivery` messages. No third-party script
runs in the trusted shell.

The engine host is never reparented. When the player page is open it is
positioned over the stage; when the user navigates away it becomes a 1×1 hidden
host. That is why a YouTube video keeps its audio and position while the user
works in another view, and why returning to the page does not restart it.
Audio-only rows show a quiet ripple behind the controls; video rows render in
the stage.

### Why the loopback bridge exists

YouTube returns **Error 153: Video player configuration error** when its embed
is framed directly by a `file://` Electron shell. The main process therefore
starts a tiny HTTP server bound to `127.0.0.1` on an ephemeral port. It serves
one page, `/youtube?v=<validated-id>`, which embeds the video with a normal
HTTP referrer and forwards its postMessage API to the shell. The route validates
an 11-character video id, serves no files, reads no user data, and shuts down
with the app. The browser preview, which already has an HTTP origin, uses the
direct embed URL instead.

## Where the playlist data comes from

Playlist resolution runs in the **main process**, not the renderer:

- Spotify: the public `open.spotify.com/embed/<type>/<id>` page contains the
  public track list and preview URLs. No token or account is used.
- YouTube: the public playlist page's initial data provides the first 100 rows;
  its browse continuation tokens provide the rest. The importer stops at 500
  and tolerates a failed continuation by keeping the rows already loaded.
- A single YouTube video uses the public oEmbed endpoint for its title/author.

Raw HTML, YouTube visitor data and API keys never cross the IPC bridge. Only
normalized `{ title, artist, url, externalUrl, durationMs, platform, sourceId }`
rows do. The renderer never needs a CORS proxy, and nothing is downloaded as
media: Spotify previews stream from `p.scdn.co`, YouTube plays in its own embed.

## Keyboard and accessibility

Every control is a labelled button; the sliders expose `Seek` and `Volume`
labels. The dock is a landmark region named **Media player**, and each track row
has Play / Remove labels plus an external-link button for platform rows. There
is no hidden gesture: everything the dock does is also on the page.

## Formats and failure states

Chromium decides what it can decode. A DRM-protected file or an exotic codec
shows a failure message instead of a silent black stage. A direct link must
point at the media file and allow cross-origin playback. Platform failures name
the platform: a Spotify row with no public preview says so, and a YouTube row
that refuses embedding offers the full video in YouTube. A private, empty or
malformed playlist returns a short error without changing the queue.

## Where it lives

- Page: `src/views/Player.tsx`
- Engine and queue: `src/components/PlayerProvider.tsx`
- Dock: `src/components/PlayerBar.tsx`
- Rules and URL classification: `src/lib/player.ts`
- Playlist importer: `electron/playlist.ts`
- Playlist parsers: `electron/playlist-rules.ts`
- YouTube loopback bridge: `electron/player-embed.ts`
- Styles: `src/styles-tools.css`

## Embeds, artwork and the visualizer

The player has two engines. Local files, direct links and Spotify previews use a
detached `<video>`; YouTube rows use a sandboxed embed. In the desktop build that
embed loads through a loopback page (`electron/player-embed.ts`) because a
`file://` parent makes YouTube answer **Error 153** — the shell forwards the
player API over `postMessage` so the transport still works.

The stage is a 16:9 box for video (`.player-screen.is-video`). It used to be
`height: auto` with only a `min-height`, which made a wide stage 200 px tall and
is what people saw as a compressed black box; the embed overlay is repositioned
through a `ResizeObserver` and a slow timer while a YouTube row plays.

Errors are reported by cause rather than as one message: an owner who disabled
embedding (101/150), a removed or private video (100), a refused referer (153),
a live stream, or a direct link that does not allow cross-origin playback.

Artwork comes from the Spotify embed payload or a YouTube thumbnail
(`i.ytimg.com/vi/<id>/mqdefault.jpg`); nothing is fetched for local files, which
would mean parsing ID3 frames.

The visualizer draws from a Web Audio analyser attached to the local element.
That element is the one Kryvex decodes, so a YouTube embed has no analysable
audio and the panel says so instead of drawing silence. The audio graph is cached
per element: `createMediaElementSource` throws if it is called twice, and the
element lives for the whole session.

Spotify still plays 30-second previews. Full tracks need the Web Playback SDK,
which requires a Premium account **and** Widevine EME; Electron ships no Widevine
CDM, so the SDK cannot decode here. The row keeps its "open in Spotify" action
rather than pretending otherwise.
