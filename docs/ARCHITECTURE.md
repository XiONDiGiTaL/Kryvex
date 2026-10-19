# Architecture (upstream map + Kryvex deltas)

## Upstream module map (verified)

```
src/index.ts                 Electron main: window, lifecycle, tray/DBus, IPC bootstrap
src/app.tsx / routes.tsx     React root + routing; stores constructed here
src/electron/ipc-api/*       settings, autoUpdate, appIndicator, downloads,
                             clipboard, dnd, focusState, languageDetect,
                             localServer, processManager, sessionStorage
src/electron/Settings.ts     JSON persistence under user-data config/
src/internal-server/*        AdonisJS + SQLite (DB_PATH), migrations, start/migrate
src/api/*                    ServerApi (remote) / LocalApi (IPC-local) composition
src/models/*                 Service, Recipe, RecipePreview, User, DownloadController
src/stores/*                 Services, Recipes, Settings, User, UI, Features, ...
src/features/*               workspaces, quickSwitch, todos, serviceProxy,
                             webControls, appearance, basicAuth, ...
src/webview/*                recipe bridge (window.ferdium) + badge, notifications,
                             contextMenu, darkmode, sessionHandler, zoom, ...
src/lib/Tray.ts, DBus.ts     tray + Linux bus
```

## Kryvex target decomposition (§5)

| Concern | Location (planned) | Notes |
|---|---|---|
| App lifecycle | `src/main/lifecycle.*` | Single-window, state restore, crash recovery |
| Main-process services | `src/main/services/*` | Settings, updates, downloads, indicators |
| Renderer UI | `src/renderer/*` | Rail + sidebar + content + panel, palette |
| Recipe catalog | `src/recipes/*` | Compat with Ferdium recipes + validation |
| Service runtime | `src/services/*` | States: uninit/loading/active/idle/hibernated/restoring/failed |
| Workspaces | `src/workspaces/*` | Org, pin/hide, reorder, per-workspace assignment |
| Themes | `src/themes/*` | Schema, 6 built-ins, import/export, migration |
| Persistence | `src/persistence/*` | JSON + SQLite, versioned migrations |
| Browser | `src/browser/*` | Provider seam (Electron now; §8), tabs/sessions |
| Notifications | `src/notifications/*` | Routing center, per-service prefs |
| Security | `src/security/*` | Isolation, IPC validation, permissions |
| Perf monitor | `src/perf/*` | Dashboard data, hibernation policy engine |
| Import/export | `src/backup/*` | Secrets excluded by default |
| Diagnostics | `src/diagnostics/*` | Redacted log export |
| Updates | `src/updates/*` | Signed-only; unsigned dev builds labeled |

## Hard rules

TypeScript throughout; explicit interfaces; no circular deps; no global
mutable state; no Node in remote content; isolated session per service-group;
browser sessions (persistent vs private) separate from service sessions.
