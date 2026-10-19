# Kryvex application architecture (v0.3.0)

This document describes the app that lives in `electron/` and `src/`. It is
deliberately separate from `ARCHITECTURE.md`, which maps the Ferdium upstream
that was analysed as reference; Kryvex does not ship that code.

## Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron 44.2.0 (`contextIsolation`, `sandbox`, no Node in renderer) |
| Renderer | React 19 + TypeScript 7, bundled by Vite 8 |
| State | Pure reducer-style helpers in `src/lib/store.ts`, persisted as JSON |
| Styling | One stylesheet driven by CSS custom properties from `brand/tokens.json` |
| Tests | Vitest, 40 unit tests over URL, services, catalogue, store, themes |
| Shield | `@ghostery/adblocker` over downloaded uBO/EasyList lists |
| Extensions | Electron `session.extensions` with a guarded ZIP/CRX/folder installer |
| Packaging | electron-builder (NSIS + portable, Windows), unsigned |

## Process model

```text
main (trusted)            preload (sandboxed)        renderer (UI)
─────────────────         ─────────────────────       ─────────────────────────
BrowserWindow             contextBridge               React views
state file (atomic)  ◄──  loadState / saveState  ──►  registry + validation
webview hardening         openExternal                theme + plugin engine
permission policy         appInfo                     command palette
shield + extensions       shield / extension calls    service + browser webviews
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
`persist:svc-<id>` for modules, `persist:browser-<tabId>` for browser tabs.
Both are enforced by `will-attach-webview`.

### Lifecycle

1. **Registered** — validated and written to state.
2. **Opening** — the service view mounts a webview; the loading bar renders.
3. **Active** — navigation events update the address display; the session is
   persistent for the lifetime of the profile.
4. **Closed** — leaving the view destroys the webview element; the partition and
   its cookies survive.

There is no hibernation, crash isolation supervisor, or per-module permission
grant yet. Those are roadmap items; do not describe them as implemented.

## State

`PersistedState` (schema version 1):

```ts
{
  version: 1,
  services: Service[],
  bookmarks: Bookmark[],
  settings: {
    themeId, density, startView, sidebarCollapsed,
    showStatusBar, searchEngine, confirmBeforeDelete
  },
  recent: string[]   // service ids, most recent first, max 8
}
```

Persistence rules:

- Debounced 250 ms, flushed on `beforeunload`.
- Written to `userData/kryvex-state.json` through a temp file + rename.
- 1 MB cap; oversized or malformed payloads are rejected.
- `sanitizeState` drops unsafe ids, non-http URLs, unknown themes, duplicate
  services and orphaned recents. An empty service list stays empty.
- Web preview falls back to `localStorage`.

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
engine from `userData/kryvex-shield-engine.bin`, or downloads the five lists
(uBO filters/privacy/badware, EasyList, EasyPrivacy) and serialises a new one.
It attaches to the default session and every partition discovered through
`web-contents-created`. Toggling off disables each session; refreshing detaches
the old engine first.

The upstream Electron adapter registers two global cosmetic-filter IPC
handlers per enabled session. Electron only permits one handler per channel,
so the shield installs a temporary `ipcMain.handle` guard that lets the first
registration through and skips duplicates for later sessions. The handlers are
session-independent, so one copy is correct. This is the only modification to
the adapter's behaviour and is documented in `docs/ATTRIBUTION.md`.

## Extensions

`electron/extensions.ts` accepts a `.zip`, `.crx` or unpacked folder. It strips
CRX3 headers to the ZIP payload, extracts to a temporary directory, validates
`manifest.json` (MV2/MV3, name, version, 80 MB cap), copies to
`userData/extensions/<key>`, and calls `session.extensions.loadExtension`.
Installed records persist in `kryvex-extensions.json`; enabled extensions attach
to new sessions as they appear. Remove-only paths are checked against the
managed directory. `.xpi` is rejected because Electron is Chromium, not Gecko.

## IPC surface

| Channel | Direction | Validation |
| --- | --- | --- |
| `kryvex:state:load` | renderer → main | returns `unknown`, renderer sanitises |
| `kryvex:state:save` | renderer → main | object, ≤1 MB, atomic write |
| `kryvex:app:info` | renderer → main | none needed |
| `kryvex:open-external` | renderer → main | http(s) only |
| `kryvex:shield:status` | renderer → main | read-only status |
| `kryvex:shield:enabled` | renderer → main | boolean + shell sender only |
| `kryvex:shield:update` | renderer → main | shell sender only |
| `kryvex:extensions:list` | renderer → main | read-only records |
| `kryvex:extensions:install` | renderer → main | shell sender, native file dialog |
| `kryvex:extensions:install-folder` | renderer → main | shell sender, native folder dialog |
| `kryvex:extensions:enabled` | renderer → main | key + boolean + shell sender |
| `kryvex:extensions:remove` | renderer → main | key + shell sender |

## Security decisions

- `will-attach-webview` deletes any preload, forces Node off, context isolation
  and sandbox on, and rejects partitions outside the allowlist or `src` values
  that are not http(s).
- `app.on('web-contents-created')` sends `window.open` to the system browser
  after protocol validation and blocks non-http navigation inside webviews.
- Permissions are denied except clipboard-sanitized-write and fullscreen.
- The shell window refuses navigation away from its own document.
- `contextBridge` exposes a fixed typed API; there is no generic `ipcRenderer`.
  Shield and extension mutations verify the sender is the shell window.
- Extension packages and filter-list URLs never come from renderer input; the
  main process owns both paths.

## Build and capture

```bash
pnpm build     # dist/ + dist-electron/
pnpm start     # launch built app
pnpm capture   # build, launch with KRYVEX_CAPTURE=1, write screenshots/
```

The capture routine drives real routes (`#/home`, `#/home?help=1`,
`#/services`, `#/services?dialog=new`, `#/service/<id>`, `#/browser?newtab=1`,
`#/settings`, shield/plugin scroll positions, `#/home?palette=1`,
`#/home?theme=…`), waits for
each view, and captures the window with `webContents.capturePage()`. It writes
thirteen 1440×900 images. `pnpm capture` therefore doubles as a smoke test: the
app must boot and render every route before screenshots exist.

## Known gaps

- No hibernation, downloads shelf, history manager, find-in-page, or zoom UI.
- No custom-theme import/export; themes are six built-ins plus one plugin.
- Shield is list-based; there is no per-site exception UI, custom filter editor,
  or request inspector. uBO's MV2 extension network layer is inert in Electron.
- Extensions are Chrome-compatible only; Firefox XPI is rejected, and the
  Chrome Web Store cannot be installed from inside Electron.
- Capture mode leaves a 138 px gap in the header where native window controls
  sit in the live app (they are not part of the captured web contents).
- Packaging is configured but unsigned; no CI yet. `pnpm pack` is pnpm's tarball
  command — use `pnpm run package:dir` / `package:win`.
