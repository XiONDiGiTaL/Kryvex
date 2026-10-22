# Service surfaces: resources, menus, playback and the shield

This batch closes four gaps that made Kryvex feel less like a desktop app than
the pages it hosts. Everything below is desktop-only except where stated.

## Resource monitor: this app, not the machine

`kryvex:resources:sample` has always reported the machine's CPU and memory next
to the app's. That made the panel look like a second Task Manager and, worse,
made 26 GB of Windows memory use read as if Kryvex owned it.

The snapshot now carries both:

| Field | Meaning |
| --- | --- |
| `appCpu` | Sum of Kryvex's Electron process percentages (100 = one core) |
| `appCpuShare` | `appCpu / logical processors`, the Task-Manager-style share |
| `appMemoryMB` | Working set of every Kryvex process |
| `memoryShare` | `appMemoryMB / installed RAM` |
| `processCount` | Rows in the process list |
| `cpu`, `memoryUsedMB` | Kept for diagnostics; no longer shown |

The panel and the sidebar block only present the app's numbers, with the
installed RAM as context (`1.9% of 31.9 GB RAM`). Shell and utility processes
are included because they are Kryvex; nothing outside the app is.

The panel is dismissible three ways: its **×**, `Escape`, or a click outside
it. The sidebar block has its own **×**, which turns
`settings.resources.sidebar` off instead of only hiding for the session.

**Limit:** Windows does not expose total GPU utilisation to Electron. `GPU
PROCESS` is Chromium's GPU process CPU/memory, labelled as such.

## Pinned service menu

Right-clicking a pinned service opens a themed menu rendered by the app, not a
native OS popup, so it inherits the active palette, radius and blur. It offers:

- **Open** and **Edit service**
- **Mute sound** — the module's audio, without touching the site's own setting
- **Notifications** — per-service desktop notifications
- **Keep running in the background** — `keep` or `pause`
- **Unpin**
- **Remove** — still goes through the confirmation setting

Each toggle is a `menuitemcheckbox` with a visible check; `Escape`, arrow keys,
outside clicks and window blur all close it. The menu is clamped to the
viewport at the pointer.

## Parked services stay visible to Chromium

`ServiceStage` used to hide inactive frames with `display: none`, and the whole
stage with `display: none` when no service was in front. Chromium reports a
display-none page as hidden; YouTube and Spotify pause themselves and Discord
can let its gateway go quiet.

Frames are now stacked with `opacity: 0` and `pointer-events: none`, and an
idle stage is a fixed, transparent layer behind the workspace. The page still
believes it is visible, keeps decoding audio and keeps its websocket alive.
`inert` removes the parked frame from the tab order. A module explicitly set to
**pause when hidden** gets `.is-parked { display: none }` and keeps the old
behaviour.

**Cost:** parked frames are still rendered, so a service with heavy animation
keeps using GPU while hidden. `pause` is the switch for a battery-sensitive
machine.

## Media dock

`electron/media.ts` listens to `media-started-playing` and `media-paused` on
service guests, then samples the page's own `navigator.mediaSession.metadata`
(falling back to the watch-page heading and channel). It sends a sanitized
state to the shell: id, partition, URL, title, artist, HTTPS artwork, playing,
position and duration. No audio leaves the page and there is no second decoder.

The dock appears above the status bar on every view:

- artwork, service name, title and artist
- previous / play-pause / next, sent into the guest with
  `kryvex:media:control`
- elapsed and total time, with a progress line
- source switcher when more than one service is playing
- open the owning service, or collapse to a compact pill

Controls click the site's own button first (`.ytp-play-button`,
`control-button-playpause`, SoundCloud's `.playControl`), because that keeps
the site's state consistent; only play/pause falls back to the media element.
The main process rejects unknown actions, non-integer ids and any `webContents`
that is not a service guest.

**Limits:** pages that never set a Media Session and expose no video/audio
element produce no dock entry. Spotify may report no duration; the dock then
shows a position without a total. Ads played by a site can appear as the track
for their duration if the site updates its metadata.

## Shield: why YouTube ads could reappear

The cached engine in `userData` can predate a change to the curated YouTube
bundle. The bundle had no version marker, so a saved `youtube: true` could sit
in front of an engine compiled before those rules existed.

- `SHIELD_BUNDLE_VERSION` is stored in `kryvex-shield.json`. On launch, a
  mismatch rebuilds from `kryvex-shield-source.txt` (offline, milliseconds) or
  refreshes the lists when that cache is missing.
- The bundle gained player overlays, companion slots, masthead and enforcement
  dialogs, plus network rules for `api/stats/ads`, `get_midroll_info`,
  `ptracking` and the Google ad hosts.
- A small page client on YouTube hosts removes `adPlacements`, `playerAds`,
  `adSlots` and `adBreakHeartbeatParams` from `youtubei/v1/player` responses,
  prunes `ytInitialPlayerResponse`, and skips/clicks an ad that still starts.
  It is injected only for YouTube hosts, never for another site, and never
  touches the media stream.

**Limit:** server-side stitched ads and experiments that never expose an ad
payload can still reach the player. The client-side skip is best-effort; the
**Update lists** button in Settings remains the explicit refresh path, and
`Settings → Shield` shows when the lists were last updated.

## Brand icon

`brand/icons/kryvex.ico` (16–256 px) is the packaged Windows icon and the main
window now sets it explicitly as well as passing it to `BrowserWindow`.
`build.icon` names the same file, so a directory build carries it even when
`win.icon` is not consulted. The installed `C:\Kryvex\Kryvex.exe` and a
packaged `win-unpacked\Kryvex.exe` both extract to the Kx mark
(`screenshots/installed-exe-icon.png`, `screenshots/packaged-exe-icon.png`).

A development run still hosts its window in `electron.exe`, so Windows can
draw the Electron icon for that process until the packaged build is used; a
pinned shortcut created before an icon change also keeps the old image until
the pin is recreated. Neither is a Kryvex icon regression.

## Verification

`node scripts/verify-service-ux.cjs` (after `pnpm build`) starts a disposable
profile and a local media page, then checks:

- the pinned menu opens, is themed and carries all seven actions;
- the resource panel is app-scoped, and closes by outside click and `Escape`;
- the sidebar block can be hidden;
- the dock appears for real playback, pause reaches the guest, and the title
  comes from the page;
- navigating Home leaves the frame rendered, the audio playing, the guest
  reporting `visible` and the dock visible;
- a module set to pause-when-hidden still displays while active, leaves layout
  when parked, and has its audio paused.

The shield path is covered by `electron scripts/verify-shield-filters.cjs`
(engine compiles, scriptlets stay on YouTube hosts) and by unit tests that run
the ad-pruning client against a fake player response.
