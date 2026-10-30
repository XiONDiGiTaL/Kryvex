# Kryvex application architecture (v0.8.3)

This document describes the app that lives in `electron/` and `src/`. It is an
Electron application with a small trusted main process and untrusted content.

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron 44.9.3 (`contextIsolation`, `sandbox`, no Node in renderer) |
| Renderer | React 19 + TypeScript 7, bundled by Vite 8 |
| State | Pure reducer-style helpers in `src/lib/store.ts`, persisted as JSON |
| Styling | One stylesheet driven by CSS custom properties from `brand/tokens.json` |
| Tests | Vitest, 219 unit tests over URL, services, catalogue, store, history, downloads and storage location, page zoom, themes, Windows browser registration, torrent rules and queue restore, media permissions, Rooms ids/invites/limits/presence, window-fit rules, URL privacy rules, release-version comparison, asset/checksum validation and update-state rules |
| Shield | `@ghostery/adblocker` over downloaded uBO/EasyList lists, with a combined privacy rewrite pipeline |
| Extensions | Electron `session.extensions` with a guarded ZIP/CRX/folder installer (in-house archive reader that refuses links and escaping paths) |
| Downloads | Chromium `will-download` events, main-process records, user-selected root, safe file lifecycle |
| Torrents | WebTorrent 3 in the main process, magnet/.torrent input, selected download root, live peer stats, persisted paused queue |
| Voice/video | Per-session permission broker; explicit microphone/camera prompt for webviews |
| Rooms | Trystero (WebTorrent trackers) for signaling, direct WebRTC for chat and video, main-process capture broker with a one-shot shell-only display grant |
| Browser registration | Per-user Default Apps capabilities + `app.setAsDefaultProtocolClient` handoff |
| Packaging | electron-builder (NSIS + portable, Windows); signed in the release workflow through SignPath Foundation when its credentials exist, unsigned otherwise |
| Updates | GitHub Releases feed in the main process, checksum-verified Setup download, interactive installer after quit |

## Process model

```text
main (trusted)            preload (sandboxed)        renderer (UI)
─────────────────         ─────────────────────       ─────────────────────────
BrowserWindow             contextBridge               React views
state file (atomic)  ◄──  loadState / saveState  ──►  registry + validation
webview hardening         openExternal                theme + plugin engine
permission policy         appInfo                     command palette
shield + extensions       shield / extension calls    service + browser webviews
URL privacy + farbling    privacy status              settings switches
download manager          download records/actions    downloads/history bookmarks
torrent queue             torrent records/actions     torrent rows + file lists
permission broker         permission prompt response mic/camera prompt
default browser           browser handoff             default-browser status
updater                   update actions              update status/actions
capture routine
                                                        │
                                                        ▼
                                                     remote content (untrusted)
```

Renderer services never see the filesystem. Remote content never sees the
bridge. Main validates every value that crosses a boundary.

## Module contract

A module is a row of the registry, not executable code.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Lowercase URL-safe, ≤64 chars, unique; used for the session partition |
| `name` | string | 2–48 chars on create, ≤80 on load |
| `url` | string | http(s) only, normalised (https added, fragment removed) |
| `category` | enum | `communication`, `productivity`, `development`, `media`, `other` |
| `color` | string | One of eight brand accents |
| `letter` | string | 1–2 letters/digits, derived from the name by default |
| `icon` | string? | Known Simple Icons key; unknown keys are dropped |
| `pinned` | boolean | Shown in the sidebar and on Home |
| `createdAt` | number | Epoch ms |
| `lastOpened` | number? | Epoch ms, updated when opened |

The session partition is derived, never user-supplied:
`persist:svc-<id>` for modules and `browser-<tabId>` (in-memory) for browser
tabs. Both forms are enforced by `will-attach-webview`; browser tabs are
cleared when closed.

### Lifecycle

1. **Registered**: validated and written to state.
2. **Opening**: `ServiceStage` mounts a frame and its webview; the partition
   attribute is set before the source, and the loading bar renders.
3. **Active**: navigation events update the address display; the session is
   persistent for the lifetime of the profile.
4. **Hidden**: leaving the view hides the frame. The guest keeps running, so
   its gateway, timer and call survive a view change. The shared lifecycle in
   `docs/LIFECYCLE.md` decides whether it stays in the background, is muted,
   pauses after an idle interval or is closed; the per-module `persistence`
   flag remains as the override for that module alone.
5. **Ended**: only the app closing, an explicit session clear, removing the
   module, or the eight-frame LRU eviction unloads a guest. The partition and
   its cookies survive all of those except an explicit clear.

Desktop notifications are granted to service partitions only (see
`electron/service-sessions.ts`), and an http(s) `window.open` from a service
opens a sandboxed child window on the same session. Microphone and camera
grants are per origin for the current app session, not a persisted per-module
capability; a restart forgets them. There is no hibernation or crash isolation
supervisor yet.

## Workspace windows

A module can be framed in three places without ever being loaded twice.

| Mode | Where | Geometry |
| --- | --- | --- |
| Focus | the service route | fills the stage |
| Detached | "Float this module" over any view | viewport pixels, only the title bar has to stay reachable |
| Workspace | the Workspace surface | canvas pixels, fully contained by the canvas |

