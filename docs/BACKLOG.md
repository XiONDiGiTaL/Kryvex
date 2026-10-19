# Backlog (actionable, ordered)

## Now (M3+ — product)
M1/M2 are complete (see `PROJECT_STATUS.md`); this list is the live queue.
- [x] All M1 analysis docs written from the cloned source.
- [x] Name screen: Veyra rejected, Gatherium superseded, Kryvex selected
  (high risk — ED-002); `kryvex` repo-existence check still pending.
- [x] Baseline M2 green: install, typecheck, tests, no upstream edits.
- [x] Kryvex identity: tile logo, small/tray/mono SVGs, `BRAND.md`, tokens,
  6 themes, PNG 16–512 + 7-size ICO, visual QA sheet.
- [x] Init `X:\Veyra` git repo, `.gitignore`, fork `package.json` ids,
  product name, and icons into the source tree.
- [x] About/attribution page following `brand/BRAND.md` copy rules, including
  developer links to XiONDiGiTaL and player529.
- [x] Click-first usability pass: header Add/Settings/Help, Home common actions,
  quick-help dialog and 0.3.0 Windows Setup/Portable release.
- [x] Browser library: downloads with live actions, searchable history,
  bookmark list, direct URL deep links and opt-in Windows default-browser setup.
- [x] Brave-style privacy baseline: HTTPS upgrades with one-time fallback,
  tracking-parameter stripping, per-site fingerprint farbling, EasyList Cookie,
  independent privacy switches and a live verification harness.
- [x] Browser session restore, persistent download history, find-in-page and
  page zoom (covered by `pnpm verify:restart`, `pnpm verify:downloads` and
  `pnpm verify:browser`).
- [ ] Download-location picker and per-site zoom memory.
- [x] Torrent queue restore after restart: rows reload paused with no client or
  transfer, and resume only when the user asks (`pnpm verify:torrents`).
- [ ] Per-site exceptions for HTTPS upgrades, tracking prevention and
  fingerprinting; native-engine experiment for stronger fingerprint resistance.
- [ ] Safe Browsing equivalent. Electron does not expose Chromium's protocol, so
  this needs a deliberate reputation provider and privacy review before work.

## Done (M2 baseline — record)
- [x] pnpm 12.3.4 via local `.tools/pnpm`; Node 24.19.0 delta recorded.
- [x] `pnpm install` exit 0 (2m15s); `typecheck` exit 0; `test` exit 0
  (140 passed, 2 skipped, 0 failed).
- [ ] Baseline perf workload — deferred to M8 with the same method.

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
- Never claim Midori integration, test passes, or measurements without proof.
