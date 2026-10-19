# Backlog (actionable, ordered)

## Now (M3 — identity & fork)
M1/M2 are complete (see `PROJECT_STATUS.md`); this list is the live queue.
- [x] All M1 analysis docs written from the cloned source.
- [x] Name screen: Veyra rejected, Gatherium superseded, Kryvex selected
  (high risk — ED-002); `kryvex` repo-existence check still pending.
- [x] Baseline M2 green: install, typecheck, tests, no upstream edits.
- [x] Kryvex identity: tile logo, small/tray/mono SVGs, `BRAND.md`, tokens,
  6 themes, PNG 16–512 + 7-size ICO, visual QA sheet.
- [ ] Init `X:\Veyra` git repo, `.gitignore`, fork `package.json` ids,
  product name, and icons into the source tree.
- [ ] About/attribution page following `brand/BRAND.md` copy rules.

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
