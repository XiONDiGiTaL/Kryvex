# Roadmap (acceptance-gated)

- **M0** ✅ env audit + `X:\Veyra` created, REA untouched, gh auth confirmed.
- **M1** ✅ 8 analysis docs written from verified source; `gh repo view`
  outcome recorded.
- **M2** ✅ pnpm 12.3.4 + install/typecheck/test executed in the upstream clone
  with results logged. Perf numbers deferred to M8 (documented).
- **M3** ✅ Kryvex identity (tile logo, variants, `BRAND.md`, tokens, six
  themes, PNG 16–512, 7-size ICO) plus a working Electron/React shell (ED-008),
  app id, screenshots and repo publication.
- **M4** ✅ core: tokens drive the UI, 38 themes and a Custom picker persist, density and shell
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
- **M8** ◐ 149 unit tests + typecheck + build + nineteen-capture pass, restart,
  download-history, download-location UI, torrent restore, find/zoom,
  default-browser, torrent, torrent-UI, media-permission, privacy and updater
  harnesses.  Remaining: broader e2e/UI tests, backup/restore, measured performance
  comparison.
- **M9** ◐ unsigned 0.6.0 Setup and Portable EXEs built from the complete
  source tree (114.6/114.3 MiB), the unpacked build completed all nineteen
  captures, and `SHA256SUMS.txt` is published so the in-app updater has a
  verified source. Remaining: signing, interactive-wizard QA and a CI run.
- **M10** ✅ `XiONDiGiTaL/Kryvex` published (main, no force-push); 0.3.0, 0.4.0,
  0.5.0 and 0.6.0 releases published with checksum-verified artifacts.
- **M11** ◐ README, banner, nineteen real-UI screenshots, limitations, testing
  docs and 0.3.0/0.4.0/0.5.0 release records delivered. Remaining: engineering
  report and a signed public release.