The stage owns every guest. A window is a record, not a copy:
`windows[id] = { kind, rect, z, restore?, minimized? }` in
`src/lib/workspace.ts`, with the arithmetic in `src/lib/floating.ts`. Changing a
window changes its box; the `<webview>` is never remounted, so a module keeps its
scroll position, its call and its connection while it is dragged, resized,
minimized or moved to another view.

**Stacking.** Windows live in a band (`MIN_WINDOW_Z` 30 – `MAX_WINDOW_Z` 45) and
`raise` renumbers the whole map instead of incrementing one counter, so a window
can never climb above Kryvex's own layers: modals 50, palette 60, toasts 70, the
theme gallery 80, the service context menu 90. On the Workspace, the whole board
is one fixed layer at `z-index: 25`, which is what keeps a Kryvex dialog above
live service content.

**Geometry.** A canvas window is clamped inside the canvas on every drag,
resize and surface change, with a 380×280 minimum; a detached float keeps the
older reachability rule so it can hang off-screen. Both are re-clamped on window
resize, on a canvas resize and on a DPR change, because the persisted shape is
CSS pixels.

**Getting a service onto the canvas.** The bar's *Add service* opens the usual
dialog with the Workspace as its target, and a drag drops the same way: a pinned
row or a Services card let go over the canvas opens that service where the
pointer landed, clamped to the surface. What makes the drag work is the effect
it declares. Chromium intersects what a drop target asks for with the source's
`effectAllowed`, and a target that asks for something never offered gets no drop
at all — `dragover` arrives, the `drop` event never does, and the gesture looks
broken rather than refused. A pinned row is the awkward one, because the same
drag reorders the row where it stands (a `move`) or opens it here (a `copy`), so
it declares `copyMove`, and `serviceDropEffect()` in `src/lib/service-drag.ts`
derives the canvas's request from what the source actually allows (falling back
to `move` for a move-only source) instead of demanding `copy`.

**One window per service, placed rather than re-opened.** `openWindow` is a
no-op for a module that already has a record, which is right for opening a
service and wrong for a drop: a module that is currently floating over the app,
or parked in the tray, has to move onto the canvas where it was dropped and come
to the front. `placeOnCanvas()` does that — it converts the record to `canvas`
at the drop point, clears the minimize and the maximize restore, and renumbers
so it is on top. Dropping the same service again moves that one window instead
of stacking a second copy of it.

