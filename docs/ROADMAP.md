# Roadmap (acceptance-gated)

- **M0** ✅ env audit + `X:\Veyra` created, REA untouched, gh auth confirmed.
- **M1** ✅ 8 analysis docs written from verified source; `gh repo view`
  outcome recorded.
- **M2** ✅ pnpm 12.3.4 + install/typecheck/test executed in the upstream clone
  with results logged. Perf numbers deferred to M8 (documented).
- **M3** ✅ Kryvex identity (tile logo, variants, `BRAND.md`, tokens, six
  themes, PNG 16–512, 7-size ICO) plus a working Electron/React shell (ED-008),
  app id, screenshots and repo publication.
- **M4** ✅ core: tokens drive the UI, six themes persist, density and shell
  prefs persist. Remaining: Theme Studio import/export, contrast audit.
- **M5** ✅ core: module registry, validation, isolated sessions, error/retry;
  Sohbet loads inside its module. Remaining: hibernation, health checks.
- **M6** ✅ core: tabs, navigation, address bar, bookmarks, per-tab sessions,
  external handoff. Remaining: downloads shelf, history, find, zoom.
- **M7** ◐ security baseline implemented (sandbox, isolation, four IPC calls,
  hardened webviews, permission deny-list, atomic state). Remaining: audit,
  profiles, permission UX.
- **M8** ◐ 38 unit tests + typecheck + build + capture pass. Remaining: e2e/UI
  tests, backup/restore, measured performance comparison.
- **M9**: Windows installer/portable build succeeds; CI green; install docs.
- **M10** ✅ `XiONDiGiTaL/Kryvex` published (main, no force-push).
- **M11**: final review, release screenshots, honest limitations.
- **M11**: final review, docs/screenshots of real UI, honest limitations,
  engineering report (§24).
