# Testing record — Kryvex 0.5.0

All results below were produced on 2026-10-19 on Windows with Node 24.19.0,
pnpm 12.3.4 and Electron 44.2.0. Commands were run from `X:\Veyra`; no test was
skipped, weakened or excluded to make the suite pass.

## Automated

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `tsc --noEmit` for renderer and `electron/` (strict) |
| `pnpm test` | exit 0, 110/110 | Vitest: URL normalisation/search resolution, service validation and helpers, starter state, state sanitisation (including saved browser tabs) and registry operations, history, download-history and storage-location validation, page-zoom stepping, catalogue, theme catalogue, Windows browser registration, i18n catalogues, Chrome Web Store URLs, privacy partitions/referrers/headers, Brave-style URL rewrites and farbling rules, media permission helpers, torrent magnet/name/peer/protocol rules and paused queue restore |
| `pnpm build` | exit 0 | Vite renderer (`dist/`) + `tsc` main/preload (`dist-electron/`); 468.11 kB JS, 54.02 kB CSS |
| `pnpm capture` | exit 0 | Launches the built Electron window in a disposable profile and writes seventeen 1440×900 PNGs |
| `pnpm verify:restart` | exit 0 | Real app launched repeatedly: theme, start view and a browser tab survive; a setting changed just before close also survives; a URL passed on the command line joins the restored tab |
| `pnpm verify:downloads` | exit 0 | A completed download was written to a chosen folder, the location moved again, then the record was reloaded by a fresh manager and deleted from disk and the library; reset returned to Downloads |
| `pnpm verify:location-ui` | exit 0 | The built app showed a seeded custom folder in **Settings → Data**, offered Change folder/reset, and reset the live path and bridge value to the real Downloads folder |
| `pnpm verify:torrents` | exit 0 | A real `.torrent` and magnet were persisted across a location change, restored paused in a fresh manager with no WebTorrent client, then hydrated on Resume; both downloaded, reported a seed, and deleted their data |
| `pnpm verify:torrent-restore-ui` | exit 0 | The built app opens a seeded profile with a saved torrent row and renders it as paused in the Downloads hub with a Resume action |
| `pnpm verify:browser` | exit 0 | Find-in-page reports `1 of 3` for a local page; zoom reaches 110% on the live webview and resets to 100% |
| `pnpm exec electron-builder --dir` | exit 0 | Unpacked Windows app rebuilt from this tree; the packaged `Kryvex.exe` passed `verify:location-ui` with `KRYVEX_APP` |
| `pnpm run package:win` | exit 0 | Setup and Portable EXEs from the 0.5.0 tree; both report version `0.5.0` and `NotSigned` |

Test files: `tests/url.test.ts`, `tests/services.test.ts`, `tests/store.test.ts`,
`tests/themes.test.ts`, `tests/windows-browser.test.ts`, `tests/i18n.test.ts`,
`tests/chrome-store.test.ts`, `tests/privacy.test.ts`,
`tests/brave-rules.test.ts`, `tests/torrent-rules.test.ts`,
`tests/download-rules.test.ts`, `tests/storage-rules.test.ts`,
`tests/zoom.test.ts`.

What the unit suite covers:

- URLs: scheme inference, http(s) restriction, trailing-slash and case
  handling, host extraction, host-vs-search address resolution, search engines.
- Services: name/URL validation, category and accent allowlists, glyph
  derivation, duplicate and unsafe IDs, starter workspace shape, catalogue
  presets.
- Store: hostile/partial state sanitisation, add/edit/remove/pin/toggle
  operations, settings updates, history add/dedupe/remove/clear, theme
  selection, reset, and saved browser tabs (unsafe ids and URLs dropped,
  duplicates and an invalid active tab repaired, capped at twenty).
- Downloads: persisted record validation, in-flight entries demoted to
  interrupted on load, duplicate/unsafe/nameless rows dropped, bad byte counts
  and timestamps normalised, history capped.
- Storage location: absolute-path validation, null-byte and length rejection,
  default config shape, malformed-file fallback, retained old roots, rejected
  relative roots and the retained-root cap.