**Placing an installed service.** The canvas dialog lists what the profile
already has above the catalogue presets, and picking one of those frames that
service without creating a record — which is what placing a window on the canvas
usually means. Adding a service whose site is already installed is not a second
sidebar entry either: `resolveServicePlacement()` in `src/lib/services.ts`
matches on host, so re-picking the Messenger preset from the canvas, or typing
the same address by hand, frames the record the user already has and says so in
a toast. The dialog states the outcome before the save ("…already installed.
Saving opens the one you have instead of adding a second."), so the rule is
never a surprise. A deliberate second copy is the *Allow more than one instance
of this site* switch on the form: each record has its own id and therefore its
own partition, so two copies hold two independent sign-ins. Host equality is
deliberate — `mail.example.com` and `example.com` are different sites.

**Built-in tools, and the ones that must stay single.** *Add service* frames any
of Kryvex's own tools — Lexium, the media player, the secret emulator, Disk
pulse, Kryvex Link, Arcade, File Forge and Canvas — drawn by the same board,
with the same chrome, tray and motion as a service window. Five of them own
something a second copy would duplicate: a server session, an audio graph, a
running core, a polling service or a listening socket. Those are single-instance
(`SINGLETON_TOOL_IDS` in `src/lib/secret-tools.ts`): while a window holds one,
its route shows a card naming the window and offering **Bring it back**, and the
tool's rail entry docks that window rather than opening a second. The window
itself is canvas-bound like any other, so the card is what its route draws while
the tool is over the Workspace. A tool inside a
window drops its own page header — the window already names it, and a Back button
there would offer a route the window cannot take — and the emulator stacks its
panel under the screen when the window is narrow.

**Close and minimize differ.** Closing removes the module from the live set, so
the frame unmounts and the partition's guests are stopped; cookies stay on disk,
so reopening is a visit rather than a sign-in. Minimizing keeps the guest mounted
and merely stops painting it (opacity, `inert`, no pointer events), which is the
same bargain as a parked module; the tray at the bottom of the canvas restores
it.

**Motion.** A window arrives and leaves with an animation chosen on the
Workspace itself (`settings.workspace = { motion, motionSpeed }`, panel in the
Workspace bar): `subtle` is a 170 ms fade with an 8 px rise, `bouncy` is a 260 ms
scale with a slight overshoot, and `none` paints instantly. The frame reads the
duration from `--window-motion`, which is the base duration divided by the speed
(0.5×–2×), so the stylesheet owns the shape and the setting owns only the timing.
Close waits out the exit animation before the shell drops the record; the guest is
never remounted for either. `prefers-reduced-motion` switches all of it off
regardless of the setting.

**Not persisted.** Window geometry is session state like `openIds`: a window that
reappeared at a stale coordinate after a restart would be worse than one that
opens where the surface puts it. In the web build there is no `<webview>`, so the
frame shows the usual "open in this browser" card; the canvas, its drop target
and the window chrome still work.

**The header's Capture button.** The same tool is one click from anywhere: it
reveals the Home capture card if the profile hides it (the card is opt-in),
navigates Home and bumps a pulse the card answers by scrolling itself into view,
ringing once and focusing its target picker. The card stays the place for the
target list, the still/record buttons and the recent captures.

**The whole target, or a dragged area.** The card's scope control starts on
*Whole target*, which is what every capture did before; *An area* asks for a box
the first time and then remembers it. The box is drawn on a **frozen frame**: the
target is armed, one frame is grabbed, and the picker shows that still rather than
the live target (`src/components/CaptureRegionPicker.tsx`). That is what keeps the
result honest — the overlay cannot land inside the picture, because the picture
is the frame taken before the overlay existed. The drag is read back in the
frame's own pixels (`src/lib/capture-region.ts`), so the region survives a
resized window or a different monitor scale; a drag under 24 source pixels is a
click, not a selection.

A still is that frame with the region copied out of it. A **recording** cannot be
cropped after the fact without re-encoding, so it is cropped as it is made: the
target's frames are drawn one by one into a canvas the size of the area, the
canvas is what `MediaRecorder` records, and the target's own audio tracks are
carried across (`cropPipeline()` in `ScreenCaptureWidget.tsx`). Sizes are rounded
to even numbers because VP8/VP9 encode even dimensions; a 719×450 area therefore
records as 718×450. The frame rate is `RECORD_FPS` in `src/lib/screen-capture.ts`.

An area belongs to the target it was drawn on, so picking another target drops
it. If the frame comes back unable to hold a remembered area, the whole target is
captured and the card says the area was dropped (`cropBox()` returns `exact:
false`) instead of quietly cutting a strip out of the picture.

## Capture preview window

A finished capture opens in a native window of its own, the way a snipping tool
shows what it just took. The Home card is a postage stamp for deciding whether to
keep a picture, so it keeps only a thumbnail and the recent list.

| Piece | Where |
| --- | --- |
| Trigger | `ScreenCaptureWidget` sends the bytes over `kryvex:capture:preview` |
| Window | `electron/capture-window.ts`, loading `capture.html` |
| Page | `src/capture-preview/`, its own strings and stylesheet |
| Bridge | `electron/capture-window-preload.ts` → `window.kryvexCapture` |
| Rules | `electron/capture-window-rules.ts`: kind, language, dimensions, window size |

The payload, the controls and the file:

- the still or clip is written once, to `%TEMP%\kryvex-captures`, under an id the
  page is never given; the page receives a `file://` URL of its own payload and is
  deleted when the window closes;
- the window opens at the picture's shape, clamped to 82% of the work area and to
  1180×820, with a default frame for recordings, which report no size;
- **Save as…** opens the native dialog on `Downloads\Kryvex Captures`; main
  copies the temp payload there and reports the path back, so the window can
  print it and offer **Show in folder**; the shell is told too, so the board's
  recent list records a save it never saw;
- **Copy** puts a still on the clipboard through `clipboard.write([ClipboardItem])`
  (Electron 44 dropped `writeImage`); a recording has no single frame, so the
  button is disabled for it;
- **Always on top** pins the window (level `floating`), **Actual size** switches
  between fit and 100%, and **New capture** closes the window, focuses the shell
  and sends `kryvex:capture:ask`, which switches the card on and moves to Home;
- **Esc** closes and **Ctrl+S** saves.

Security: the window is a sandboxed, context-isolated page on a throwaway
in-memory partition, with no Node, no webview and no navigation allowed. Its
preload exposes seven calls that name nothing but the capture main already holds,
and each handler checks `event.sender` against that window. The shell is the only
other sender allowed to open it. The web build has no main process, so the card
keeps its browser download path there instead.

## State

`PersistedState` (schema version 1):

```ts
{
  version: 1,
  services: Service[],
  bookmarks: Bookmark[],
  history: HistoryEntry[],   // max 500, newest first
  settings: {
    themeId, customTheme, density, startView, sidebarCollapsed,
    showStatusBar, searchEngine, confirmBeforeDelete,
    wallpaper: { enabled: false, source: 'gradient', fit: 'cover', veil: 55 },
    assistant: { provider, baseUrl, model } // loopback runtime for Vexium
  },
  recent: string[],  // service ids, most recent first, max 8
  browser: {
    tabs: BrowserTab[],     // max 20, http(s) or an empty new tab
    activeTabId: string | null
  },
  feeds: RssFeed[]        // start-page reader, max 12, http(s) only
}
```

Persistence rules:

- Debounced 250 ms, flushed on `beforeunload`.
- Written to `userData/kryvex-state.json` through a temp file + rename.
- 1 MB cap; oversized or malformed payloads are rejected.
- `sanitizeState` drops unsafe ids, non-http URLs, unknown themes, duplicate
  services/history/bookmarks/tabs/feeds and orphaned recents, and repairs an
  active tab id that does not match a saved tab. An empty service list stays
  empty. Private tabs are never persisted, so a restart cannot reopen one.
- Web preview falls back to `localStorage`.
- The wallpaper image is stored apart from the state: one WebP under
  `userData/wallpaper/` on desktop, `kryvex.wallpaper.v1` in localStorage in
  the web preview. `settings.wallpaper` keeps only `enabled`, `source`, `fit`
  and `veil`; the backdrop stays off until `enabled` is explicitly true, so
  older profiles and new installs paint the theme alone.
- The optional wellness block lives under `settings.home.wellness`: the intake
  values plus one day log capped at 90 entries. XP, levels and streaks are
  derived from that log on read, so there is no second total to drift, and
  `sanitizeWellness` refuses to show the widget without a completed intake.
- The Home board widgets live under `settings.home` beside their on/off flags:
  `screenCaptures` (recent captures the user saved, newest first, 12 items),
  `countdowns` (soonest first, 8 items, each date-only or exact-time),
  `worldClocks` (places with a city, country and IANA zone, up to 4) and
  `clockHour12`. Each list is sanitized on load, so a hand-edited file cannot
  grow a widget past its cap or inject an unknown zone or kind. The calculator,
  capture card, countdowns and clock start switched off: only the clock, weather,
  guide and converter are on for a new workspace.
- The board clock's look is five saved fields: `clockStyle` (`bare`, `card`,
  `mono`, `outline`, `classic`), `clockAccent`, `clockFont`, `clockScale`
  (70-180%, clamped on load) and `clockAlign` (`left`, `centre`, `right`). The
  size multiplies the stylesheet's own `clamp()`, so a large clock still shrinks
  on a narrow board instead of overflowing it, and the alignment applies inside
  the column the clock already occupies rather than moving the board tools.
