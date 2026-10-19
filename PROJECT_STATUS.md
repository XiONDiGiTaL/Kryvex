# Kryvex — Project Status

**Product:** Kryvex Desktop 0.3.0 — a modular Electron workspace where web apps
become isolated, themed, keyboard-reachable modules. Fictional element `x529`,
symbol `Kx`, tagline “Precision in Every Connection.”

**Repository:** https://github.com/XiONDiGiTaL/Kryvex (public, `main`, no
force-push). Working directory remains `X:\Veyra`.

**Naming risk (open):** an existing KRYVEX AI platform, a KRYVEX password
vault, ~38 GitHub repos, a Play developer account and an unrelated salt-mill
mark use the name. The identity is fully tokenized, so a rename is cheap. No
domain purchase, store listing or paid brand spend without counsel clearance.
See `docs/ENGINEERING_DECISIONS.md` (ED-002). Gatherium is the fallback name.

## Milestones

- [x] **M0 — Environment & safety audit.** Verified storage, git, Node 24.19.0,
  gh auth as XiONDiGiTaL. `X:\REA` untouched.
- [x] **M1 — Upstream analysis.** Ferdium cloned shallow as reference only;
  analysis docs written from verified source. `gh repo view` outcome recorded.
- [x] **M2 — Reproducible baseline.** pnpm 12.3.4 (local tool dir; corepack
  blocked by EPERM), install/typecheck/test run in the reference clone.
- [x] **M3 — Identity & shell.** Periodic-table tile logo, small/tray/mono
  variants, `brand/BRAND.md`, `brand/tokens.json`, `brand/themes.json`, six
  themes, PNG 16–512, 7-resolution `kryvex.ico`. App id
  `net.xiondigital.kryvex`.
- [x] **M4 — Theming (core).** Six themes applied at runtime from
  `brand/themes.json`; density, sidebar mode, status bar and start view
  persist. Theme Studio import/export and a formal contrast audit remain.
- [x] **M5 — Services (core).** Registry with add/edit/remove/pin, validation,
  search and category filters, starter catalogue, per-module persistent
  sessions, loading/error/retry. Sohbet verified loading inside its module.
  Hibernation and health checks remain.
- [x] **M6 — Browser (core).** Tabs, back/forward/reload, address bar with
  host-or-search resolution, bookmarks bar and toggle, per-tab persistent
  partitions, system-browser handoff. Downloads, history, find and zoom remain.
- [ ] **M7 — Security (baseline shipped).** Sandboxed renderer, context
  isolation, a narrowed typed IPC bridge, hardened webviews, partition
  allowlist, http(s)-only navigation, permission deny-list, externalised
  popups, atomic capped state writes, sender checks on shield/extension
  mutations. Remaining: permission prompt UX, `pnpm audit`, packaged-app
  integrity checks, renderer CSP, macOS/Linux validation.
- [ ] **M8 — Testing (partial).** 40/40 unit tests, strict typecheck, build and
  thirteen-capture pass; live Sohbet probe passed. Remaining: e2e UI tests,
  automated restart-persistence test, backup/restore, measured performance
  comparison (`docs/PERFORMANCE.md` still holds no numbers).
- [ ] **M9 — Packaging & CI.** Setup and Portable EXEs build with a selectable
  install folder, Desktop/Start Menu shortcuts and an uninstaller. Custom-dir
  install, installed-app launch and clean uninstall were verified. Remaining:
  code signing, interactive wizard pass and CI.
- [x] **M10 — Publication.** `XiONDiGiTaL/Kryvex` created, MIT licensed,
  secret-scanned, main pushed and verified remotely.
- [ ] **M11 — Final review.** README with thirteen real screenshots, banner,
  feature/security/limitation sections, honest testing docs and a 0.3.0 release
  record are in place. Outstanding: engineering report and a signed public
  release.

## Verified evidence (2026-10-19)

- `pnpm typecheck` → exit 0 (renderer and main, strict TypeScript).
- `pnpm test` → exit 0, 40/40 passed.
- `pnpm build` → exit 0; `dist/assets/index-*.js` 322.12 kB,
  `index-*.css` 43.73 kB; `dist-electron/` main + preload emitted.
- `pnpm capture` → exit 0; thirteen 1440×900 PNGs regenerated from the running
  Electron window (`home`, `help`, `services`, `add-service`, `service`, `browser`,
  `settings`, `settings-shield`, `settings-plugins`, `settings-about`,
  `donkey-theme`, `command-palette`, `light-theme`).
- Setup build → exit 0; `release/Kryvex-Setup-0.3.0-x64.exe` and
  `release/Kryvex-Portable-0.3.0-x64.exe` are 108 MiB each. The setup installed
  silently to a custom temporary folder, the installed `Kryvex.exe` completed
  all thirteen capture routes, and the uninstaller removed the folder,
  Desktop/Start Menu shortcuts and uninstall registry entry. Both EXEs report
  `NotSigned`.
- Live module probe: `https://sohbet.xiondigital.net/` loaded with
  `loading: false` inside a `persist:svc-*` webview.
- Repository scan: no tracked `node_modules`, build output, upstream checkout,
  env files or credential patterns; README image references all resolve.
- Dev-only Vite defect found and fixed: brand JSON cannot be imported while
  `brand/` is configured as `publicDir`; `publicDir` is now disabled, the logo
  is imported through `src/assets.ts`, and the window icon path is resolved
  relative to the compiled main entry. Dev host pinned to IPv4.
- Non-capture `pnpm dev:electron` was started repeatedly; Electron ran and
  printed its DevTools endpoint. Renderer content in dev was **not** captured
  visually (production captures are the visual evidence).

## Known gaps

- Windows only; no macOS/Linux run or platform icon sets.
- No code-signed installer, auto-update, or CI.
- No downloads manager, history browser, find-in-page or hibernation.
- State persistence is unit-tested and wired through the verified IPC bridge,
  but no automated end-to-end restart test exists.
- Some third-party services resist embedding (strict SSO, popups,
  user-agent checks); “Open externally” is the supported escape hatch.
- “Kryvex” clearance unresolved (above).

## Next concrete action

Run a signed Windows build and a restart-persistence/e2e pass, then decide
whether catalogue parity or Theme Studio is the next product milestone.