- Zoom: fixed step scale, one-step movement, clamping at both ends and snapping
  of an off-step factor.
- Themes: six themes, token completeness, the `kryvex-dark` default.
- Windows browser registration: the URL ProgID, `http`/`https` associations,
  StartMenuInternet client, Default Apps capabilities and
  RegisteredApplications pointer.
- Internationalisation: system-locale normalisation, English fallback, all
  static `t()` keys present in English/Spanish/German/French, theme and plugin
  names, and localized extension-result messages.
- Chrome Web Store: canonical and ID-only detail URLs, host/scheme rejection,
  malformed IDs and title cleanup.
- Privacy: persistent-service vs in-memory-browser partitions, the narrow
  automatic permission allowlist, media routing through the prompt, media-type
  mapping, origin canonicalisation, same-origin referrer retention,
  cross-origin referrer trimming, GPC insertion, `X-Client-Data` removal and
  respect for omitted Referer.
- Brave-style URL rules: tracking parameters removed while functional values
  survive, same-site and non-http exclusions, HTTPS upgrade for public default
  ports, and loopback/private/custom-port exemptions.
- Torrents: magnet info-hash validation, tracker filtering, length caps, safe
  display names and device names, stable folder suffixes, seeder/leecher
  counting, protocol badges, and persisted-queue restore (paused rows, cleared
  live counters, malformed/duplicate rejection and the 25-row cap).

## Runtime checks

- **Production shell + seventeen captures.** `pnpm capture` uses the built
  renderer (`dist/index.html`), deep-links each view, waits for render, and
  saves a screenshot. Capture aborts on renderer console errors. Each run uses
  a disposable profile under the temp directory, so a capture can never pick up
  or overwrite the profile of a real installation. All seventeen
  captures produced a non-blank image: `home`, `help`, `services`, `add-service`,
  `service`, `browser`, `browser-downloads`, `browser-history`, `settings`,
  `settings-data`, `settings-shield`, `settings-browser`, `settings-plugins`,
  `settings-about`, `donkey-theme`, `command-palette`, `light-theme`.
- **Live embedded module.** The Sohbet module (`https://sohbet.xiondigital.net/`)
  was loaded in its `persist:svc-*` webview and probed until
  `loading: false`; the captured frame shows the real site.
- **IPC bridge.** The About panel and starter workspace in the captures prove
  the preload `appInfo` and `loadState` paths work through the sandboxed bridge.
- **Shield and extensions.** The packaged Windows build started, attached the
  cached filter engine, and loaded the installed-extension list. A temporary
  Chrome-compatible test extension installed and loaded through the native
  manager; it was removed afterwards. A Web Store harness then downloaded and
  installed Google Translate (MV3), resolved its localized manifest name, and
  removed it with the async cleanup path.
- **Browser hardening.** Session policy installs explicit permission, device
  and Bluetooth denial; outgoing requests receive GPC and trimmed referrers;
  browser tabs use `browser-*` in-memory partitions and are cleared when the
  tab closes. Unit tests cover the pure rules; the capture pass verifies the
  production build still renders and loads real pages with the policy active.
- **About credits.** `settings-about.png` shows the `x529` element readout and
  the two developer links (XiONDiGiTaL, player529) in the running window. The
  header Add/Settings/Help buttons and the Home common-action cards are visible
  in `home.png`; `help.png` shows the clickable quick-help dialog.
- **Click paths.** Offscreen Electron probes clicked the header Add/Settings/Help
  controls and every Home common-action card. Header Help opened the four-action
  dialog; its Settings and Add actions navigated or opened the correct dialog;
  Home cards reached `#/services`, `#/browser` and `#/settings`.
- **Browser library.** The captures show the Downloads panel, the History panel
  with a real `https://example.com/` visit, and the Browser settings section.
  The browser deep link `#/browser?url=…&panel=history` opened the page in its
  own in-memory tab and recorded the visit.