- The water reminder reads `waterAt` on the day it belongs to. Logging a glass
  silences it for 90 minutes, because a nudge that survives the drink the user
  just logged reads as a stuck card rather than a reminder.

## Theme pipeline

1. `brand/themes.json` and `brand/tokens.json` are imported at build time;
   `src/plugins/index.ts` appends plugin themes (the donkey edition).
2. `applyBaseTokens()` writes typography, spacing, radius, motion and shell
   metrics once.
3. `applyTheme(id)` writes the active theme's colours plus derived values
   (`--line-soft`, `--ink-faint`, `--on-accent`, washes) and sets
   `data-theme` / `data-mode`.
4. CSS references only variables: no palette literals in `styles.css`.

Light mode raises faint text to a readable tone and flips `--on-accent` so
primary buttons keep contrast. Density is a `data-density` attribute, not a
second stylesheet.

## Shield

`electron/shield.ts` owns one compiled `ElectronBlocker`. It loads a cached
engine from `userData/kryvex-shield-engine.bin`, or downloads the six lists
(uBO filters/privacy/badware, EasyList, EasyPrivacy, EasyList Cookie) and
serialises a new one. It attaches to the default session and every partition
discovered through `web-contents-created`. Toggling off disables each session;
refreshing detaches the old engine first.

The curated YouTube bundle is versioned (`SHIELD_BUNDLE_VERSION`). A cached
engine built before the current bundle is rebuilt from
`kryvex-shield-source.txt` on launch, or refreshed online when that cache is
missing, so a saved `youtube: true` cannot point at pre-bundle rules. On YouTube
hosts the shield also injects a small client that removes stitched ad payloads
from `youtubei/v1/player` and skips an ad that still starts; the client is not
injected on any other host. See [SERVICE_UX.md](SERVICE_UX.md).

Electron permits only one `onBeforeRequest` listener per session, so
`electron/web-privacy.ts` installs the single listener after Ghostery enables
its adapter. That listener performs HTTPS upgrades and tracking-parameter
stripping, then delegates unchanged requests to the active blocker. A failed
HTTPS navigation is recorded by URL and `webContents` id; `did-fail-load`
allows one HTTP retry for that exact destination. `electron/url-privacy-rules.ts`
keeps the URL decisions pure and unit-tested.

The Electron adapter registers two global cosmetic-filter IPC handlers per
enabled session. Electron only permits one handler per channel, so the shield
installs a temporary `ipcMain.handle` guard that lets the first registration
through and skips duplicates for later sessions. The handlers are
session-independent, so one copy is correct. This is the only modification to
the adapter's behaviour and is documented in `docs/ATTRIBUTION.md`.

## Fingerprinting and cookie banners

`electron/farbling-preload.ts` is registered as a frame preload on webview
sessions only. It calls `ipcRenderer.sendSync('kryvex:farbling:seed', site)`
before page scripts run, then uses `contextBridge.executeInMainWorld` to wrap
canvas `getImageData`/`toDataURL`/`toBlob`, WebGL `readPixels` and
`AnalyserNode.getFloatFrequencyData`. The seed is an HMAC of the app-launch
secret and the top-level origin. Wrappers perturb only low-order colour bits
and inaudible analysis values, hash the original buffer to select positions,
and preserve native return timing. The trusted shell is never patched.

This is a JavaScript-level approximation, not a Chromium patch. A site can
detect wrapped APIs, and worker/offscreen rendering is not fully covered.
EasyList Cookie hides many consent banners but never clicks a consent choice;
sites that block scrolling behind an overlay may still need manual action.

## Extensions

`electron/extensions.ts` accepts a `.zip`, `.crx` or unpacked folder. It strips
CRX3 headers to the ZIP payload, extracts to a temporary directory, validates
`manifest.json` (MV2/MV3, name, version, 80 MB cap), copies to
`userData/extensions/<key>`, and calls `session.extensions.loadExtension`.
Installed records persist in `kryvex-extensions.json`; enabled extensions attach
to new sessions as they appear. Remove-only paths are checked against the
managed directory. `.xpi` is rejected because Electron is Chromium, not Gecko.

## Chromium engine preferences

