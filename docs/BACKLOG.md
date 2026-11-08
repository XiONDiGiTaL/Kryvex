# Backlog (actionable, ordered)

## Now (M3+: product)
M1/M2 are complete (see `PROJECT_STATUS.md`); this list is the live queue.
- [x] All M1 analysis docs written.
- [x] Name screen: Veyra rejected, Gatherium superseded, Kryvex selected
  (high risk: ED-002); `kryvex` repo-existence check still pending.
- [x] Baseline M2 green: install, typecheck, tests, no edits outside the project.
- [x] Kryvex identity: tile logo, small/tray/mono SVGs, `BRAND.md`, tokens,
  6 themes, PNG 16–512 + 7-size ICO, visual QA sheet.
- [x] Init `X:\Veyra` git repo, `.gitignore`, set `package.json` ids,
  product name, and icons into the source tree.
- [x] About/attribution page following `brand/BRAND.md` copy rules, including
  developer links to XiONDiGiTaL and player529.
- [x] Click-first usability pass: header Add/Settings/Help, Home common actions,
  quick-help dialog and 0.3.0 Windows Setup/Portable release.
- [x] Browser library: downloads with live actions, searchable history,
  bookmark list, direct URL deep links and opt-in Windows default-browser setup.
- [x] Browser privacy baseline: HTTPS upgrades with one-time fallback,
  tracking-parameter stripping, per-site fingerprint farbling, EasyList Cookie,
  independent privacy switches and a live verification harness.
- [x] Browser session restore, persistent download history, find-in-page and
  page zoom (covered by `pnpm verify:restart`, `pnpm verify:downloads` and
  `pnpm verify:browser`).
- [x] Download-location picker for regular downloads and the torrent root,
  persisted with retained old roots (`pnpm verify:downloads`,
  `pnpm verify:location-ui`).
- [x] Kryvex 0.5.0 Setup/Portable release published with the download-location
  picker, checksum-verified artifacts and packaged smoke tests.
- [x] Browser pop-ups open as in-app tabs, so a page's sign-in window returns
  its result to the opener instead of leaving Kryvex (`pnpm verify:popups`).
- [ ] Per-site zoom memory.
- [x] Virtual LAN strip in Rooms: reads the tunnel address the user's own
  engine already has, publishes it to the room by hand and lists the members'
  addresses (`pnpm verify:vlan`, [VIRTUAL_LAN.md](VIRTUAL_LAN.md)). Open: a
  bundled engine, a privileged helper and a membership/revocation model —
  [VIRTUAL_LAN_EVAL.md](VIRTUAL_LAN_EVAL.md) §11.
- [x] Torrent queue restore after restart: rows reload paused with no client or
  transfer, and resume only when the user asks (`pnpm verify:torrents`).
- [ ] Per-site exceptions for HTTPS upgrades, tracking prevention and
  fingerprinting; native-engine experiment for stronger fingerprint resistance.
- [ ] Safe Browsing equivalent. Electron does not expose Chromium's protocol, so
  this needs a deliberate reputation provider and privacy review before work.

## Integration queue (audited in [INTEGRATION_AUDIT.md](INTEGRATION_AUDIT.md))

Ordered by dependency, not by size: the first item is what the next two build on.

- [x] Unified search, first slice: one main-process query over services,
  browser history, bookmarks and downloads, ranked by rules the renderer shares
  for its own commands, with the command palette as its single surface and
  `Ctrl+K` over all of it (`electron/search-rules.ts`, `electron/search.ts`,
  `tests/search-rules.test.ts`). Opening a result goes to the module, the
  Browser tab or the downloaded file.
- [ ] Search the rest: workspaces, saved settings and user-script records into
  the same index, plus per-source filters and a dedicated results view.
- [ ] Activity center: capture service notifications in the guest preload,
  keep history, per-service mute and priority, unread indicators, click-through
  to the originating module, retention. Replaces the all-or-nothing behaviour
  recorded in `PROJECT_STATUS.md`.
- [ ] Hibernation: opt-in per service, exemptible, on top of the existing
  resource sampler and service lifecycle; never clears a partition or a session.
- [ ] Backup and restore: versioned local snapshots, integrity check, preview
  before restoring, and no silent overwrite of live state.
- [ ] Reading Room and Knowledge Vault: saved pages, extracted articles,
  collections, highlights, tags, and collections selectable as Vexium context.
- [ ] Extension API and review process: one permission shape shared with the
  existing user-script and Web Store paths, documented before any third-party
  module runs.

Smaller items still open from earlier batches: per-site zoom memory and
per-site privacy exceptions (browser), audio conversion and PDF page export
(File Forge), and a measured performance pass.

## Done (M2 baseline: record)
- [x] pnpm 12.3.4 via local `.tools/pnpm`; Node 24.19.0 delta recorded.
- [x] `pnpm install` exit 0 (2m15s); `typecheck` exit 0; `test` exit 0
  (140 passed, 2 skipped, 0 failed).
- [ ] Baseline perf workload: deferred to M8 with the same method.

## Then (M3+)
- [x] Brand system: Kryvex tile logo + tokens (#0B0E12/#12171E/#38BDF8/
  #2DD4BF/#F0F3F7) + six themes + raster/ICO icons in `brand/`.
- [ ] Theme studio schema + 6 themes; service lifecycle states + hibernation;
  Sohbet built-in service; Electron browser (tabs, history, downloads,
  sessions, permissions); workspaces; resource dashboard; backup/restore;
  diagnostics with redaction; CI (Windows) + release automation.
- [ ] Screenshots only of implemented UI; performance numbers only measured.

## Non-goals / guardrails
- No pushes to any remote until `gh repo view`/create + secret scan + build
  + tests pass. No force-push, no history destruction.
- No C: writes beyond documented tool caches; keep build artifacts out of git.
- Never claim an integration, test pass, or measurement without proof.

## Next (asked for, not built yet)

- [x] **Region capture.** A dragged crop rectangle (snipping-tool style) for both
  stills and recordings, whole target by default: the picker draws on a frozen
  frame, a still copies the region out of it, and a recording is cropped as it is
  made through a canvas (`pnpm verify:capture-window`, 37 checks). Open: an area
  saved against one target size is dropped rather than adjusted when the frame
  comes back unable to hold it.
- [ ] **Android companion.** A standalone APK that talks to Kryvex Link over the
  local network, so a phone does not have to load the desktop's own page first.
  Needs its own client bundle, a project that can produce the APK, and a release
  path for the artifact.
- [ ] **File Forge, deeper groups.** Audio conversion (WAV is written by hand;
  MP3/FLAC/OGG have no encoder in Chromium and must stay refused rather than
  faked) and PDF pages back to images, which needs a page renderer (pdfjs-dist
  is the reviewed candidate — Apache-2.0, ~8.5 MB in the bundle).