- **Restart persistence.** `pnpm verify:restart` launched the built app in an
  isolated profile, selected Kryvex Light and a Services start view through the
  real theme cards and select, opened a local page in a browser tab, then closed
  the window. The relaunch came back on `kryvex-light` at `#/services`. A second
  run changed the theme and closed immediately: the debounced writer still
  flushed, the relaunch showed Kryvex Dark, and the saved tab reopened with its
  original title. A final launch passed an `http` URL on the command line: it
  opened as a second tab beside the restored one, which is the installed-app
  default-browser path.
- **Download history.** `pnpm verify:downloads` downloaded a local file through
  a tracked Chromium session, found it completed with exact bytes, read the
  persisted record from `kryvex-downloads.json`, reloaded the manager from a
  fresh module instance, removed the record with delete-file, and confirmed a
  second reload no longer lists it.
- **Find and zoom.** `pnpm verify:browser` served a page with three matches,
  clicked the find button, typed into the find bar and read `1 of 3`. It then
  clicked zoom in, read the toolbar label `110%` and the live webview
  `getZoomFactor()` of `1.1`, and reset to `100%` / `1.0`.
- **Torrents.** A Node harness loaded the built main-process torrent manager
  with a minimal Electron path shim, added a real `.torrent` and a magnet, and
  ran a loopback seeder and the app client.
  The app downloaded the file, reported a live seeder and byte progress,
  paused/resumed, removed the record and deleted the managed folder. It then
  shut down the client, loaded a fresh manager from the persisted queue, and
  confirmed both rows came back `paused` with zero speeds/peers and **no**
  WebTorrent client. Resume hydrated the saved `.torrent` and magnet, the
  local pieces were verified, both transferred again from the loopback peer,
  and both folders and the saved metadata were deleted. A second harness
  launched the built app with a seeded profile and opened the Downloads hub:
  the restored row rendered as **Paused** with a **Resume** action and no
  active speed. A live DevTools harness then called
  `window.kryvex.torrentsAddMagnet` through the real preload bridge; one row
  rendered in the Downloads hub with name, protocols and peer stats, and
  removal cleared it. The row was captured as
  `screenshots/browser-torrents.png`.
- **Media permissions.** A real webview loaded a local page calling
  `getUserMedia({audio:true,video:true})`. The shell prompt named
  `127.0.0.1:8765` and both devices; Allow produced two tracks, Block returned
  a denial, an untrusted origin inherited no grant, and geolocation stayed
  denied. The prompt was captured as `screenshots/media-permission.png`.
- **Privacy protections.** A live DevTools harness against the built app
  navigated to `https://example.com/?utm_source=kryvex&keep=1` and observed
  `https://example.com/?keep=1`. It then loaded a local HTTP-only page through
  `127.0.0.1.nip.io` on port 80; HTTPS was refused and the navigation settled
  on HTTP, proving the one-time fallback. EasyList Cookie appeared in the
  refreshed shield lists (about 121,700 filters). Canvas `toDataURL` and
  `getImageData` hashes differed from the unpatched shell, repeated reads
  produced the identical farbled value, and disabling the fingerprint toggle
  made the next load match the native shell again. The harness is
  `scripts/verify-privacy-ui.cjs`.
- **Download manager.** An Electron harness downloaded a local file through a
  tracked session, confirmed the collision-safe path and byte content, removed
  the record, downloaded a second file, and deleted that file from disk. Both
  operations returned the expected records. The current manager is additionally
  covered by `pnpm verify:downloads` above, which reloads the persisted library
  and re-deletes the restored file.
- **Download location.** A real Electron harness selected a custom folder,
  confirmed a downloaded file landed inside it, changed the location again,
  restored and deleted the old file through its retained root, and reset to the
  real Downloads folder. A DevTools harness against the built app then opened
  **Settings → Data**, found the seeded custom path, the Change folder and
  reset actions, pressed reset, and confirmed both the row and
  `window.kryvex.downloadsLocation()` reported the real Downloads folder. The
  native picker itself was not automated; its selected path is normalised by
  the same validated `setDownloadLocation` function exercised by the Electron
  harness.
  The same harness was run with `KRYVEX_APP=release/win-unpacked/Kryvex.exe`
  after an unpacked package build and passed against the packaged app. The
  torrent harness additionally added a magnet after a location change and
  confirmed it landed under the new `Kryvex Torrents` root while the earlier
  row stayed resumable and removable.