`electron/chromium-rules.ts` is the single definition of the engine profile:
defaults, the sanitizer, the launch switches and the mapping onto Chromium web
preferences. It has no Electron imports, so the renderer store
(`src/lib/chromium.ts`), the main process and the unit tests share one contract;
`tests/chromium.test.ts` fails if the two copies of the zoom steps or the
defaults ever drift apart.

The state file is the source of truth at launch. `initChromium(readState())`
runs before `app.whenReady()` and applies `app.disableHardwareAcceleration()`
and `--disable-smooth-scrolling` there, because Chromium cannot change them
later. `nativeTheme.themeSource` follows the preferred colour scheme, which is
the one setting that is live: it changes `prefers-color-scheme` in every page
without a reload.

Page preferences are applied in `will-attach-webview`, after the sandbox,
preload and node assignments, by `applyChromiumPreferences`. They can only
remove capability: the call never touches `sandbox`, `contextIsolation`,
`nodeIntegration` or `preload`. `did-attach-webview` records what each live
guest was built with, and `engineInfo()` reports that snapshot next to the live
URL and zoom factor.

A guest keeps the web preferences it attached with, so a reload changes nothing.
**Rebuild open pages** increments one revision number in `src/App.tsx`; the
service stage and browser tabs key their `<webview>` elements on it, which
remounts each guest and makes Chromium attach the current profile. Sessions are
partitions, so a rebuild keeps cookies, storage and sign-in.

Default zoom is attached as `zoomFactor`, which Chromium stores with the
session's per-origin zoom map: a site that was already zoomed keeps its level
until its session is cleared. A `colorScheme` change needs no rebuild.

## Browser library and downloads

`electron/downloads.ts` listens to `will-download` on every tracked session. It
ows the `DownloadItem`, chooses a collision-safe path under the configured
download root, and publishes a `DownloadRecord` (filename, source, progress,
state, timestamps). The renderer receives records through
`kryvex:downloads:changed` and can call pause, cancel, open-file, show-in-folder,
remove or delete-file by tracked ID. Delete-file is limited to paths the manager chose
inside a retained managed root; the renderer never supplies a path. A completed `.torrent`
download is handed to the torrent queue once, without changing the normal
download record. Completed and interrupted records are written atomically to
`userData/kryvex-downloads.json` by `electron/download-rules.ts`-validated data,
so the Downloads tab is a real library rather than a per-session list. A
download that was live when the app stopped is shown as interrupted, not
running.

`electron/storage.ts` owns the user-selected root. It persists
`userData/kryvex-storage.json` atomically, validates absolute paths against a
writable directory, and keeps a bounded list of previously used roots. The
default is Electron's Downloads folder. The Settings row uses a native folder
picker; the main process, not the renderer, receives and normalises the
selected path. New regular downloads use the current root; rows saved before a
change remain openable and deletable because their old root is retained.

`electron/torrents.ts` owns a persisted WebTorrent queue behind the same
Downloads tab. Magnet links are validated (`urn:btih`, 40-hex or 32-base32,
maximum 16 KiB) and `.torrent` files are limited to 10 MB. Every new torrent
gets a managed folder under `<download root>/Kryvex Torrents`; the renderer
never supplies a path. The queue exposes progress, downloaded/uploaded bytes,
down/up speed,
ratio, remaining time, connected peers, seeders, leechers, active protocol
badges, trackers and a capped file list. Pause stops new wires and closes the
current ones; resume re-announces to trackers. Remove can keep data or delete
only the managed folder.

Queue records are written atomically to `userData/kryvex-torrents.json` (4 MB
cap). Original `.torrent` metadata is copied to
`userData/kryvex-torrent-metadata/<id>.torrent`, so the source file can be moved
or deleted. On launch, `torrents.init()` validates those records, checks every
restored path is inside one of the retained managed torrent roots, forces each
row to `paused`, clears live speeds and peer counters, and does **not**
construct a WebTorrent client. Changing the download location therefore does
not strand a queue row that was added earlier. Resume is the only path that hydrates a row: it loads the saved `.torrent` (or
magnet), verifies the existing pieces, and only then starts discovery. The
queue is capped at 25.

`src/views/Browser.tsx` keeps a side panel with Downloads, History and
Bookmarks tabs. Torrent controls live inside Downloads; there is no standalone
torrent page, search engine or directory. History is a capped `HistoryEntry[]`
in persisted state, added on `did-navigate` and sanitised on load. Bookmarks
remain in the same state file. The browser also accepts
`#/browser?url=<http(s)>` to open a page in a tab.

## Browser start page and private tabs

The home button at the left of the browser toolbar returns the active tab to
`BrowserStart`, the default start page. It is a renderer view rather than a
remote home URL, so it has no web history entry behind it. The page is built
from four cards in the app's own type, radius and token language:

- **Shield / live**: session request count, compiled filter count, HTTPS
  upgrades, stripped tracking parameters, list count and update date. It polls
  the existing `kryvex:shield:status` bridge every 15 seconds while visible.
- **Field guide**: the browser shortcuts and session model that are actually
  implemented, not aspirational copy.
- **Feeds / local reader**: add an RSS or Atom URL, or import an OPML export,
  and read the merged stories here. Feeds live in `PersistedState.feeds`.
- **Workspace / quick launch**: pinned modules and bookmarks open in the tab.

