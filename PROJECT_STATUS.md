# Kryvex — Project Status

**Product:** Kryvex Desktop 0.5.0 — a modular Electron workspace where web apps
become isolated, themed modules, with a restorable browser session, a persistent
download history, find-in-page and page zoom, history/bookmarks, a persisted
torrent queue that restores paused, microphone/camera prompts for web calls,
Brave-style HTTPS upgrades, tracking-parameter stripping and per-site
fingerprint farbling, and a download-location picker shared by regular
downloads and the torrent root. Fictional element `x529`, symbol `Kx`, tagline
“Precision in Every Connection.”

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
- [x] **M1 — Requirements and reference research.** Reviewed comparable
  modular-workspace patterns without copying code; the independent-shell
  decision is recorded in `docs/ENGINEERING_DECISIONS.md`.
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
- [x] **M6 — Browser (core).** Tabs that reopen after a restart, back/forward/
  reload, address bar with host-or-search resolution, bookmarks bar and toggle,
  in-memory per-tab partitions, system-browser handoff, a persistent
  downloads/history/bookmarks library, find-in-page, page zoom, a persisted
  WebTorrent queue inside Downloads that returns paused after a restart, and a
  download-location picker shared by downloads and new torrents. Per-site zoom
  memory remains.
- [ ] **M7 — Security (baseline shipped).** Sandboxed renderer, context
  isolation, a narrowed typed IPC bridge, hardened webviews, partition
  allowlist, http(s)-only navigation, an explicit per-origin mic/camera prompt
  with other permissions/devices denied, externalised popups, GPC, cross-origin
  referrer trimming, in-memory browser tab partitions, atomic capped state
  writes, sender checks on every IPC handler, HTTPS upgrades with a one-time
  HTTP fallback, tracking-parameter stripping, per-site canvas/WebGL/audio
  farbling and EasyList Cookie. Remaining: per-site privacy exceptions,
  persisted per-module scopes, Safe Browsing equivalent, `pnpm audit`,
  packaged-app integrity checks, renderer CSP, macOS/Linux validation.
- [ ] **M8 — Testing (partial).** 110/110 unit tests, strict typecheck, build and
  seventeen-capture pass; live Sohbet probe passed. Download-manager,
  default-browser, Web Store extension, loopback torrent (real peer transfer),
  torrent IPC/UI, real webview media-permission and privacy harnesses passed.
  Restart persistence, download history, the download-location row/reset
  action, torrent queue restore across a location change, the restored torrent
  row in the built UI, and find/zoom are automated through
  `pnpm verify:restart`, `pnpm verify:downloads`, `pnpm verify:location-ui`,
  `pnpm verify:torrents`, `pnpm verify:torrent-restore-ui` and
  `pnpm verify:browser`. Remaining: broader e2e UI coverage, backup/restore,
  measured performance comparison (`docs/PERFORMANCE.md` still holds no
  numbers).
- [ ] **M9 — Packaging & CI.** The 0.5.0 Setup and Portable EXEs are published
  from the complete source tree (download-location picker, WebTorrent,
  persistence/find/zoom and paused torrent restore included). They build with
  a selectable install folder, Desktop/Start Menu shortcuts and an uninstaller;
  custom-dir install, installed/portable/unpacked capture, packaged
  paused-row and download-location smoke tests, checksums and clean uninstall
  were verified. Remaining: code signing, interactive wizard pass and CI.
- [x] **M10 — Publication.** `XiONDiGiTaL/Kryvex` created, MIT licensed,
  secret-scanned, main pushed and verified remotely; 0.3.0, 0.4.0 and 0.5.0
  releases published with checksum-verified artifacts.
- [ ] **M11 — Final review.** README with nineteen real screenshots, banner,
  feature/security/limitation sections, honest testing docs and 0.3.0/0.4.0/
  0.5.0 release records are in place. Outstanding: engineering report and a
  signed public release.

## Verified evidence (2026-10-19)

- `pnpm typecheck` → exit 0 (renderer and main, strict TypeScript).
- `pnpm test` → exit 0, 110/110 passed.
- `pnpm build` → exit 0; `dist/assets/index-*.js` 468.11 kB,
  `index-*.css` 54.02 kB; `dist-electron/` main + preload emitted.
- `pnpm capture` → exit 0; seventeen 1440×900 PNGs regenerated from the
  running Electron window in a disposable profile (`home`, `help`, `services`,
  `add-service`, `service`, `browser`, `browser-downloads`, `browser-history`,
  `settings`, `settings-data`, `settings-shield`, `settings-browser`,
  `settings-plugins`, `settings-about`, `donkey-theme`, `command-palette`,
  `light-theme`).
