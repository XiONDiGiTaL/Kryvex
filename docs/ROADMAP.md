# Roadmap (acceptance-gated)

- **M0** ✅ env audit + `X:\Veyra` created, REA untouched, gh auth confirmed.
- **M1** ✅ 8 analysis docs written from verified source; `gh repo view`
  outcome recorded.
- **M2** ✅ pnpm 12.3.4 + install/typecheck/test executed in the upstream clone
  with results logged. Perf numbers deferred to M8 (documented).
- **M3** ✅ Kryvex identity (tile logo, variants, `BRAND.md`, tokens, six
  themes, PNG 16–512, 7-size ICO) plus a working Electron/React shell (ED-008),
  app id, screenshots and repo publication.
- **M4** ✅ core: tokens drive the UI, 80 themes (78 catalogue + 2 plugins) and a Custom picker persist, density and shell
  prefs persist. Remaining: Theme Studio import/export, contrast audit.
- **M5** ✅ core: module registry, validation, isolated sessions, error/retry;
  Sohbet loads inside its module. Remaining: hibernation, health checks.
- **M6** ✅ core: restorable tabs, navigation, address bar, bookmarks,
  in-memory per-tab sessions, external handoff, persistent
  downloads/history/bookmarks library, find-in-page, page zoom, a persisted
  torrent queue that restores paused, and a download-location picker shared by
  downloads and new torrents. Remaining: per-site zoom memory and torrent
  scheduling.
- **M7** ◐ security baseline implemented (sandbox, isolation, typed IPC bridge,
  hardened webviews, explicit mic/camera prompt, other permissions denied,
  HTTPS upgrades with fallback, tracking-parameter stripping, per-site
  fingerprint farbling, EasyList Cookie, sender checks, atomic state).
  Remaining: audit, profiles, persisted scopes, per-site privacy exceptions.
- **M8** ◐ 151 unit tests + typecheck + build + twenty-four-capture pass, restart,
  download-history, download-location UI, torrent restore, find/zoom,
  default-browser, torrent, torrent-UI, media-permission, privacy and updater
  harnesses.  Remaining: broader e2e/UI tests, backup/restore, measured performance
  comparison.
- **M9** ◐ the tag workflow builds and publishes the Setup and Portable EXEs
  with `SHA256SUMS.txt` — 0.6.0 through 0.8.3 so far — and the 0.7.0 unpacked
  build completes all twenty-seven captures. Remaining: signing and
  interactive-wizard QA.
- **M10** ✅  `XiONDiGiTaL/Kryvex` published (main, no force-push); 0.3.0 through
  0.8.3 releases published with checksum-verified artifacts.
- **M11** ◐ README, banner, twenty-four real-UI screenshots, limitations, testing
  docs and release records up to 0.8.3 delivered. Remaining: engineering report
  and a signed public release.