Private tabs are created from the browser options menu (`New private tab`) or
`Ctrl+Shift+N`. They are marked with the mask in the tab strip and get their own
start-page variant. A private tab never writes to Kryvex history and is filtered
out of the saved browser session, so reopening the app cannot restore it.
Downloads still reach disk (as in Chromium), and every browser tab already uses
an in-memory partition, so a private tab is not granted a *weaker* isolation
claim than an ordinary one. **Close private tabs** in the menu drops the live
controllers and clears their partitions immediately; it is disabled when none
are open.

### Feed fetching and parsing

`src/lib/rss.ts` is a tolerant RSS 2.0 / Atom parser: CDATA, named and numeric
entities, Atom `rel="alternate"` links, relative item URLs, permalink GUIDs,
missing channel titles and undated items. It drops items without an http(s)
link, caps each feed at 12 items and never injects feed markup into the page:
titles and summaries are stripped to text. `mergeFeedItems` deduplicates stories
syndicated by two feeds and sorts newest first. OPML import reads every
`<outline xmlUrl=…>` and deduplicates by URL; feeds are persisted only after
`normalizeFeedUrl` and `sanitizeFeeds` accept them.

The network request happens in the main process (`electron/rss.ts`), so the
renderer is not subject to CORS. `feedRequestUrl` accepts only http(s), rejects
credentials, a hostname without a domain and input over 2048 characters. The
fetch has a 10-second timeout, follows redirects, sends a generic Kryvex user
agent, and rejects a declared or actual body over 2 MB. A response that is not
shaped like RSS/Atom/RDF is reported instead of being parsed. The renderer only
receives text; no filesystem path or cookie crosses the bridge.

The web preview has no main process, so it falls back to `fetch` and may be
blocked by a feed's CORS policy; the UI reports that feed as unavailable rather
than failing the page.

Open tabs are part of persisted state (`browser.tabs` / `browser.activeTabId`,
validated down to twenty tabs). Tabs reopen by URL after a restart; page content
is not cached, and browser tab partitions stay in-memory, so a restored tab
starts signed out where it was signed in before. Popup tabs are never persisted:
they belong to a live window.

Popups stay inside Kryvex. `electron/popup-tabs.ts` claims a browser tab's
`window.open` (http(s) or `about:blank`, never a background pop-under) and lets
Chromium create its real popup window, so `window.opener`, `postMessage` and the
tab's cookie partition all survive: the part that breaks when a sign-in window
leaves for the system browser. The window is frameless, taskbar-hidden and
parented to the shell, and it is positioned over `.browser-canvas` using the
rectangle the renderer reports; the tab strip shows it as a popup tab with the
page's own title. Selecting another tab hides it, selecting the popup shows it,
and `window.close()` removes the tab and returns to the opener. The address bar,
back/forward and reload act on the popup through IPC. Service modules keep the
plain child sign-in window they already had, because their popups belong beside
the service stage.

Electron cannot move an allowed popup's `webContents` into a tab (adopting it
into a `WebContentsView` fails with "already attached to a window"), which is why
the page is a real window placed over the canvas rather than a tab in the DOM.
The trade-off is z-order: a shell modal opened while a popup is visible can
appear behind it.

`Ctrl+F` opens find-in-page for the active tab (`findInPage` / `stopFindInPage`
on the webview), with match counts and next/previous. `Ctrl +`/`Ctrl -` step the
page zoom through fixed factors and `Ctrl 0` resets it; the toolbar shows the
current factor and resets on click.

## Media permissions

`electron/permissions.ts` brokers `media` requests from webviews. The session
policy still denies geolocation, notifications, USB/HID/serial, display capture
and every other permission. A microphone/camera request is sent to the trusted
shell with its validated HTTP(S) origin and requested devices; the page waits
for the user's answer. Allow records only those devices for that origin until
Kryvex exits. Block calls the Chromium callback with `false`, so the page sees a
normal `getUserMedia` denial. The check handler reports existing grants only and
requires both devices when Chromium omits a media type.

## Default browser

`electron/default-browser.ts` reports `app.isDefaultProtocolClient('http')` and
`https`, registers both only from the installed Windows build on an explicit
button press, and opens `ms-settings:defaultapps` for the final confirmation.
`electron/windows-browser.ts` writes the per-user `RegisteredApplications` and
`Clients\StartMenuInternet\Kryvex` capability keys that make Kryvex selectable;
protocol commands alone are not enough on Windows 10/11.
`process.argv` and the `second-instance` event are filtered for http(s) URLs and
handed to the renderer; `takeBrowserUrls()` drains URLs queued before the
renderer mounted. Kryvex never changes the system default silently.

## Start with Windows

`electron/startup.ts` reads and writes the per-user Windows `Run` entry through
`app.getLoginItemSettings` / `app.setLoginItemSettings`. The registry value is
the state: the switch in Settings shows what Windows will actually do, so an
entry removed by hand in Task Manager turns the switch off instead of leaving a
stale copy behind.

The path is the part that needs care. An installed copy registers its own
executable; a portable copy registers `PORTABLE_EXECUTABLE_FILE` (the file the
user launches) rather than the temporary folder Electron reports as
`process.execPath`, and a stale variable that no longer points at a file is
ignored. Nothing is written from an unpackaged run: that entry would start the
Electron binary with no project, so the switch is disabled there and
`startupSet` refuses. The entry is written only when the switch is used, and it
is removed by the same switch, not by quitting.

## IPC surface

