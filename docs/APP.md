# Kryvex application architecture (v0.7.0)

This document describes the app that lives in `electron/` and `src/`. It is a
purpose-built Electron application; no third-party desktop workspace is
vendored or rebranded.

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron 44.2.0 (`contextIsolation`, `sandbox`, no Node in renderer) |
| Renderer | React 19 + TypeScript 7, bundled by Vite 8 |
| State | Pure reducer-style helpers in `src/lib/store.ts`, persisted as JSON |
| Styling | One stylesheet driven by CSS custom properties from `brand/tokens.json` |
| Tests | Vitest, 219 unit tests over URL, services, catalogue, store, history, downloads and storage location, page zoom, themes, Windows browser registration, torrent rules and queue restore, media permissions, Rooms ids/invites/limits/presence, window-fit rules, Brave-style URL rules, release-version comparison, asset/checksum validation and update-state rules |
| Shield | `@ghostery/adblocker` over downloaded uBO/EasyList lists, with a combined privacy rewrite pipeline |
| Extensions | Electron `session.extensions` with a guarded ZIP/CRX/folder installer |
| Downloads | Chromium `will-download` events, main-process records, user-selected root, safe file lifecycle |
| Torrents | WebTorrent 3 in the main process, magnet/.torrent input, selected download root, live peer stats, persisted paused queue |
| Voice/video | Per-session permission broker; explicit microphone/camera prompt for webviews |
| Rooms | Trystero (WebTorrent trackers) for signaling, direct WebRTC for chat and video, main-process capture broker with a one-shot shell-only display grant |
| Browser registration | Per-user Default Apps capabilities + `app.setAsDefaultProtocolClient` handoff |
| Packaging | electron-builder (NSIS + portable, Windows), unsigned |
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

1. **Registered** — validated and written to state.
2. **Opening** — `ServiceStage` mounts a frame and its webview; the partition
   attribute is set before the source, and the loading bar renders.
3. **Active** — navigation events update the address display; the session is
   persistent for the lifetime of the profile.
4. **Hidden** — leaving the view hides the frame. The guest keeps running, so
   its gateway, timer and call survive a view change.
5. **Ended** — only the app closing, an explicit session clear, removing the
   module, or the eight-frame LRU eviction unloads a guest. The partition and
   its cookies survive all of those except an explicit clear.

Desktop notifications are granted to service partitions only (see
`electron/service-sessions.ts`), and an http(s) `window.open` from a service
opens a sandboxed child window on the same session. Microphone and camera
grants are per origin for the current app session, not a persisted per-module
capability; a restart forgets them. There is no hibernation or crash isolation
supervisor yet.

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
  }
}
```

Persistence rules:

- Debounced 250 ms, flushed on `beforeunload`.
- Written to `userData/kryvex-state.json` through a temp file + rename.
- 1 MB cap; oversized or malformed payloads are rejected.
- `sanitizeState` drops unsafe ids, non-http URLs, unknown themes, duplicate
  services/history/bookmarks/tabs and orphaned recents, and repairs an active
  tab id that does not match a saved tab. An empty service list stays empty.
- Web preview falls back to `localStorage`.
- The wallpaper image is stored apart from the state: one WebP under
  `userData/wallpaper/` on desktop, `kryvex.wallpaper.v1` in localStorage in
  the web preview. `settings.wallpaper` keeps only `enabled`, `source`, `fit`
  and `veil`; the backdrop stays off until `enabled` is explicitly true, so
  older profiles and new installs paint the theme alone.

## Theme pipeline

1. `brand/themes.json` and `brand/tokens.json` are imported at build time;
   `src/plugins/index.ts` appends plugin themes (the donkey edition).
2. `applyBaseTokens()` writes typography, spacing, radius, motion and shell
   metrics once.
3. `applyTheme(id)` writes the active theme's colours plus derived values
   (`--line-soft`, `--ink-faint`, `--on-accent`, washes) and sets
   `data-theme` / `data-mode`.
4. CSS references only variables — no palette literals in `styles.css`.

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

Electron permits only one `onBeforeRequest` listener per session, so
`electron/web-privacy.ts` installs the single listener after Ghostery enables
its adapter. That listener performs HTTPS upgrades and tracking-parameter
stripping, then delegates unchanged requests to the active blocker. A failed
HTTPS navigation is recorded by URL and `webContents` id; `did-fail-load`
allows one HTTP retry for that exact destination. `electron/brave-rules.ts`
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
remove capability — the call never touches `sandbox`, `contextIsolation`,
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

Open tabs are part of persisted state (`browser.tabs` / `browser.activeTabId`,
validated down to twenty tabs). Tabs reopen by URL after a restart; page content
is not cached, and browser tab partitions stay in-memory, so a restored tab
starts signed out where it was signed in before.

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
| `kryvex:shield:status` | renderer → main | read-only status |
| `kryvex:shield:enabled` | renderer → main | boolean + shell sender only |
| `kryvex:shield:update` | renderer → main | shell sender only |
| `kryvex:shield:option` | renderer → main | option name + boolean + shell sender |
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

## Security decisions

- `will-attach-webview` deletes any page-supplied preload, forces Node off,
  context isolation and sandbox on, and rejects partitions outside the
  allowlist or `src` values that are not http(s). Kryvex's own farbling preload
  is registered on the session after those checks, never from webview markup.
- `app.on('web-contents-created')` blocks non-http navigation inside webviews
  and popups. `window.open` from a recorded service partition becomes a
  sandboxed child window on that same session; from a browser tab it is
  externalised, except background pop-unders, which are denied. The shell
  always externalises.
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
```

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
- Packaging is configured but unsigned; no CI yet. `pnpm pack` is pnpm's tarball
  command — use `pnpm run package:dir` / `package:win`.