- **Default-browser module.** Status reports `supported: true` on Windows and
  `canRegister: false` in an unpacked dev run; argv filtering accepted http(s)
  URLs, rejected `file:`/`javascript:` values, and queued/drained URLs correctly.
  The compiled capability writer was run against a temporary
  `HKCU\Software\KryvexRegTest` key; `reg query` showed the URL ProgID,
  `Application` metadata, `Clients\StartMenuInternet\Kryvex` capabilities,
  http/https `URLAssociations` and the `RegisteredApplications` value. The test
  key was deleted afterwards. The system default was not changed.
- **Installer.** The final build produced `release/Kryvex-Setup-0.5.0-x64.exe`
  (120,113,514 bytes, 114.5 MiB) and `release/Kryvex-Portable-0.5.0-x64.exe`
  (119,876,363 bytes, 114.3 MiB). The setup was installed silently to
  `X:\Veyra\.tmp-release-install-050b`; both shortcuts and the
  `Kryvex 0.5.0` uninstall entry were present, and the installed `Kryvex.exe`
  reported version `0.5.0.0` and completed all seventeen capture routes into a
  separate folder. The portable EXE also launched directly and completed all
  seventeen routes. Silent uninstall removed the install folder, both
  shortcuts and the uninstall entry, and left no Kryvex process. The optional
  `KryvexURL` test keys were covered by the previous uninstall pass and by
  `build/installer.nsh`.
- **Packaged paused restore.** A seeded isolated profile was opened by the
  unpacked and portable 0.5.0 builds. Each rendered the saved torrent as
  **Paused** with **Resume**, no active speed and no transfer. The source
  manager harness separately proved that Resume is the only path that creates
  a WebTorrent client. `verify-torrent-restore-ui.cjs` now accepts `KRYVEX_APP`
  so these packaged checks can be repeated for future releases.
- **Checksums.** `sha256sum -c release/SHA256SUMS.txt` (run from `release/`)
  reports OK for the 0.5.0 Setup/Portable artifacts. The published values are
  `991be75a…3206` for Setup and `42cc1530…89c8` for Portable.
- **Signing state.** PowerShell `Get-AuthenticodeSignature` reports
  `NotSigned` for both EXEs.
- **Dev mode.** `pnpm dev:electron` was started after fixing a Vite
  `publicDir` defect; Vite served the renderer and Electron launched. The dev
  renderer was not visually captured — screenshots come from the production
  build.

## Not executed (do not treat as passing)

- No popup or external-navigation integration test. The download manager and
  torrent queue were exercised through direct Electron harnesses; the magnet
  click-to-queue path is source-reviewed, not clicked in a rendered page.
- No Safe Browsing or malicious-download reputation test. Electron does not
  expose Chromium Safe Browsing here, so the feature is not claimed.
- No native fingerprint-engine test. Farbling is verified as a JavaScript
  wrapper; its detectability and worker/offscreen coverage are documented
  limits, not passing guarantees.
- No `pnpm audit` or dependency scan is recorded for the shipped tree.
- The NSIS wizard was not clicked through manually; installation was verified
  with `/S /D=<custom folder>` instead. No code-signed installer exists and no
  CI workflow has run.
- macOS and Linux were not exercised.

## Reproduce

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm capture             # rewrites screenshots/ from the built app
pnpm verify:restart      # real relaunch: theme, start view and tabs persist
pnpm verify:downloads    # download history and a changed location survive a reload
pnpm verify:location-ui  # download-location row and reset in the real app
pnpm verify:torrents     # torrent queue restores paused across a location change
pnpm verify:torrent-restore-ui  # restored paused row in the real Downloads hub
pnpm verify:browser      # find-in-page and page zoom
```

Each harness sets `KRYVEX_USER_DATA` (or opts into the capture flag) so it uses
an isolated profile; none of them read or modify a real installation's state.