| Channel | Direction | Validation |
| --- | --- | --- |
| `kryvex:state:load` | renderer → main | returns `unknown`, renderer sanitises |
| `kryvex:state:save` | renderer → main | object, ≤1 MB, atomic write |
| `kryvex:wallpaper:load` | renderer → main | shell sender, returns one image |
| `kryvex:wallpaper:save` | renderer → main | shell sender, raster base64 data URL ≤8 MB, magic-byte check, atomic write |
| `kryvex:wallpaper:clear` | renderer → main | shell sender, deletes only `wallpaper.*` |
| `kryvex:assistant:probe` | renderer → main | shell sender, loopback http origin only |
| `kryvex:assistant:chat` | renderer → main | shell sender, validated request ≤40 messages, streamed back as deltas |
| `kryvex:assistant:cancel` | renderer → main | shell sender, tracked request id |
| `kryvex:chromium:info` | renderer → main | shell sender; read-only engine report (version, GPU status, switches, live guests) |
| `kryvex:chromium:set` | renderer → main | shell sender; the whole profile is sanitised by `sanitizeChromium`, unknown fields dropped |
| `kryvex:app:info` | renderer → main | none needed |
| `kryvex:open-external` | renderer → main | http(s) only |
| `kryvex:startup:status` | renderer → main | none needed; returns booleans only |
| `kryvex:startup:set` | renderer → main | shell sender, boolean required, refused unless the entry would open Kryvex |
| `kryvex:shield:status` | renderer → main | read-only status |
| `kryvex:shield:enabled` | renderer → main | boolean + shell sender only |
| `kryvex:shield:update` | renderer → main | shell sender only |
| `kryvex:shield:option` | renderer → main | option name + boolean + shell sender |
| `kryvex:media:list` | renderer → main | shell sender; sanitized guest media states |
| `kryvex:media:control` | renderer → main | shell sender, tracked guest id + one of `play/pause/next/previous` |
| `kryvex:resources:sample` | renderer → main | shell sender; Kryvex process metrics only |
| `kryvex:farbling:seed` | webview preload → main (sync) | webview sender, http(s) site key, in-memory HMAC seed |
| `kryvex:extensions:list` | renderer → main | read-only records |
| `kryvex:extensions:install` | renderer → main | shell sender, native file dialog |
| `kryvex:extensions:install-folder` | renderer → main | shell sender, native folder dialog |
| `kryvex:extensions:enabled` | renderer → main | key + boolean + shell sender |
| `kryvex:extensions:remove` | renderer → main | key + shell sender |
| `kryvex:downloads:list` | renderer → main | read-only records |
| `kryvex:downloads:pause` | renderer → main | tracked ID + shell sender |
| `kryvex:downloads:cancel` | renderer → main | tracked ID + shell sender |
| `kryvex:downloads:show` | renderer → main | tracked ID + shell sender |
| `kryvex:downloads:remove` | renderer → main | tracked ID + boolean + shell sender |
| `kryvex:downloads:clear` | renderer → main | shell sender only |
| `kryvex:torrents:list` | renderer → main | read-only records |
| `kryvex:torrents:add-magnet` | renderer → main | shell sender, validated magnet |
| `kryvex:torrents:add-file` | renderer → main | shell sender, native file dialog |
| `kryvex:torrents:pause` / `resume` / `show` | renderer → main | tracked ID + shell sender |
| `kryvex:torrents:remove` | renderer → main | tracked ID + boolean + shell sender |
| `kryvex:permissions:respond` | renderer → main | prompt ID + boolean + shell sender |
| `kryvex:torrents:changed` | main → renderer | display records only |
| `kryvex:torrents:notice` | main → renderer | stable message + tone |
| `kryvex:browser:magnet` | main → renderer | validated magnet URI |
| `kryvex:permissions:request` | main → renderer | origin + requested devices |
| `kryvex:permissions:resolved` | main → renderer | prompt ID |
| `kryvex:browser:default-status` | renderer → main | read-only status |
| `kryvex:browser:default-set` | renderer → main | shell sender only |
| `kryvex:browser:default-settings` | renderer → main | shell sender only |
| `kryvex:browser:pending-urls` | renderer → main | shell sender only |
| `kryvex:services:clear-session` | renderer → main | shell sender, `persist:svc-*` partition only |
| `kryvex:services:notifications` | renderer → main | shell sender, boolean |
| `kryvex:attention` | renderer → main | shell sender, boolean; taskbar flash only |
| `kryvex:browser:open-url` | main → renderer | validated http(s) URL |
| `kryvex:downloads:changed` | main → renderer | display records only |
| `kryvex:update:status` | renderer → main | shell sender, read-only status |
| `kryvex:update:check` | renderer → main | shell sender, fixed GitHub feed |
| `kryvex:update:download` | renderer → main | shell sender, release asset chosen by main |
| `kryvex:update:install` | renderer → main | shell sender, packaged installed build only |
| `kryvex:update:reveal` | renderer → main | shell sender, downloaded path only |
| `kryvex:update:release-page` | renderer → main | shell sender, GitHub release page |
| `kryvex:update:changed` | main → renderer | phase, versions, progress, error code |
| `kryvex:capture:preview` | renderer → main | shell sender, base64 validated by `capture-rules`, written to the temp folder only |
| `kryvex:capture:window:info` / `:save` / `:copy` / `:reveal` | preview window → main | preview sender only, the capture it is already showing |
| `kryvex:capture:window:pin` / `:new` / `:close` | preview window → main | preview sender only, boolean or no payload |
| `kryvex:capture:ask` / `kryvex:capture:saved` | main → renderer | no payload / the saved capture's display fields |

