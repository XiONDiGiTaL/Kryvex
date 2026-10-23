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

Each module row also has a **Kill** button. It is a two-press action: the first
press arms it for four seconds, the second ends the module. `serviceSessions.stop`
closes every guest in that partition with `waitForBeforeUnload: false`, so a
stuck page cannot veto the stop, and the shell then removes the frame and leaves
the module's view. Cookies and storage survive, so reopening it is a normal visit
with the same sign-in; **Clear session** remains the destructive action.

**Limit:** Windows does not expose total GPU utilisation to Electron. `GPU
PROCESS` is Chromium's GPU process CPU/memory, labelled as such.

## Pinned service menu

Right-clicking a pinned service opens a themed menu rendered by the app, not a
native OS popup, so it inherits the active palette, radius and blur. It offers:

- **Open** and **Edit service**
- **Mute sound**: the module's audio, without touching the site's own setting
- **Notifications**: per-service desktop notifications
- **Keep running in the background**: `keep` or `pause`
- **Unpin**
- **Remove**: still goes through the confirmation setting

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

The transport lives in the status bar on every view. At rest it is a
low-contrast strip, so it never floats over the workspace:

- 16 px artwork, service name, title, elapsed / total time and a thin progress
  line
- play / pause, sent into the guest with `kryvex:media:control`
- hovering the strip, or focusing it and pressing the chevron, opens the island
  just above the bar
- after about four seconds without pointer or keyboard activity the strip
  fades out and stops taking clicks, so the bar is completely clear
- moving the pointer within 96 px of the bottom edge brings it back; the strip
  stays awake while the pointer moves along that edge and fades again once the
  pointer stops or moves into a service guest
- `Escape`, the island's close button, or moving the pointer away closes it;
  the chevron pins it for touch and keyboard use

The island adds the full set of controls:

- previous / play-pause / next
- repeat, which loops the clip the page is playing when it ends
- mute and a volume slider, 0 to 100%
- source switcher when more than one service is playing
- open the owning service
- artwork, title, artist and elapsed / total time

Volume and repeat are page-level, not transport actions. Changing either runs a
small guard in every service guest: it applies the volume to the current media
element and to every later `play`, and on `ended` it rewinds and restarts the
same clip. A player that refuses the restart (`play()` rejects) reloads the page
instead, which is the YouTube loop a user expects. The guard is installed only
after the user changes something, so a page keeps its own volume and looping
until then. Both values are stored in `settings.player.serviceVolume` and
`serviceRepeat`, and the shell pushes them again on launch.

When the status bar is hidden, the same dock falls back to a floating island
above the bottom edge so playback stays reachable.

Controls click the site's own button first (`.ytp-play-button`,
`control-button-playpause`, SoundCloud's `.playControl`), because that keeps
the site's state consistent; only play/pause falls back to the media element.
The main process rejects unknown actions, non-integer ids and any `webContents`
that is not a service guest.

**Limits:** pages that never set a Media Session and expose no video/audio
element produce no dock entry. Spotify may report no duration; the dock then
shows a position without a total. Ads played by a site can appear as the track
for their duration if the site updates its metadata. Volume is applied to media
elements, not to the site's own volume slider, and a page can replace its
elements faster than a sample observes them; the capture-phase `play` listener
is what keeps the chosen level applied to the next track.

## Spotify ads (opt-in)

`electron/spotify-ads.ts` handles one narrow case, and only after Settings →
Service playback → **Mute Spotify ads and try to skip them** is switched on. It
does nothing on any other host and nothing for a Spotify guest while the switch
is off.

- Every 1.2 s the main process asks the guest's player for four values
  (`electron/spotify-rules.ts`): whether an ad is showing, whether the context
  is a podcast, whether it is a track page where Next is safe, and whether
  Spotify is offering a Skip ad control. The probe
  reads bar markers such as `context-item-info-ad-subtitle`, the exact label
  `Advertisement`, podcast markers such as `context-item-info-show`, and the
  Media Session title and album. A permanent sidebar ad slot is deliberately
  ignored so it cannot silence a song.
- While an ad is detected the guest is muted with
  `webContents.setAudioMuted(true)`. The guard records that it borrowed the
  mute, so a module the user muted in its own header stays muted when the ad
  ends. The mute is restored to `settings.player` policy, not blindly to full
  volume.
- A track, album or playlist page may use Spotify's own
  `control-button-skip-forward`, which is the same action a manual Next would
  send. A podcast break does not: Next would leave the episode, so the guard
  only clicks an explicit `control-button-skip-ad`, `ad-skip-button` or a
  button labelled Skip ad. An unclear context is treated the same way. A
  podcast with no such control is muted and left to continue.
- Every skip control is attempted at most once every twenty seconds, and a
  disabled or `aria-disabled` button is respected.
- Navigation, toggling the switch and guest destruction all stop the timer and
  release a borrowed mute. No request is blocked, no cookie is read and no
  audio is downloaded: the page is simply quiet while its label says ad.

**Limits:** detection depends on Spotify's labels, so an unlabelled ad, a
host-read segment inside a podcast or a redesign plays normally. A podcast ad
without an explicit Skip ad control is muted only; the guard never advances
past the episode. Skipping is best effort because Spotify can mark an ad
unskippable. The guard runs in the main process, so the web preview has no
equivalent; the setting is saved but inert there. It is not part of Shield and
does not interact with filter lists.

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
- the volume slider reaches the page's media element (0.4 after moving it to
  40%), the repeat guard carries that level, and a clip with its own looping
disabled restarts from the beginning when the repeat toggle is on;
- **Kill** arms on the first press without stopping anything, ends only the
  chosen module on the second, returns to Services, and leaves the other open
module mounted;
- navigating Home leaves the frame rendered, the audio playing, the guest
  reporting `visible` and the dock visible;
- a module set to pause-when-hidden still displays while active, leaves layout
  when parked, and has its audio paused.

The shield path is covered by `electron scripts/verify-shield-filters.cjs`
(engine compiles, scriptlets stay on YouTube hosts) and by unit tests that run
the ad-pruning client against a fake player response.
