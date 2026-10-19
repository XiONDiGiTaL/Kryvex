# Upstream Analysis — Ferdium (reference-only)

Clone: `X:\Veyra\upstream\ferdium-app`, branch `develop`, shallow.
`package.json`: version `7.2.4-nightly.3`, engines `{node 24.20.0,
pnpm 12.3.4}`, `packageManager pnpm@12.3.4`. Latest stable per Releases page:
7.2.3. License: Apache-2.0 (`LICENSE.md`). All paths below are relative to
the upstream clone; line numbers verified 2026-10-19.

## 1. Entry points & startup

- Main process: `src/index.ts` — app lifecycle, main `BrowserWindow`, window
  state, deep links, permissions, tray (`src/lib/Tray.ts`), Linux D-Bus
  (`src/lib/DBus.ts`). Debug via `src/preload-safe-debug.ts`.
- Renderer boot: `src/app.tsx` — constructs API + MobX stores, mounts routed
  UI (`src/routes.tsx`, `src/containers/`, `src/components/` — 9 component
  dirs, 4 container dirs).
- Dev/build scripts: `dev` (esbuild watch, `esbuild.mjs`), `start`
  (`electron ./build`), `build` (preval-build-info + esbuild +
  electron-builder), `typecheck` (`tsc --noEmit`), `test` (jest, roots
  `src/` + `test/`, env node, ignores `src/internal-server`), `lint`
  (eslint, zero warnings), `biome:check`, translations
  (`extract`/`compile` via formatjs).

## 2. Electron main process & security posture (inherited risk)

- Main window webPreferences (`src/index.ts:282-284`):
  `nodeIntegration: true`, `contextIsolation: false`, `webviewTag: true`,
  no `preload` on the main window.
- Separate hardened popup preload: `src/webview/webauthn-popup-preload.js`
  wired at `src/index.ts:376-381` with `contextIsolation: true` + sandbox.
- Service bridge: `src/webview/recipe.ts` exposes `window.ferdium` via
  `contextBridge` (badges, dialog titles, notifications) and IPC to host.
  Recipe guide states recipe code can access Electron/Node APIs — this is the
  primary hardening target for Kryvex (see `SECURITY_MODEL.md`, ED-005).
- Webview helpers: `src/webview/` — badge, notifications (wraps page
  Notification API → host), contextMenu, darkmode, screenshare,
  sessionHandler, spellchecker, zoom, find, windowOpenShim,
  AutomaticLanguageDetection.

## 3. IPC surface (`src/electron/ipc-api/`)

Modules: `index.ts` (registration), `settings.ts` (read/update),
`autoUpdate.ts` (explicit install via IPC; Snap path disabled),
`appIndicator.ts` (taskbar flash/overlay Win, dock badge macOS, tray),
`clipboard.ts`, `dnd.ts`, `download.ts`, `focusState.ts`,
`languageDetect.ts`, `localServer.ts`, `processManager.ts`,
`sessionStorage.ts`. Main→renderer via `webContents.send`.

## 4. Services & recipes

- Recipes are a separate repo (`ferdium/ferdium-recipes`), git submodule at
  `recipes/` (branch main, currently uninitialized: `-99d352a...`).
  Conventional recipe: `package.json`, `index.js`, optional `webview.js`,
  SVG icon, optional dark CSS.
- `src/models/Recipe.ts`: identity/version validation, URL + notification +
  custom-URL config. `src/models/Service.ts`: running-service state (unread,
  notifications, loading/error, media). `src/models/RecipePreview.ts`,
  `User.ts`, `DownloadController.ts`.
- Stores: `ServicesStore`, `RecipesStore`, `RecipePreviewsStore`,
  `SettingsStore`, `UserStore`, `UIStore`, `FeaturesStore`, `AppStore`,
  `RequestStore`, `GlobalErrorStore`.
- Features: `workspaces`, `quickSwitch` (Ctrl+K), `todos`, `serviceProxy`,
  `webControls`, `appearance`, `basicAuth`, `communityRecipes`,
  `publishDebugInfo`, `utils`.

## 5. Persistence & migrations

- Settings JSON in user-data `config/` (`src/electron/Settings.ts`;
  `settings.json` + per-type files).
- Embedded AdonisJS + SQLite server: `src/internal-server/` (`app/`,
  `config/database.js` with `DB_PATH`, `start/`, `start.ts`, `test.ts`).
- DB migrations: `src/internal-server/database/migrations/` —
  `1503250034279_user.js`, `1566385379883_service_schema.js`,
  `1566554231482_recipe_schema.js`, `1566554359294_workspace_schema.js`.
- `src/internal-server/start/migrate.js`: loads/creates local user, tracks
  `db_version`; states "Currently no migrations" for app-version changes.
- API split: `src/api/index.ts` composes; `src/api/server/ServerApi.ts`
  (remote) vs `src/api/server/LocalApi.ts` (local over IPC).

## 6. Notifications / tray / indicators

Unread via service bridge → `src/webview/notifications.ts` → host webview;
`appIndicator.ts` per-platform indicators; `src/lib/Tray.ts` tray icon/menu;
`src/lib/DBus.ts` Linux `org.ferdium.Ferdium` bus. Behavior is
platform-dependent, not uniform.

## 7. Packaging / release

`electron-builder.yml`: GitHub publish; macOS DMG/ZIP (x64/arm64, min
macOS 13); Windows NSIS + portable + zip (x64/arm64); Linux AppImage/deb/
tar.gz/rpm/FreeBSD/Snap. Signing: `publisherName: [Ferdium Contributors,
Ambroise Grau]`, `verifyUpdateCodeSignature: false` — Kryvex ships unsigned
until a cert exists (document, never imply signed). CI
(`.github/workflows/builds.yml`): pushes to develop/release/nightly, PRs,
daily schedule; lint + tests + multi-OS builds; nightly drafts need manual
maintainer publish.

## 8. Retain / refactor / replace (initial)

- Retain: service model + stores, recipe compat, workspaces, quickSwitch,
  settings JSON pattern, per-platform packaging matrix, migration files.
- Refactor + harden: main-window prefs (ED-005), recipe Node access, IPC
  sender validation, session/partition isolation.
- Replace: branding/ids/metadata, theme system (Kryvex studio), lifecycle
  with hibernation states, browser UI as first-class workspace.
- New: Sohbet built-in service, resource dashboard, backup/restore (secrets
  excluded), redacted diagnostics, plugin API evaluation.

## 9. Evidence limits

Static source review only; no runtime profile, no live notification test, no
`pnpm install` yet (M2). Recipe-submodule contents not inspected (not
initialized). Commit history truncated by shallow clone.