## Security decisions

- `will-attach-webview` deletes any page-supplied preload, forces Node off,
  context isolation and sandbox on, and rejects partitions outside the
  allowlist or `src` values that are not http(s). Kryvex's own farbling preload
  is registered on the session after those checks, never from webview markup.
- `app.on('web-contents-created')` blocks non-http navigation inside webviews
  and popups. `window.open` from a recorded service partition becomes a
  sandboxed child window on that same session. From a browser tab it becomes an
  in-app popup tab on the same session, placed over the canvas; background
  pop-unders and non-http(s) URLs are denied. The shell always externalises.
- Permissions are denied except clipboard-sanitized-write, fullscreen, an
  explicit microphone/camera grant and notifications for a service partition
  while **Settings → Service apps → Desktop notifications** is on. Media
  requests are origin-scoped, in memory and shown in the trusted shell; other
  devices stay denied.
- The app sets a Chrome-shaped `userAgentFallback` at launch so services do not
  classify the embedded browser as Electron.
- Magnet navigation is validated, prevented from reaching Chromium's external
  protocol handler and forwarded to the shell. Torrent folders and IDs are
  chosen by main, not the renderer.
- The shell window refuses navigation away from its own document.
- `contextBridge` exposes a fixed typed API; there is no generic `ipcRenderer`.
  Shield, extension, download and browser mutations verify the sender is the
  shell window.
- Update checks use a fixed GitHub endpoint. Asset hosts, version-matched
  file names and a mandatory SHA-256 list are validated in the main process;
  the renderer can only ask for a check, download, install or reveal.
- Extension packages, filter-list URLs and download paths never come from
  renderer input; the main process owns all three.

## Build and capture

```bash
pnpm build     # dist/ + dist-electron/
pnpm start     # launch built app
pnpm capture   # build, launch with KRYVEX_CAPTURE=1, write screenshots/
pnpm verify:updater  # local release feed, checksum rejection, source-mode guard
pnpm art:installer   # redraw build/installerSidebar.bmp from the brand tokens
```

### Installer artwork

NSIS shows two images the app never draws, and `scripts/installer-art.ps1`
paints both from the brand tokens: `build/installerSidebar.bmp` (164×314) beside
the finish page, and `build/installerHeader.bmp` (150×57) in the header of every
other page. Both are 24-bit, the format NSIS reads, and both are drawn at their
own size rather than scaled down from the 512px tile: the plate colour, the
signal squares, the `Kx` mark redrawn from `brand/logo.svg`'s stroke geometry,
the divider, and the wordmark with its tracking. The header keeps only the mark
and the wordmark, because a second line crowds it against the page rule.
`-Preview <dir>` writes PNG copies for review, since a bitmap is awkward to look
at. `nsis.installerSidebar` and `nsis.installerHeader` in `package.json` point at
the files; regenerate them when the palette or the lockup changes.

The capture routine drives real routes (`#/home`, `#/home?help=1`,
`#/services`, `#/services?dialog=new`, `#/service/<id>`, `#/browser?newtab=1`,
`#/browser?panel=downloads`, `#/browser?url=…&panel=history`, `#/settings`,
`#/settings?section=updates`, the Custom theme panel opened by clicking
`.theme-card.is-custom`, the XiØN tile clicked straight in the table
(`[data-theme="special-xion"]`), data/shield/browser/wallpaper scroll
positions, `#/home?palette=1`, the Crimson tile, the gems band and the planets
band, and `#/home?theme=…` for `special-donkey` and `special-xion`), waits for
each view,
and captures the window with `webContents.capturePage()`. It writes twenty-four
1440×900 images. `pnpm capture` therefore doubles as a smoke test: the app must
boot and render every route before screenshots exist.

## Known gaps

- No module hibernation.
- Torrent rows restore paused, but no bandwidth scheduler, ratio limit,
  per-file selection or sequential-download toggle exists.
- No custom-theme import/export; themes are 78 catalogue entries plus two
  creator plugins and the generated Custom theme.
- Shield is list-based; there is no per-site exception UI, custom filter editor,
  or request inspector. uBO's MV2 extension network layer is inert in Electron.
- Fingerprint farbling is a preload wrapper, not a Chromium patch. It covers
  main-thread canvas/WebGL/analyser readbacks and is stable per site, but
  workers, offscreen contexts and determined detection are documented gaps.
- HTTPS upgrades cover top-level GET navigations only; subresource upgrades and
  interstitial warnings are not implemented.
- Extensions are Chrome-compatible only; Firefox XPI is rejected. The Chrome
  Web Store's own install button cannot run inside Electron, so Kryvex shows
  its own install bar on detail pages and downloads the CRX directly.
- Capture mode leaves a 138 px gap in the header where native window controls
  sit in the live app (they are not part of the captured web contents).
- Packaging is configured and unsigned by default; the release workflow signs
  through SignPath Foundation only when its credentials exist, and the position is
  recorded in [CODE_SIGNING.md](CODE_SIGNING.md). `pnpm pack` is pnpm's tarball
  command: use `pnpm run package:dir` / `package:win`.
