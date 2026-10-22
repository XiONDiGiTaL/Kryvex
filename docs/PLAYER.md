# Media player — x531

The player is a secret service in the same series as Lexium: an element tile
marked **Mx / x531**, a full page at `#/player`, and a transport bar that docks
above the status bar (above the phone navigation on a narrow window) whenever
the queue has a track.

## What it plays

| Source | Behaviour |
| --- | --- |
| Local files | Picked or dropped onto the page. MP3, M4A, AAC, WAV, OGG, Opus, FLAC, WebM, MP4, MOV, MKV. The file is decoded by Chromium; no upload, no copy into the state file. |
| Direct links | A URL to a media file (`https://host/track.mp3`, `clip.mp4`, a stream that serves audio directly). |
| YouTube, Spotify, Twitch, SoundCloud, Vimeo | Recognised as web pages, not media files. Pressing **Open {name}** hands the link to the browser module, where it plays in its own session. The player does not pretend it can decode those pages. |

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
- Seek, mute and volume are mirrored between the page and the dock.
- Closing the dock stops playback and empties the queue; removing one row
  revokes its object URL immediately.

The engine is a single detached `<video>` element owned by
`PlayerProvider`. The page attaches it to the stage when open and lets go when
the user navigates away, so audio keeps playing while other views are used and
returning to the page does not restart the track. Audio tracks show a quiet
ripple behind the controls; video tracks render in the stage.

## Keyboard and accessibility

Every control is a labelled button; the sliders expose `Seek` and `Volume`
labels. The dock is a landmark region named **Media player**, and each track row
is a button with `Play {title}` / `Remove {title}` labels. There is no hidden
gesture: everything the dock does is also on the page.

## Formats and failure states

Chromium decides what it can decode. A DRM-protected file or an exotic codec
shows **This source refused to play** instead of a silent black stage. A direct
link must point at the media file and allow cross-origin playback; a page URL
is redirected to the platform handoff instead of failing in the `<audio>` tag.

## Where it lives

- Page: `src/views/Player.tsx`
- Engine and queue: `src/components/PlayerProvider.tsx`
- Dock: `src/components/PlayerBar.tsx`
- Rules and URL classification: `src/lib/player.ts`
- Styles: `src/styles-tools.css`
