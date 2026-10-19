# Kryvex — Project Status

**Product:** Kryvex (Kryvex Desktop), mark `Kx`, fictional element `027`,
tagline “Precision in Every Connection.” Naming remains **high risk** (ED-002:
an existing KRYVEX AI platform, a password-vault repo, ~38 GitHub repos, a Play
developer account, an unrelated salt-mill trademark). The identity is fully
tokenized, so a rename is cheap. No store listing, domain purchase or paid
brand spend without counsel clearance.

**Application:** v0.1.0 — working Electron/React prototype. Modules load in
isolated persistent sessions, the browser supports tabs/bookmarks/navigation,
six themes switch live, and state survives restarts. Published at
`https://github.com/XiONDiGiTaL/Kryvex` (MIT).

## Milestones

- [x] **M0 — Environment & safety audit.** X: 114G free (95% used), C: 34G free;
  git 2.55, node v24.19.0, pnpm 12.3.4 (local `.tools/pnpm`; corepack blocked by
  EPERM), python 3.12/3.14, gh 2.102 logged in as XiONDiGiTaL. Created
  `X:\Veyra`; `X:\REA` untouched.
- [x] **M1 — Upstream analysis.** Ferdium shallow clone analysed; 8 docs written
  from verified source. Upstream is reference-only.
- [x] **M2 — Reproducible baseline.** Upstream install/typecheck/tests executed
  (140 passed, 2 skipped).
- [x] **M3 — Identity & application.** Tile logo + all variants, `BRAND.md`,
  tokens, six themes, PNG 16–512, 7-resolution ICO. Fresh Electron/React app
  (ED-008), app id `net.xiondigital.kryvex`, screenshots generated from the
  running app. Repo published.
- [x] **M4 — Design tokens & themes (core).** Renderer imports
  `brand/tokens.json` and `brand/themes.json`; no palette literals in CSS.
  Theme, density, sidebar and status bar persist. *Remaining:* Theme Studio
  import/export, automated contrast audit.
- [x] **M5 — Service modules (core).** Registry with validation, categories,
  pins, recents, starter catalogue, per-service sessions, error/retry states.
  Sohbet loads inside its module (verified in capture: URL resolved, loading
  false). *Remaining:* lifecycle states, hibernation, health checks.
- [x] **M6 — Browser (core).** Tabs, back/forward/reload, address bar with
  search resolution, bookmarks, per-tab partitions, external handoff.
  *Remaining:* downloads shelf, history manager, find-in-page, zoom UI.
- [x] **M7 — Security baseline.** Sandboxed renderer, context isolation, four
  IPC calls, hardened webviews, partition allowlist, permission deny-list,
  http(s)-only navigation, externalised popups, atomic/capped state writes.
  *Remaining:* `pnpm audit` run, permission UX, profiles.
- [ ] **M8 — Verification depth.** 38 unit tests + strict typecheck + production
  build + route capture passing. *Remaining:* e2e/UI tests, backup/restore,
  measured performance comparison.
- [ ] **M9 — Packaging & CI.** electron-builder config (NSIS + portable,
  unsigned) present; installer not produced; no CI.
- [x] **M10 — GitHub publication.** Public repo `XiONDiGiTaL/Kryvex`, MIT
  license, app source and screenshots pushed without force-push.
- [ ] **M11 — Final validation.** No release review or store assets yet.

## Verified facts

### Upstream reference (unchanged)

- Ferdium `develop` @ `7.2.4-nightly.3`, Apache-2.0; main window
  `nodeIntegration: true`, `contextIsolation: false` (`src/index.ts:282-284`);
  recipe bridge can reach Electron; AdonisJS/SQLite server; NSIS/portable
  packaging with signature verification off.
- Midori `core` is GTK3/WebKitGTK, unmaintained since 2019 → no Electron path
  (ED-003). Browser is Chromium webview-based.

### Application (v0.1.0)

- `pnpm install` resolved React 19.3.1, Electron 44.2.0, Vite 8.3.4,
  TypeScript 7.0.2, Vitest 5.0.5, electron-builder 26.15.3.
- `pnpm typecheck` exit 0 for renderer and main/preload.
- `pnpm test` exit 0 — **38 passed, 0 failed** across URL, services, store and
  theme suites.
- `pnpm build` exit 0 — renderer 284 kB JS / 34 kB CSS (86 kB / 6.4 kB gzip),
  `dist-electron/main.js` + `preload.js`.
- `pnpm capture` (electron `KRYVEX_CAPTURE=1`) exit 0 — nine 1440×900 PNGs from
  the real window; service probe returned
  `https://sohbet.xiondigital.net/` with `loading: false`.
- Security wiring verified by source review: `sandbox: true`,
  `contextIsolation: true`, `nodeIntegration: false`, preload deleted on
  webview attach, partition regex enforced, permissions denied except
  clipboard/fullscreen, external URLs protocol-checked.

## Next concrete action

Package and verify: run electron-builder to produce an unsigned NSIS build,
then author the release checklist, Theme Studio import/export and the
downloads/history surfaces. No signed release before those checks.

## Git

`X:\Veyra` is the repository root. Remote
`https://github.com/XiONDiGiTaL/Kryvex` (`main`). `upstream/`, tool caches and
`node_modules` are ignored; the upstream checkout is reference-only and must
never be committed.