- `pnpm verify:restart` → pass; theme, start view and an open tab survived a
  real close/relaunch, including a change made immediately before close. A URL
  passed on the command line opened beside the restored tab.
- `pnpm verify:downloads` → pass; a completed download was written under a
  chosen folder, the location was changed again, the record reloaded in a
  fresh manager, deleted with its file, and stayed gone after another reload.
  The location reset back to Downloads and the torrent root followed it.
- `pnpm verify:torrents` → pass; a real `.torrent` and magnet were persisted
  across a download-location change, restored as two paused rows in a fresh
  manager with no WebTorrent client, hydrated on Resume, downloaded again, and
  removed with their folders and saved metadata. The old row remained valid
  after the root moved.
- `pnpm verify:location-ui` → pass; the built app showed the seeded custom
  folder in **Settings → Data**, offered Change folder and reset, and reset the
  live path and bridge value to the real Downloads folder. The same harness
  passed against `release/win-unpacked/Kryvex.exe` after
  `electron-builder --dir` rebuilt the unpacked app.
- `pnpm verify:torrent-restore-ui` → pass; the built app opened with a seeded
  queue and the Downloads hub rendered the restored row as `Paused` with a
  `Resume` action, no active speed and zero peers.
- `pnpm verify:browser` → pass; find-in-page reported `1 of 3`, zoom reached
  110% on the live webview and reset to 100%.
- Setup build → exit 0; produced `release/Kryvex-Setup-0.5.0-x64.exe`
  (`991be75a…3206`, 114.5 MiB) and `release/Kryvex-Portable-0.5.0-x64.exe`
  (`42cc1530…89c8`, 114.3 MiB). Both report version 0.5.0 and `NotSigned`.
  The setup installed silently to a custom temporary folder, and the installed,
  portable and unpacked builds each completed all seventeen capture routes;
  the packaged app also passed the download-location UI harness. A seeded
  queue rendered the restored torrent as paused with a Resume action in the
  unpacked, portable and installed builds. Silent uninstall removed the
  folder, both shortcuts and the uninstall entry.
- Download-manager harness → exit 0; completed file path, exact bytes,
  collision-safe second filename, remove-record and delete-file all verified.
- Torrent harness → exit 0; loaded the built main-process manager and
  WebTorrent in Node with a path shim, added a real `.torrent` and magnet,
  transferred bytes from a loopback seeder, reported live seeder counts,
  paused/resumed, and deleted the managed folder. A fresh manager then restored
  both rows as paused with zero live counters and no client, hydrated each only
  on Resume, verified the local pieces, transferred again, and removed both
  folders and saved metadata.
- Torrent IPC/UI harness → pass; `window.kryvex.torrentsAddMagnet` rendered one
  row in the Downloads hub with protocols and stats, and removal cleared it.
- Media-permission harness → pass; a real webview `getUserMedia({audio,video})`
  reached the shell prompt, Allow produced two tracks, Block stayed denied, and
  an untrusted origin inherited nothing.
- Privacy harness → pass; `https://example.com/?utm_source=kryvex&keep=1`
  became `https://example.com/?keep=1`, a local HTTP-only host served through
  `127.0.0.1.nip.io` settled on HTTP after the HTTPS attempt was refused,
  EasyList Cookie appeared in the roughly 121,700-filter engine, and canvas and
  WebGL readbacks were farbled, stable and restored to native output when the
  fingerprint toggle was turned off.
- Default-browser harness → pass; status, http(s)-only argv filtering, queued
  URL drain; dev run did not change the system default.
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
- No module hibernation; page zoom is remembered per tab for the current
  session only.
- Torrent rows restore paused, but there is no bandwidth scheduler, ratio
  limit, per-file selection or router port mapping.
- Microphone/camera grants are per origin for the current app session only.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
- HTTPS upgrades cover top-level GET navigations only; no interstitial warning
  or full mixed-content policy. Safe Browsing is not implemented because
  Electron does not expose Chromium's protocol.
- State persistence now has a real close/relaunch harness, but it covers
  settings, start view and browser tabs rather than every view's transient UI.
- Some third-party services resist embedding (strict SSO, popups,
  user-agent checks); “Open externally” is the supported escape hatch.
- “Kryvex” clearance unresolved (above).

## Next concrete action

0.5.0 is published; no packaging action is pending. Take up Theme Studio or
module hibernation next, while pursuing code signing for a signed release.
