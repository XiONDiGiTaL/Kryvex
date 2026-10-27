# Testing record: Kryvex (0.3.0–0.8.8)

All results below were produced on 2026-10-19 on Windows with Node 24.19.0,
pnpm 12.3.4 and Electron 44.2.0. Commands were run from `X:\Veyra`; no test was
skipped, weakened or excluded to make the suite pass.

## Automated

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `tsc --noEmit` for renderer and `electron/` (strict) |
| `pnpm test` | exit 0, 137/137 | Vitest: URL normalisation/search resolution, service validation and helpers, starter state, state sanitisation (including saved browser tabs) and registry operations, history, download-history and storage-location validation, page-zoom stepping, catalogue, theme catalogue, Windows browser registration, i18n catalogues, Chrome Web Store URLs, privacy partitions/referrers/headers, URL privacy rewrites and farbling rules, media permission helpers, torrent magnet/name/peer/protocol rules and paused queue restore |
| `pnpm build` | exit 0 | Vite renderer (`dist/`) + `tsc` main/preload (`dist-electron/`); 468.11 kB JS, 54.02 kB CSS |
| `pnpm capture` | exit 0 | Launches the built Electron window in a disposable profile and writes twenty-four 1440×900 PNGs |
| `pnpm verify:restart` | exit 0 | Real app launched repeatedly: theme, start view and a browser tab survive; a setting changed just before close also survives; a URL passed on the command line joins the restored tab |
| `pnpm verify:downloads` | exit 0 | A completed download was written to a chosen folder, the location moved again, then the record was reloaded by a fresh manager and deleted from disk and the library; reset returned to Downloads |
| `pnpm verify:location-ui` | exit 0 | The built app showed a seeded custom folder in **Settings → Data**, offered Change folder/reset, and reset the live path and bridge value to the real Downloads folder |
| `pnpm verify:torrents` | exit 0 | A real `.torrent` and magnet were persisted across a location change, restored paused in a fresh manager with no WebTorrent client, then hydrated on Resume; both downloaded, reported a seed, and deleted their data |
| `pnpm verify:torrent-restore-ui` | exit 0 | The built app opens a seeded profile with a saved torrent row and renders it as paused in the Downloads hub with a Resume action |
| `pnpm verify:browser` | exit 0 | Find-in-page reports `1 of 3` for a local page; zoom reaches 110% on the live webview and resets to 100% |
| `pnpm verify:identity` | exit 0 | A guest page saw `navigator.userAgentData` with a Google Chrome brand, matching platform, `getHighEntropyValues` and `fullVersionList`; `Sec-CH-UA`, `Sec-CH-UA-Mobile` and `Sec-CH-UA-Platform` arrived on the wire with no Electron token; farbling was active (2 pixels perturbed) and its wrappers still reported native code through `Function.prototype.toString` |
| `pnpm verify:shield-filters` | exit 0 | The real engine downloaded 122,097 filters, compiled a custom list from the cached copy without the network, held a scriptlet back while trust was off, hid a custom cosmetic element in a live `<webview>`, ran a custom scriptlet in the page's main world, blocked a custom network rule before it reached the test server, scoped the YouTube bundle to youtube.com, and rebuilt after clearing the editor |
| `pnpm verify:model` | exit 0 | A placeholder `.gguf` plus `scripts/fake-llama-server.mjs`: a non-GGUF path was refused, the runtime started on loopback, `/v1/models` reported the file name, a streamed chat reply arrived, and stop killed the process |
| `pnpm verify:updater` | exit 0 | A loopback GitHub-shaped feed: an installed-mode build selected the version-matched Setup asset, a wrong SHA-256 was rejected with no stored file, a correct SHA-256 produced `ready` with matching bytes, an unpackaged build refused to launch the installer, a source checkout selected no binary and refused to download, and a 404 was reported as `no-release` |
| `pnpm exec electron-builder --dir` | exit 0 | Unpacked Windows app rebuilt from this tree; the packaged `Kryvex.exe` passed `verify:location-ui` with `KRYVEX_APP` |
| `pnpm run package:win` | exit 0 | Setup and Portable EXEs from the 0.5.0 tree; both report version `0.5.0` and `NotSigned` |

Test files: `tests/url.test.ts`, `tests/services.test.ts`, `tests/store.test.ts`,
`tests/themes.test.ts`, `tests/windows-browser.test.ts`, `tests/i18n.test.ts`,
`tests/chrome-store.test.ts`, `tests/privacy.test.ts`,
`tests/url-privacy-rules.test.ts`, `tests/torrent-rules.test.ts`,
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
- Themes: every catalogue theme has a complete token set, valid hex values,
  unique ids, symbols and numbers, the six declared families are all
  represented, the `kryvex-dark` default, both creator plugins (Donkey gold,
  XiØN blue with gradient/glass flags), the 12 planet gradient themes and the
  custom-theme derivation
  (light/dark detection, readable accent ink).
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
- URL privacy rules: tracking parameters removed while functional values
  survive, same-site and non-http exclusions, HTTPS upgrade for public default
  ports, and loopback/private/custom-port exemptions.
- Torrents: magnet info-hash validation, tracker filtering, length caps, safe
  display names and device names, stable folder suffixes, seeder/leecher
  counting, protocol badges, and persisted-queue restore (paused rows, cleared
  live counters, malformed/duplicate rejection and the 25-row cap).

## Runtime checks

- **Vexium capture is manual.** `screenshots/assistant.png` and
  `screenshots/settings-assistant.png` show a runtime answering, so they are
  taken against a live local server (Ollama, LM Studio, or a stand-in that
  speaks the same OpenAI-compatible stream) rather than `pnpm capture`, which
  runs without a runtime and would only photograph the offline state.
- **Production shell + seventeen captures.** `pnpm capture` uses the built
  renderer (`dist/index.html`), deep-links each view, waits for render, and
  saves a screenshot. Capture aborts on renderer console errors. Each run uses
  a disposable profile under the temp directory, so a capture can never pick up
  or overwrite the profile of a real installation. All seventeen
  captures produced a non-blank image: `home`, `help`, `services`, `add-service`,
  `service`, `browser`, `browser-downloads`, `browser-history`, `settings`,
  `settings-data`, `settings-shield`, `settings-browser`, `settings-wallpaper`,
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
  renderer was not visually captured: screenshots come from the production
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
pnpm verify:chromium     # engine switches reach real guest webviews
pnpm verify:identity     # Chrome-shaped UA, client hints and hidden wrappers
pnpm verify:shield-filters  # custom rules, scriptlet gate, YouTube bundle
pnpm verify:model        # local .gguf file through the real runner
pnpm verify:updater      # local release feed, checksums and source-mode guard
pnpm verify:wallpaper    # backdrop is opt-in, theme-derived and image-capable
```

Each harness sets `KRYVEX_USER_DATA` (or opts into the capture flag) so it uses
an isolated profile; none of them read or modify a real installation's state.

## Service engine: 0.6.0 (2026-10-20)

This pass added persistent service apps, notifications, unread badges, auth
popups, per-service session clearing and the expanded preset catalogue. It was
verified on Windows with Node 24.19.0, Electron 44.2.0 and pnpm 12.3.4 from
`X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **124/124** in 16 files | Existing suites plus unread-title parsing, the stable user agent, service partition rules, the new categories and the notification setting |
| `pnpm build` | exit 0 | 496.27 kB JS, 55.26 kB CSS |
| `pnpm capture` | exit 0 | All seventeen 1440×900 routes, including the keep-alive service route |
| `node scripts/verify-service-engine.cjs` | exit 0 | Real app + loopback web app; see below |

`verify-service-engine.cjs` asserts, in one run:

- **Keep-alive:** after opening the fixture service, switching to Services,
  waiting 1.5 s and returning, the guest's `window.__marker` is identical, its
  interval advanced from 1 to 16 ticks while hidden, and its cookie is intact.
- **Exact layout:** `.service-frame` equals `.app-main` (1192×824 at 1440×900),
  the toolbar is 53 px, the guest is 1192×770, and `.app-main` reports
  `overflow: hidden`.
- **Restart persistence:** closing the window and relaunching with the same
  isolated profile still yields `kx=session-ok` in the service partition.
- **Notifications:** the service guest returns `granted` from
  `Notification.requestPermission()`; a browser-tab guest returns `denied`.
- **Auth popup:** `window.open('/popup')` from the service creates a real CDP
  page target whose `document.cookie` contains the same session cookie.
- **Unread:** a `(7) Fixture` title produces `7` in the toolbar, `7` on the
  sidebar pin and `(7) Kryvex` as the window title.
- **Session clear:** the toolbar lock button opens the confirmation dialog; the
  confirmed clear returns an empty cookie from the remounted guest, even though
  the fixture serves pages without re-setting it.
- **User agent:** the guest reports
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36…` with no
  `Electron` token.

Not verified here:

- A real Discord/WhatsApp/Telegram login was not performed (no test accounts).
  The client-side causes of a forced sign-out are covered; server-side token
  invalidation is outside the app's control.
- No OS toast was photographed. Permission is granted and the page constructs a
  `Notification`; the native presenter is Chromium's.
- The interactive Windows popup window's visual chrome and OAuth providers that
  demand a native app handoff were not exercised.
- `pnpm run package:win` was not run for 0.6.0, so the EXEs above remain the
  0.5.0 builds; unsigned artifacts and the missing auto-updater are unchanged.

## Session persistence: 0.7.0 (2026-10-20)

`node scripts/verify-service-engine.cjs` failed on `origin/main` at the restart
step: the app closed its window and quit cleanly, but the service partition's
`Cookies` database held no `kx=session-ok` entry, so the relaunched app opened
the module signed out. An isolated probe showed Electron writes a `persist:`
partition's cookies correctly once `cookies.flushStore()` completes, so the app
now flushes every known partition (plus the default session) from
`before-quit`, holding the quit for at most 1.5 s.

| Command | Result | Scope |
| --- | --- | --- |
| `node scripts/verify-service-engine.cjs` | **PASS** (before the fix: FAIL on `restored cookie`) | Real app, loopback fixture, window close and relaunch with the same isolated profile |
| `npm run typecheck` / `npx vitest run` | exit 0, **260/260** in 27 files | Renderer and `electron/` |

Regression guard: the harness fails if a future change drops the flush, because
it restarts the real app rather than calling `flushStore` directly.

## Updater: 0.6.0 (2026-10-20)

This pass added GitHub release checks, checksum-verified downloads, a
self-install path for packaged NSIS builds, and a manual path for portable and
git builds. It was run on Windows with Electron 44.2.0 and pnpm 12.3.4 from
`X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **137/137** in 17 files | Existing suites plus 13 release-rules tests: tag normalisation, numeric and prerelease ordering, payload rejection, asset version matching, trusted hosts, loopback test feed, checksum parsing and byte formatting |
| `pnpm build` | exit 0 | 513.39 kB JS, 56.85 kB CSS |
| `pnpm verify:updater` | PASS | See the loopback-feed coverage above; actual output reported `available → checksum-failed → ready`, a stored 262,144-byte file with a matching hash, `mode: source` with no asset, and `no-release` |
| `node scripts/release-checksums.cjs .tmp-release-test` | exit 0 | Two fake 9.9.9 artifacts produced a two-line `SHA256SUMS.txt` with the expected hashes |

Not executed here: a tagged GitHub Actions release, a packaged self-install
(the harness refuses to start an installer from an unpackaged tree), running
the downloaded installer, and a real update against
`github.com/XiONDiGiTaL/Kryvex`. Those require publishing a newer tag and
installing the previous build; the manual procedure is in
[UPDATES.md](UPDATES.md).

## Chromium engine settings: 0.7.0 (2026-10-20)

This pass added the Chromium engine panel: launch switches, page preferences,
rendering options and a live engine report. Run on Windows with Node 24.19.0,
Electron 44.2.0 (Chromium 152.0.7977.76) from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode, including the shared `electron/chromium-rules.ts` contract |
| `pnpm test` | exit 0, **187/187** in 21 files | Adds `tests/chromium.test.ts`: defaults, unknown-field and wrong-type rejection, zoom snapping to real steps, state-file reading, the web-preference mapping, launch switches, the renderer/main contract (both zoom lists and defaults must match), and save-time repair of a tampered profile |
| `pnpm build` | exit 0 | Vite renderer + `tsc` main/preload; `dist-electron/chromium.js` and `chromium-rules.js` emitted |
| `pnpm verify:chromium` | **PASS** | See below |
| `pnpm capture` | exit 0 | Twenty-five 1440×900 PNGs, including the new `settings-chromium.png` |

**`verify:chromium` output.** A disposable profile was seeded with every field
set away from its default (`hardwareAcceleration: false`, `smoothScrolling:
false`, `javascript: false`, `images: false`, `webgl: false`, `pdfViewer:
false`, `autoplay: false`, `backgroundThrottling: true`, `spellcheck: false`,
`colorScheme: 'dark'`, `defaultZoom: 1.25`) and a service module pointing at a
local fixture page.

- At launch the engine reported Chromium `152.0.7977.76`, `accelerated: false`,
  `gpu_compositing: disabled_software`, and the switches
  `--disable-smooth-scrolling` + `hardware acceleration disabled`.
- The live guest's recorded preferences matched the seed field for field, its
  zoom factor was `1.25`, and the fixture's inline script never ran: the
  page stayed at `Engine fixture` and `executeJavaScript` was refused entirely.
- In the panel, JavaScript, images and autoplay were switched on, the colour
  scheme set to light and the default zoom to 100%. `chromiumInfo()` reflected
  each change.
- **Rebuild open pages** replaced the guest: the new one attached
  `javascript: true`, `images: true`, `autoplayPolicy:
  no-user-gesture-required`, `zoomFactor: 1`. The rebuilt page ran its script,
  reported a loaded image, saw `prefers-color-scheme: light` and started the
  silent `<audio>` element (`played`).
- A brand-new browser tab on a second origin (its own in-memory partition) got
  the default zoom `1` and the same profile.

**Limits.** Smooth scrolling and hardware acceleration cannot be re-verified
without a restart; the harness proves the switch list and `accelerated: false`
for the launch it made. A rebuilt service guest kept zoom `1.25` for its
already-visited origin, which is Chromium's per-origin zoom map, so default
zoom was proven on a fresh tab instead. PDF rendering, spellcheck suggestions
and background throttling were verified as attached preferences, not by
inspecting rendered PDFs or CPU use.

## Rooms: 2026-10-20

Rooms shipped with the capture broker, the shell permission gate and the
two-instance harness. Verified on Windows with Node 24.19.0, Electron 44.2.0
from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **206/206** in 22 files | Existing suites plus `tests/party-rules.test.ts` (ids, invites, name and message limits, presence reduction) |
| `pnpm build` | exit 0 | 701 kB JS, 79 kB CSS |
| `node scripts/verify-rooms.cjs` | exit 0 | Two real app instances, one real room; see below |

`verify-rooms.cjs` seeds two isolated profiles, mounts a loopback fixture
service in A, creates a room through the button, and joins it in B through
`#/rooms?room=<code>`: the same hash the invite produces.

- **Sources:** `partySources()` listed the fixture as an `app` source plus
  `screen` and every window; the picker rendered them in three groups.
- **Room code:** 26 Crockford base32 characters, generated by the UI.
- **Presence:** both instances reached two entries in `.room-person` (self plus
  the peer) without a reload.
- **Chat:** a line typed into A's composer arrived in B's `.room-msg` verbatim.
- **Screen share:** A picked *Entire screen* in the real picker, clicked
  **Start sharing**, and B's tile decoded remote frames at 2560×1440. A also
  rendered its own muted preview.
- **Signaling:** the default three public WebTorrent trackers, i.e. the
  configuration a user gets, not a test relay.

**A bug this found:** the first build never reached the capture handler. The
hardened permission policy denied `media` for the shell (it only allowed
webviews), and Chromium asks for `media`, not `display-capture`, when the shell
calls `getDisplayMedia`. `permissions.ts` now grants the shell `media` only
while `partyHasPendingPick()` is true, which is cleared as soon as the display
handler consumes the pick. Unarmed requests are still refused, and the harness
proves both halves.

**Limits.** Two instances on one machine, one screen, both peers on the same
network. Not executed: two machines across the internet, a forced-TURN peer, a
room with three or more viewers, and system-audio capture. Do not treat those
as passing.

## Theme gallery: 2026-10-20

The first-run gallery, the Settings section and the upgrade path. Verified on
Windows with Electron 44.2.0 from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **214/214** in 23 files | Adds `tests/theme-gallery.test.ts`: family grouping and order, hero selection and fallback, active-family resolution, the missing-flag migration, and the fresh-install default |
| `pnpm build` | exit 0 | Renderer and main; the gallery styles compile through lightningcss |
| `node scripts/verify-theme-gallery.cjs` | exit 0 | Real app, disposable profile |

The harness launches the built app with a fresh user-data profile and asserts:

- the first-run sheet renders eight family cards with the expected counts
  (CORE 6, SPECTRUM 16, ELEMENTS 21, METALS 7, GEMS 12, PLANETS 12, LIGHT 3,
  TERMINAL 1) and nine or more mock workspaces;
- clicking **GEMS** previews *Sapphire* while `documentElement.dataset.theme`
  stays `kryvex-dark`: a preview must not apply;
- clicking the **Ruby** chip applies `data-theme="ruby"` and closes the sheet;
- after `location.reload()` the sheet is gone and the theme is still `ruby`, so
  both the pick and the dismissal are persisted;
- **Settings** still renders the periodic table (81 tiles including plugins and
  Custom) with `#theme-gallery` positioned after it, showing all eight family
  cards.

Screenshots from that run: `screenshots/first-look.png` and
`screenshots/theme-gallery.png`.

**Not executed:** the web-only preview (no Electron bridge), a downgrade from a
newer state file, and the capture routine's automatic dismissal: the capture
path compiles but the full twenty-five-shot pass was not re-run for this
change.


## Layout clipping: 2026-10-20

The UI report was "aspects are getting chopped graphically". Chopping is a
class of bug: a container with `overflow: hidden` whose content no longer fits
its box. This pass added a harness that fails on that class instead of trusting
one screenshot, then fixed what it found. Verified on Windows with Electron
44.2.0 from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **219/219** in 24 files | Adds `tests/window-rules.test.ts` |
| `pnpm build` | exit 0 | Renderer and main |
| `node scripts/verify-layout.cjs` | exit 0 | 10 window sizes × 6 views, plus the first-run sheet at 4 sizes |
| `node scripts/verify-theme-gallery.cjs` | exit 0 | Adds an assertion that no preview clips its own content |

`verify-layout.cjs` sweeps Home, Services, Browser, Vexium, Rooms and Settings at
2560×1400, 1920×1080, 1440×900, 1366×768, 1280×720, 1104×720, 1040×680,
960×640, 900×600 and 900×520. For every element it compares `scrollWidth` and
`scrollHeight` against the client box when `overflow` is hidden or clip, and it
rejects any horizontal overflow of the document or `.app-main`. A single-line
label with a real ellipsis is the only allowed exception.

**Three defects it found, all fixed:**

1. **Theme previews were clipped by 46 px.** The small gallery mocks stacked two
   cards inside a fixed 86 px frame, so the bottom of every mini workspace (the
   action row and status strip) was cut. They now lay the two cards side by side
   and the frame height follows its content instead of a fixed pixel value.
2. **The large preview had a 12 px clip at 860 px wide.** A narrow-window media
   query forced the large mock to 168 px while its content needed 180. The media
   override was removed.
3. **The first-run sheet hid its own footer at 900×600.** The sheet scrolled as a
   whole, pushing **Keep the current theme** out of reach. The header and footer
   are now fixed and only the gallery scrolls.

**Window fit.** The default 1440×900 window could be larger than a laptop's work
area, which puts the right column and bottom row off-screen: chopping that no
CSS can fix. `electron/window-rules.ts` now fits the initial size to the primary
display's work area with a 32 px margin, keeps a verified floor of 900×520, and
the minimum window is that floor instead of 1040×680. `tests/window-rules.test.ts`
covers a 1440p display, a 1366×768 laptop, a 150%-scaled 1366×768 screen and the
floor.

**Not executed:** a physical 1440p monitor pass, hardware DPI scaling (the
harness emulates smaller CSS viewports, not the OS scale factor), and the
web-only preview.

## Wallpaper backdrop: 0.7.0 (2026-10-20)

The backdrop became opt-in, gained a theme-derived wash next to the user image,
and the panel grew a pill switch that gates its whole body. Run on Windows with
Electron 44.2.0 from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `pnpm test` | exit 0, **222/222** in 24 files | Adds `enabled`/`source` sanitisation, the opt-in default for new and older profiles, and the new panel copy in all four languages |
| `pnpm build` | exit 0 | Renderer and main |
| `node scripts/verify-wallpaper-ui.cjs` | PASS | Real app, disposable profile: off by default, wash on toggle, wash follows a changed accent token, image import through the real file input, tile fit, and off staying off across a reload |

`verify-wallpaper-ui.cjs` reads `.app` instead of trusting the label: with the
switch off the element has no `has-wallpaper` class and
`getComputedStyle(...).backgroundImage` is `none`; switching on paints a
gradient with no `url(...)` layer; the wash's computed colours change when the
theme accent changes; choosing **My image** with no file falls back to the wash;
and `DOM.setFileInputFiles` on the panel's file input produces a decoded,
re-encoded image that paints the shell and is persisted as `source: 'image'`.
Turning the switch off, then reloading, leaves `backgroundImage: none`.

**Not executed:** the wash was checked against computed styles and screenshots,
not a colorimetric comparison across all 90 catalogue themes; and the web-only
preview's localStorage path for images was not exercised.

## Up-to-date verdict: 0.8.0 (2026-10-20)

A check that finds no newer release now proves it instead of leaving the panel
unchanged: a green **UP TO DATE** verdict with a check mark sits beside the
latest-release line, the card takes the theme's success colour, and a manual
check raises a success toast. Run on Windows with Node 24.19.0 and Electron
44.2.0 from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `npx vitest run` | exit 0, **261/261** in 27 files | Adds the verdict and toast copy to all four languages, keeps the JSX copy audit clean |
| `npm run build` | exit 0 | Renderer and main |
| `node scripts/verify-updater.cjs` | PASS | Real app, local feed: the existing release, checksum, download and source cases, then a feed serving the running version. Status becomes `current`, and the panel renders `.update-verdict` with `UP TO DATE`, an SVG check, `.update-status.is-current`, and a computed colour identical to `var(--success)` (`rgb(74, 222, 128)` in Kryvex Dark) |
| `npx electron scripts/verify-local-model.cjs` | PASS | A `.gguf` path is accepted, a non-GGUF path is rejected, the fake llama.cpp server starts on loopback, `/v1/models` reports it, a chat reply streams, and the process stops |
| `node scripts/verify-service-engine.cjs` | PASS | Re-run on the 0.8.0 tree: unread badge `7`, sign-in popup cookie, `cookie after restart: "kx=session-ok"`, and the per-service clear |
| `node scripts/verify-restart.cjs` | PASS | Theme and a browser tab survive an immediate close; a URL passed on the command line joins the restored tab |
| `npm run audit:i18n` | clean | No hardcoded UI strings in 19 renderer files |

`verify-updater.cjs` previously only exercised an available release, so the
new `feedMode = 'current'` case is what guards the verdict from regressing; it
compares the verdict's computed colour against a probe element painted with
`var(--success)` rather than hardcoding a hex value.

**Not executed:** the toast was exercised through the code path and types, not
clicked in a packaged build; the screenshot for this pass came from the source
checkout (`BUILD SOURCE`), and no packaged 0.7.1 exists yet. `verify-local-model`
uses `scripts/fake-llama-server.mjs`, not a real llama.cpp binary with real
weights.

## Window lifecycle audit: 2026-10-21

After the 0.8.1 close crash, every `closed`/`destroyed` handler and every late
callback in `electron/` was checked for reads of an object that may already be
destroyed. Electron's behaviour was measured first, because it decides what a
safe guard looks like:

| Inside a `closed` handler | Result |
| --- | --- |
| `win.isDestroyed()` | returns `true` |
| `win.id` | returns the id |
| `win.webContents` | **throws `Object has been destroyed`** |
| `win.getTitle()`, `win.isVisible()` | **throws** |
| `contents.isDestroyed()` | returns `true` |
| `contents.id` | returns the id |
| `contents.getURL()` | **throws** |

Fixed in the audit:

- `party.ts`, the 0.8.1 crash: the `closed` handler read `win.webContents`.
  The display-media handler also read `shell.mainFrame` without checking whether
  the shell was alive, and `listSources` called `getType()` before `isDestroyed()`.
- `main.ts`: `isShellSender` compared IPC senders against
  `mainWindow.webContents`; it now compares against a `shellContents` reference
  captured at window creation, so an IPC arriving during teardown cannot throw.
- `permissions.ts`: `isShellCapture` read `this.window.webContents` from the
  permission path, and `send` read it again; both use a shell reference captured
  at attach time and `isAliveContents`.
- `extensions.ts`, `torrents.ts`, `storage.ts`: `dialog.showOpenDialog(window)`
  was reached with only a null check; a destroyed parent throws, so each now
  guards with `isAliveWindow` and reports "The main window is not ready."
- Already safe and left alone: `updater.ts`, `downloads.ts`, `assistant.ts`,
  `default-browser.ts`, `party.ts`'s `safeTitle`/`safeDetail`, and `shield.ts`
  all ask `isDestroyed()` before a send or wrap the read in `try`/`catch`;
  `chromium.ts` and `web-privacy.ts` only touch ids on `destroyed` events.

New guard: `tests/lifecycle.test.ts` unit-tests `isAliveWindow`/`isAliveContents`
(including a wrapper that throws from `isDestroyed()`), runs
`node scripts/audit-lifecycle.cjs` over `electron/` and requires a clean report,
and runs the same audit against a fixture containing the old
`win.webContents`-in-`closed` line to prove the audit still catches it.

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npx vitest run` | exit 0, **268/268** in 28 files |
| `node scripts/audit-lifecycle.cjs` | clean, 38 files |
| `node scripts/verify-party-close.cjs` | PASS |
| `node scripts/verify-updater.cjs` | PASS, including the up-to-date verdict |
| `node scripts/verify-service-engine.cjs` | PASS (mount, badge, popup cookie, cookie across restart, clear) |
| `node scripts/verify-rooms.cjs` | PASS (presence, chat, 2560×1440 screen share through the changed display handler) |
| `node scripts/verify-window-guards.cjs` | PASS on all three pickers; FAIL (`1 call(s)`, "Selection cancelled") with the compiled download-picker guard removed |
| `npm run audit:i18n` | clean |

The folder pickers needed their own probe because the crash they could raise
happens before any dialog appears. `scripts/verify-window-guards.cjs`
(`pnpm verify:guards`) replaces `electron` with a stub that counts
`dialog.showOpenDialog` calls, then calls the compiled download, extension and
torrent pickers with a window that answers `isDestroyed()` and throws on every
other property. Passing requires the “not ready” answer **and** zero dialog
calls, so a removed guard fails either by throwing or by reaching Electron. Both
directions were run: deleting the guard from `dist-electron/storage.js` made the
probe report `1 call(s)` and “Selection cancelled”, and restoring the compiled
file returned it to PASS.

**Not executed:** a close while a media prompt is on screen was not staged, so
the permission broker's teardown path is covered by the guard and the type
checker rather than a click-through; and the audit is a heuristic over handler
bodies, not a type check, so a read hidden behind a helper is still possible.

## Close-time exception: 0.8.1 (2026-10-21)

Reported from the installed build: closing Kryvex raised **“A JavaScript error
occurred in the main process, TypeError: Object has been destroyed”** with the
stack pointing at `dist-electron/party.js` inside a `BrowserWindow` `closed`
listener.

- **Cause.** `partyAttachWindow` released its shell reference by evaluating
  `win.webContents` inside the `closed` handler. Electron destroys the window
  before that event, so the getter throws; the exception escapes the listener
  and Electron turns it into the blocking dialog.
- **Proof, isolated from the app.** A probe that created a real `BrowserWindow`
  and read `win.webContents` inside `closed` threw `Object has been destroyed`
  from both `win.close()` and `app.quit()`, so the expression is wrong on its
  own terms rather than only under one close path.
- **Proof, inside the app.** Instrumenting the handler with a `try`/`catch` and
  closing the window printed `THREW reading webContents: Object has been
  destroyed`; the shipped line was the same read. A plain `closed` handler
  without the catch sometimes exits before the exception is reported, which is
  why the dialog is intermittent in a source run and consistent in a packaged
  one.
- **Fix.** The reference is captured at attach time and the handler compares
  against that, touching neither the window nor its contents.
- **Guard.** `node scripts/verify-party-close.cjs` (`pnpm verify:party-close`)
  drives the compiled module with a window that throws on every property access
  once it is marked destroyed. It fails with `Object has been destroyed` against
  the old handler and passes against the new one; that difference was checked in
  both directions rather than assumed.
- `npm run typecheck` exit 0; `npx vitest run` **261/261** in 27 files;
  `npm run build` exit 0.

**Not executed:** the fix was not observed suppressing the dialog in an
installed 0.7.x profile, that build still contains the old line until 0.8.1
installs over it.

**Published 0.8.1 check.** The release workflow passed and published
`Kryvex-Setup-0.8.1-x64.exe` (120,286,681 B, `880b1804…634f`) and
`Kryvex-Portable-0.8.1-x64.exe` (120,049,554 B, `df96bf96…b93e`); downloaded
copies hash to those values and report `ProductVersion 0.8.1`. The downloaded
Portable EXE, launched with no feed override, reported `mode: portable`,
version `0.8.1`, and the live check returned `current`; its extracted
`resources/app.asar` contains `shell === attached` and no longer contains the old
`shell === win.webContents` read; closing that window exited with code 0 and
printed no `Object has been destroyed` or `Uncaught Exception` text.

**Published 0.8.2 check.** The release workflow (run 39559900423) passed every
step and published `Kryvex-Setup-0.8.2-x64.exe` (120,287,904 B,
`41a009f8…e036`) and `Kryvex-Portable-0.8.2-x64.exe` (120,050,696 B,
`5dca57aa…68b6`). Downloaded copies hash to those values and to the digests
GitHub reports, and both EXEs report `ProductVersion 0.8.2` / `FileVersion
0.8.2`. Extracting the Portable build's `resources/app.asar` shows the guards in
the shipped code rather than only in the checkout: `isAliveWindow` before
`dialog.showOpenDialog` in `storage.js`, `extensions.js` and `torrents.js` with
the “The main window is not ready.” answers, `shellContents` in `main.js`'s
`isShellSender`, `isAliveContents` in `permissions.js`, and the attach-time
reference in `party.js`'s `closed` handler; `shell === win.webContents` no
longer appears anywhere in the archive.

That EXE was then launched against a disposable profile via `KRYVEX_USER_DATA`.
It opened a window titled **Kryvex**, wrote its Chromium profile, and was closed
through the window's own close path: the process was gone within 40 s and no
Kryvex process or dialog remained. **Limit:** the numeric exit code was not
captured: PowerShell reports `ExitCode` only for a process it started itself,
and the portable launcher spawns the app as a child, so “closed cleanly” rests
on the window closing, the process disappearing and nothing being left behind,
not on an exit status. The installed 0.8.1 build was not driven through the
in-app self-update; the live feed was checked instead with the compiled
`update-rules`: release `0.8.2`, trusted Setup URL, Portable asset, checksum
entries matching the uploaded digests, `isNewer('0.8.1')` true and
`isNewer('0.8.2')` false.

## Published 0.8.0 artifacts: 2026-10-21

Run after the tag-triggered workflow published the release, against the EXEs
downloaded from `github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.0`, so the
shipped binary is what was checked rather than the source checkout.

| Check | Result |
| --- | --- |
| Workflow run 39523097023 | success: tag/version check, install, typecheck, tests, `package:win`, checksums, publish |
| Asset digests vs `SHA256SUMS.txt` | identical for both EXEs (`352fb5c8…33b3` Setup, `d62b44bc…f5ff` Portable) |
| Version resources | both report `ProductVersion 0.8.0`, `FileVersion 0.8.0` |
| Live feed through `update-rules` | parses `v0.8.0`, trusted Setup and Portable URLs, checksum entries present; `available` from 0.7.0, `current` from 0.8.0 |
| Portable EXE, launched with no feed override | `mode: portable`, `currentVersion 0.8.0`, launch check `phase: current` |
| Settings → Updates in that build | `v0.8.0 · BUILD PORTABLE`, `Kryvex 0.8.0 is the latest release.`, `UP TO DATE` with icon, `.is-current`, colour equal to a `var(--success)` probe |
| **Check for updates** clicked in that build | `toast toast-success`: `Kryvex 0.8.0 is up to date.` |
| Settings → Vexium in that build | `RUN A MODEL FILE`, `IDLE`, empty-model copy, Choose model… / Get models / Download llama.cpp / Find runtime… / Start server |
| Renderer user agent in that build | `Chrome/152.0.0.0`, no Electron token |

**Not executed:** the installed 0.7.x build on this machine was left running and
was not driven through an in-app install, so the self-update itself is covered by
the feed comparison and the artifacts rather than a completed replacement; the
model runner was inspected in the shipped UI but not started against real GGUF
weights, because none are available on this machine.

## Popup tabs: 2026-10-21

A browser tab's `window.open` used to leave for the system browser, so a Google
or Microsoft sign-in finished in another application and the opener page never
received the `postMessage` that completes the flow. `electron/popup-tabs.ts` now
keeps the real popup window (opener and session intact) and places it over the
browser canvas as a popup tab.

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | Renderer and `electron/` |
| `pnpm test` | exit 0, **287/287** in 29 files | Includes 19 new `popup-rules` cases |
| `pnpm build` | exit 0 | Renderer bundle and main process |
| `node scripts/verify-popup-tabs.cjs` | **PASS** | Real app, loopback fixture, CDP |
| `node scripts/audit-lifecycle.cjs` | exit 0, 40 files | No window reads in close handlers |
| `node scripts/audit-i18n.cjs` | exit 0, 19 files | New strings go through `t()` |

`verify-popup-tabs.cjs` opens a loopback page in a browser tab and calls
`window.open('/popup')` with a user gesture from the guest. It asserts, in one
run: a `.tab.is-popup` entry with the popup page's title becomes the selected
tab; the opener page's `message` listener receives `kx-popup-ok` (the step that
fails when the window leaves Kryvex); the popup window's client rectangle equals
the canvas rectangle measured in the shell, drift 0 px; selecting the opener tab
hides the popup window and selecting the popup tab shows it again; closing the
popup removes the tab and returns to the opener.

Not verified here:

- A real Google or Microsoft sign-in was not completed (no test accounts). The
  transport the providers use: `window.opener.postMessage` across a real popup
  on the same session: is what the harness exercises.
- The visual screenshot of the overlay is not captured: screen capture of the
  window region reflects whatever is in front on the desktop, and CDP screenshots
  of the shell do not include a native child window. Placement is proven
  numerically instead.
- A shell modal can render behind an open popup, because the popup is an owned
  window and stays above its parent. This is documented, not fixed.

## In-app self-update, 0.8.1 → 0.8.2: 2026-10-21

The published 0.8.2 artifacts had been checked, but no installed build had been
driven through its own updater. This run did that on Windows 11: the official
0.8.1 Setup (`Kryvex-Setup-0.8.1-x64.exe`, SHA-256
`880b1804…634f`, matching the v0.8.1 `SHA256SUMS.txt`) was installed to
`C:\Kryvex`, and the app was started with an isolated profile
(`KRYVEX_USER_DATA`, `APPDATA` and `LOCALAPPDATA` redirected) plus
`--remote-debugging-port`.

| Stage | What the installed 0.8.1 showed |
| --- | --- |
| Settings → Updates, before a check | `v0.8.1 · BUILD INSTALLED`, "No update check has run yet", `Check for updates` / `View release` |
| After **Check for updates** | `Kryvex 0.8.2 is available.`, `Download update` / `View release` / `Check again` |
| Download | `Kryvex-Setup-0.8.2-x64.exe` written into the profile's `updates/` folder in about three minutes on this connection |
| After the download | `Kryvex 0.8.2 is ready to install.`, "The installer was verified.", `Install and restart` |
| After **Install and restart** | the app quit and the NSIS wizard opened (`Kryvex Setup`, process `Kryvex-Setup-0.8.2-x64`) |

Checks on the artifacts and the result:

| Check | Result |
| --- | --- |
| Downloaded installer | `updates/Kryvex-Setup-0.8.2-x64.exe`, 120,287,904 bytes, SHA-256 `41a009f8c3c9c6cbf8bab3ec830ca18bb4a932492043ca2087f4241573ebe036`: identical to the published digest, so the app's mandatory checksum check passed on the real file |
| Installation target | `C:\Kryvex` (the directory the previous install recorded in `HKCU\Software\<appId>\InstallLocation`), replacing 0.8.1 in place |
| Installed binary | `Kryvex.exe` reports `ProductVersion 0.8.2.0` |
| Relaunched app | `window.kryvex.appInfo()` returns `version 0.8.2`, `packaged true`, Electron 44.2.0 / Chrome 152 |
| Settings → Updates after the update | `v0.8.2 · BUILD INSTALLED`, `Kryvex 0.8.2 is the latest release.`, `UP TO DATE`, "Last checked …" |

Not recorded:

- The wizard was advanced by sending `Enter` to the default button; the page
  sequence and its exact copy were not captured, only the window title and the
  installed result.
- The installer's finish page relaunched Kryvex with the **real** user profile
  (`%APPDATA%\Kryvex`), because NSIS starts the app through the shell rather
  than inheriting the test instance's environment. The version check was then
  repeated on a separate launch with an isolated profile.
- The machine's installed copy was 0.7.0 before this run and is 0.8.2 now; that
  is the end state an update would have produced, but it was a real change to
  the user's installation rather than a sandbox.
## 0.8.3 release candidate: 2026-10-21

Run on the release tree at version 0.8.3, on Windows 11 with Node 24.19.0,
Electron 44.2.0 and npm 12.0.2 (`pnpm` is not on this shell's PATH, so the same
entry points were run through npm, npx and node).

| Check | Command | Result |
| --- | --- | --- |
| Renderer and `electron/` types | `npm run typecheck` | exit 0 |
| Unit suite | `npx vitest run` | exit 0, **287/287** in 29 files (19 new popup-rule cases) |
| Renderer and main-process build | `npm run build` | exit 0 |
| Window-lifecycle audit | `node scripts/audit-lifecycle.cjs` | clean, 40 files |
| Translation audit | `node scripts/audit-i18n.cjs` | clean, 19 renderer files |
| Popup tabs | `node scripts/verify-popup-tabs.cjs` | PASS, 0 px drift |
| Updater, all phases | `node scripts/verify-updater.cjs` | PASS |
| Service engine | `node scripts/verify-service-engine.cjs` | PASS |

The popup run reported the following, in its own words:

```
{"opener":"http://127.0.0.1:8126/","tab":"Fixture sign-in","openerMessage":"kx-popup-ok",
 "canvas":{"x":248,"y":130,"width":1192,"height":722},
 "popupRect":{"title":"Fixture sign-in","x":808,"y":383,"width":1192,"height":722},
 "drift":0,"returned":"Popup fixture"}
```

The updater run exercised the same phases as before: `available` for a fixture
release, `checksum-failed` for a corrupted download, `ready` after a verified
one, the **ready to install** card, `no-asset` for a source checkout,
`no-release` for a missing feed, and the **UP TO DATE** verdict with
`color rgb(74, 222, 128)` equal to the `--success` probe. The service engine run
repeated mount, unread badge, service notification permission, keep-alive, the
auth popup cookie, the cookie surviving a restart and per-service clearing.

**Not run for this candidate:** `verify:guards`, `verify:restart`,
`verify:downloads`, `verify:location-ui`, `verify:torrents`,
`verify:torrent-restore-ui`, `verify:browser`, `verify:chromium`, `verify:rooms`,
`verify:gallery`, `verify:layout`, `verify:wallpaper`, `verify:identity`,
`verify:shield-filters`, `verify:model` and `verify:party-close`. This release
changes popup routing in `main.ts` and browser tabs in the renderer; none of
those harnesses was re-run, so they are not claimed for this tree.

## Published 0.8.3 artifacts: 2026-10-21

Run after the tag-triggered workflow published the release, against the EXEs
downloaded from `github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.3`.

| Check | Result |
| --- | --- |
| Workflow run 39582848868 | success: tag/version check, install, typecheck, tests, `package:win`, checksums, publish |
| Release state | `v0.8.3` published, `isDraft: false`, `isPrerelease: false` |
| Asset digests vs `SHA256SUMS.txt` | identical for both EXEs (`ed91ad07…8787` Setup, 120,292,667 B; `850fe2c6…8ec4` Portable, 120,055,522 B) |
| Version resources | both report `ProductVersion 0.8.3` |
| Shipped archive | the Portable EXE's `resources/app.asar` reports package version `0.8.3`, contains `dist-electron/popup-tabs.js` and `dist-electron/popup-rules.js`, and `main.js` registers `kryvex:popups:list|canvas|show|hide|hide-all|close|action`; the placement code has `skipTaskbar` and `setBounds`, and the policy has `background-tab` and `about:blank` |

**Not executed:** the Portable EXE from this release was not launched; the update
run below exercised the installed build instead, and the archive was inspected
statically.

## In-app self-update, 0.8.2 → 0.8.3: 2026-10-21

The installed 0.8.2 at `C:\Kryvex` was driven through its own **Settings →
Updates** to the published 0.8.3. The app was started from that install with an
isolated profile (`KRYVEX_USER_DATA`, `APPDATA` and `LOCALAPPDATA` redirected)
and `--remote-debugging-port`; the panel was read and clicked through DevTools in
the real renderer.

| Stage | What the installed 0.8.2 showed |
| --- | --- |
| Before a check | `v0.8.2 · BUILD INSTALLED`, "No update check has run yet.", `Check for updates` / `View release` |
| After **Check for updates** | `Kryvex 0.8.3 is available.`, "Download the installer, then Kryvex verifies it against the release checksum.", `Download update` / `View release` / `Check again`, notes `**Full Changelog**: …/compare/v0.8.2...v0.8.3` |
| After **Download update** | `Kryvex 0.8.3 is ready to install.`, "The installer was verified. Kryvex closes, runs it, and you can reopen when it finishes.", `Install and restart` |
| After **Install and restart** | "Closing Kryvex to install…", `Installing…`; the app exited with code 0 and the wizard opened |

Checks on the artifacts and the result:

| Check | Result |
| --- | --- |
| Downloaded installer | `updates/Kryvex-Setup-0.8.3-x64.exe`, 120,292,667 bytes, SHA-256 `ed91ad0793de3a504c1a2667fbe464959da57429ee7c80af1240ed86533b8787`: identical to the published digest, so the mandatory checksum check passed on the real file |
| Time to ready | the panel was already at `is-ready` at the first poll 1.5 s after **Download update**; the download was not re-measured for throughput |
| Installation target | `C:\Kryvex`, replacing the installed 0.8.2 in place |
| Installed binary | `Kryvex.exe` reports `ProductVersion 0.8.3.0` and a write time of 2026-10-21 06:14 |
| Relaunched app | `window.kryvex.appInfo()` returns `version 0.8.3`, `packaged true`, Electron 44.2.0 / Chrome 152.0.7977.76 |
| Settings → Updates after the update | `v0.8.3 · BUILD INSTALLED`, `Kryvex 0.8.3 is the latest release.`, `UP TO DATE`, "Last checked Oct 21, 2026, 06:19 AM" |
| **Check for updates** again | stayed `current` with the same title and verdict |

Not recorded:

- The wizard was advanced by sending `Enter` to its default button. Only the
  window title (`Kryvex Setup`) and the installed result were captured, not the
  page sequence or its copy.
- The installer process's exit code came back empty (PowerShell returned no
  value), so "the wizard finished" rests on the process exiting, the EXE being
  replaced and the new version reporting itself.
- The finish page relaunched Kryvex with the **real** user profile
  (`%APPDATA%\Kryvex`), because NSIS starts the app through the shell rather
  than inheriting the driver's environment. That instance was closed with a
  window close, and the version check was a separate launch with an isolated
  profile.
- Before this run the installed copy was 0.8.2, the version the previous
  self-update run left behind; this run moved the real installation to 0.8.3
  rather than a sandbox.

## Self-update harness: 2026-10-21

Every release before this one was checked with a one-off driver written for that
release, and the installer wizard was never captured: NSIS renders its pages as
native controls, so a CDP screenshot of the shell does not include them and the
wizard's pages were always a stated gap. `scripts/verify-self-update.cjs`
(`pnpm verify:self-update`) and `scripts/verify-wizard.ps1` make that repeatable.

```bash
pnpm verify:self-update              # installed build against the live feed
pnpm verify:self-update --wizard     # also capture the wizard page by page
pnpm verify:self-update --installer <path>   # capture a specific installer
pnpm verify:self-update --exe <path>         # a non-default installation
```

`--archive` copies the capture into `docs/media/releases/<version>-wizard/`:
`wizard.json`, a PNG per page and a `capture.md`, so the release record carries
what its installer showed. `pnpm release:check` fails when the record for the
current version has no such section or archive, and the release workflow runs
that check before it builds anything, so a tag cannot ship a record that omits
the wizard.

What the driver does:

1. Resolves the installed `Kryvex.exe` from `HKCU\Software
et.xiondigital.kryvex`
   (`InstallLocation`), falling back to `C:\Kryvex`.
2. Starts it with an isolated profile and a DevTools port, so the user's settings,
   tabs and sessions are untouched.
3. Reads and clicks the real **Settings → Updates** panel: the version header, the
   status card, the verdict and the button row.
4. On `available`, clicks **Download update**, hashes the file the app wrote and
   compares it with `SHA256SUMS.txt` from the live release, then clicks **Install
   and restart**.
5. Attaches to the installer the app spawned detached, captures every page as
   text plus a PNG, presses each page's forward button, and reads the installer's
   exit code from a process handle opened while it was alive.
6. Reads the installed binary's version afterwards and closes any Kryvex process
   the wizard's finish page relaunched.

The wizard capture works on the dialog's own controls: visible children are read
with their class, text and screen position, sorted into visual order, and the
forward button is clicked by posting `WM_COMMAND` with its control id. Three
things had to be measured rather than assumed:

- **`Enter` did not advance the wizard.** On the first page focus sits on a radio
  button, so the keystroke never reached the default button and the capture
  stalled. The forward button is now clicked through `WM_COMMAND`, which needs no
  focus at all.
- **Clicking `IDOK` on the install page skipped the file copy.** The first version
  sent the command regardless of state, and the installer's disabled **Next >**
  during installation advanced past the copy: five pages appeared and the
  installation directory was never rewritten. The script now checks
  `IsWindowEnabled` and waits instead.
- **An unchanged `Kryvex.exe` timestamp does not mean nothing was written.** NSIS
  restores the archive timestamps of the files it copies, so a same-version
  reinstall leaves `Kryvex.exe` looking untouched while replacing `resources` and
  `locales`. The harness therefore judges progress from the wizard: an install
  page that ran for 20.5 s, a finish page, and exit code 0, not from file times.

### Run on this machine, installed 0.8.3 (latest published 0.8.3)

| Check | Result |
| --- | --- |
| Live feed check | `is-current`, `Kryvex 0.8.3 is the latest release.`: nothing newer to install |
| Installer used for the wizard run | `Kryvex-Setup-0.8.3-x64.exe`, 120,292,667 B, hash equal to `SHA256SUMS.txt` |
| Wizard pages | 4 captured with a PNG each: `Choose Installation Options` → `Choose Install Location` → `Installing` → `Completing Kryvex Setup` |
| Page 1 copy | "Who should this application be installed for?", "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| Install page duration | 20,560 ms between `Installing` and `Completing Kryvex Setup` |
| Installer exit code | 0, read from a handle on a process the script started |
| Attach path | the same capture against a **detached** installer found by name also passed: 5 pages, exit code 0, so the path the app's own hand-off uses is exercised |
| Relaunched app | the finish page started Kryvex with the real profile; those processes were closed by the harness |
| Report | `.tmp-self-update/report.json` and `.tmp-self-update/wizard/{wizard.json,pages/*.png}` |

Not verified by this run, and not claimed:

- No version-changing install was available, because 0.8.3 is the latest release.
  The wizard was captured by reinstalling 0.8.3 over itself, which the installer
  itself labels a reinstall/upgrade, and the app's app→installer hand-off was
  exercised separately through the attach path. The next release is the first
  one this harness will carry through a real version change.
- The assertions that read page titles match English copy (`install`, `complet`,
  `please wait`). A localized installer would need its own patterns.
- The wizard runs with elevation only when the chosen directory needs it; a
  protected install path was not staged.

## In-house tools and the 0.8.5 build: 2026-10-22

This pass added Lexium, the media player and one periodic-table tile for the
three secret services, then packaged and installed the result. Run on Windows
with Node 24.19.0, pnpm 10.34.7 (via a temporary shim; pnpm is not on `PATH`
here), electron-builder 26.15.3 and Electron 44.2.0 from `X:\Veyra`.

| Command | Result | Scope |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | Renderer and `electron/` in strict mode |
| `npx vitest run` | exit 0, **390/390** in 40 files | Adds `tests/lexium.test.ts`; store sanitisation for the two new settings blocks; the weather-coordinate guard |
| `npm run build` | exit 0 | 922.93 kB JS, 141.60 kB CSS |
| `npm run audit:i18n` | clean | 30 renderer files, including the new tool panels |
| `npx electron-builder --publish never` | exit 0 | `Kryvex-Setup-0.8.5-x64.exe` (120,540,823 B) and `Kryvex-Portable-0.8.5-x64.exe` (120,303,620 B), both `ProductVersion 0.8.5`; built before the caption change, so the published EXEs come from the tag workflow instead |
| `node scripts/check-release-record.cjs` | PASS | 11 checks, 5 wizard pages |
| `pnpm verify:self-update --installer … --no-app --wizard --archive --version 0.8.5` | PASS | Five pages, install page 21,668 ms, exit 0, archived under `docs/media/releases/0.8.5-wizard/` |

**Installed-build probe.** A CDP harness launched `C:\Kryvex\Kryvex.exe` (the
installer's output, not the source tree) with `KRYVEX_USER_DATA` and `APPDATA`
pointed at a disposable profile. It reported
`{version: "0.8.5", electron: "44.2.0", chrome: "152.0.7977.76", node:
"24.20.0", packaged: true}`, dismissed the first-run sheet, and read the three
secret-service marks as `x530 Lx`, `x531 Mx` and `x532 8-bit`. `#/lexium` and
`#/player` rendered their own pages.

The first installed build failed its own screenshot: a 3× zoom of the Services
row showed the emulator caption rendered as `[ Emulato…`, an ellipsis on the one
tile the release was about. Shrinking a caption longer than ten characters kept
the whole word, but the release review asked for a shorter label instead, so the
caption is now `[ Retro ]` and the accessible name stays **Emulator**. Measured
in the built renderer through the same CDP harness: caption box 46.16 px inside
a 58 px tile, `scrollWidth === clientWidth === 46`, 7 px type, and
`aria-label="Emulator · element x532 · 8-bit"`.

**Not executed:** no real Whisper or LibreTranslate server was running for this
pass, so Lexium's tabs were rendered but not driven end to end here (the earlier
0.8.5 work exercised transcription against a local-whisper-compatible test
server and OCR against a generated image). The emulator, Rooms screen share,
torrents, VPN, Steam sign-in and the shield were not re-run; this batch changes
no code in those paths. The packaged close path was not re-checked against this
build beyond the wizard's own exit code.

**Known console message.** With CDP attached, the shell logs
`Electron sandboxed_renderer.bundle.js script failed to run` /
`Cannot destructure property 'preloadScripts' of 'binding.startupData'`.
Nothing fails to render, `window.kryvex` works, and no preload, webview or
sandbox file changed in this batch. It is recorded here as an observation, not
as a passing check.

**Build-machine quirk.** `pnpm run package:win` fails on this machine because
electron-builder detects pnpm from the lock file and cannot run it. Packaging
used a temporary pnpm shim on `PATH` plus
`--config.electronDist=<pre-extracted Electron 44.2.0>`, which also avoids an
`EPERM` rename of `release/win-unpacked.tmp` seen three times on this drive.

## Published 0.8.5 artifacts: 2026-10-22

The `v0.8.5` tag (`4b382ce`) triggered release run
[39761506782](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/39761506782),
which completed successfully: tag/version check, release-record check, install,
typecheck, 390 tests, the one-time-code relay, packaging, checksums and publish.
The release is stable (not a draft or prerelease).

| Asset | Bytes | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.5-x64.exe` | 120,457,454 | `2e33e00edda119173556e890644c7e5997e468d349f5ca94a99a79baaaa337cb` |
| `Kryvex-Portable-0.8.5-x64.exe` | 120,220,324 | `1dbd21a5866e7cf61fc2e48feb4efc6826fb16f6c8a88ffdfa70242341557830` |
| `SHA256SUMS.txt` | 189 | covers both |

All three were downloaded from `releases/download/v0.8.5/`; `sha256sum -c
SHA256SUMS.txt` reports OK for both EXEs, and both report `ProductVersion
0.8.5`.

The published Portable EXE was run with `--remote-debugging-port=9334` and an
isolated `KRYVEX_USER_DATA`/`APPDATA`. `window.kryvex.appInfo()` returned
`{"version":"0.8.5","platform":"win32","electron":"44.2.0","chrome":"152.0.7977.76","node":"24.20.0","packaged":true}`.
On `#/services` the emulator tile read `x532` / `8-bit` / `[ Retro ]` with
`aria-label="Emulator · element x532 · 8-bit"`, `scrollWidth === clientWidth ===
46` and 7 px type, no ellipsis in the shipped build. Capture:
`screenshots/release-0.8.5-published-tile.png`.

**Published Setup installed.** With the pilot app stopped, the downloaded Setup
ran with `/S` against the existing per-user install; `C:\Kryvex\Kryvex.exe`
reports `0.8.5.0`, Windows still lists **Kryvex 0.8.5**, and a CDP probe of the
installed binary read `[ Retro ]` on `x532` with `scrollWidth === clientWidth ===
46` (`screenshots/release-0.8.5-installed-tile.png`). The wizard itself was
captured earlier from the locally built Setup (five pages, exit 0). An in-app
`0.8.4 → 0.8.5` update was **not** exercised, because this machine was already
running 0.8.5.

## Reviewed model downloads: 2026-10-22

Built after the 0.8.5 tag, on `feature/vexium-model-manager`. The starter model
was approved first; nothing was fetched before that.

| Check | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | Renderer and `electron/`, strict |
| `npx vitest run` | exit 0, **407/407** in 41 files | Adds `tests/model-rules.test.ts` (17 tests) |
| `npm run build` | exit 0 | Renderer and main rebuilt |
| `npm run audit:i18n` | clean | 31 renderer files |
| `node scripts/check-release-record.cjs` | PASS | 0.8.5 record unchanged |

**Built-app run.** The built Electron app was driven through CDP with an
isolated `KRYVEX_USER_DATA`. Before any click the panel showed the pinned facts
(`1,117,320,736` B and the full SHA-256) and **Download** was the only action;
`models/` did not exist yet. After the click the progress bar read
`Downloading 264 MiB of 1.04 GiB` with `aria-valuenow="24"`. The transfer
finished at exactly `1,117,320,736` bytes; hashing that file locally produced
`6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`, and the
only file in `models/` was the `.gguf` (no `.part` left).

**Use, delete, regression.** **Use this model** pointed `modelStatus().path` at
the installed file while leaving the phase `stopped` (no `llama-server` here).
The first delete attempt failed: the guard compared the *selected* path, so a
model that was merely configured was treated as running. The guard now checks
the runtime phase, and the retest removed the file, emptied
`kryvex-models.json` and reported “The model file was deleted.” Screenshot:
`screenshots/vexium-model-manager.png`.

**Not run:** a real `llama-server` start against the downloaded file (no runtime
installed on this machine), a cancelled mid-transfer, a forced hash mismatch
(covered by unit tests), and a transfer on a slow or dropping connection.

## Service media in the status bar: 2026-10-22

The service transport moved out of the workspace and into the status bar: a
compact strip at rest, with the full island revealed on hover or when pinned.
This ships in 0.8.7 together with Disk pulse; it was written on `main` after
the 0.8.6 tag.

| Check | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | Renderer and main |
| `npm test` | exit 0, **444/444** | Existing suite, unchanged |
| `node scripts/audit-i18n.cjs` | clean | 34 renderer files |
| `npm run build` | exit 0 | Rebuilt before the harness |
| `node scripts/verify-service-ux.cjs` | PASS, **39 assertions** | Includes the status-strip, idle-fade, edge-reveal and hover checks |

**Real-app run.** The harness opened a local audio service. The transport
rendered inside `.status-bar` as a 20 px strip, and no island existed while the
page was in use. With the pointer over the service guest, the strip went idle
(`.is-idle`, opacity 0, `pointer-events: none`) and left no island open; the
guest swallows pointer moves, so this also proves the edge hold expires instead
of waiting forever for a host event. Moving the pointer into the bottom 96 px
brought the strip back to opacity 0.6. A real pointer move then opened the
island, whose bottom sat at 869.5 px against a status-bar top of 876 px, and it
stayed open while the pointer crossed the gap and moved over the panel. Moving
into the sidebar closed it again. `Escape` closed the pinned island, and
leaving the service kept the strip available on Home while the guest stayed
visible and kept playing. Captures:
`screenshots/verify-service-media-inline.png`,
`screenshots/verify-service-media-dock.png`,
`screenshots/verify-media-dock-home.png`.

## Service surfaces: 2026-10-22

Built from the 0.8.5 tree on `main`, after the resource, pinned-menu, parked
frame, media-dock, shield-bundle and icon changes. Nothing was released.

| Check | Result | Detail |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 | Renderer |
| `npx tsc --noEmit -p tsconfig.electron.json` | exit 0 | Main process |
| `npx vitest run` | exit 0, **421/421** in 42 files | Adds `media-rules` and the YouTube pruning test |
| `npx vite build` + `tsc -p tsconfig.electron.json` | exit 0 | 951 kB renderer bundle |
| `node scripts/audit-i18n.cjs` | clean | 33 renderer files |
| `node scripts/check-release-record.cjs` | PASS | 0.8.5 record unchanged |
| `node scripts/verify-service-ux.cjs` | PASS | 26 assertions |
| `npx electron scripts/verify-shield-filters.cjs` | PASS | 123,258 network filters; client installed in a real guest |

**Real-app run.** The UX harness launched the built app with an isolated profile
and a local `audio` page. It right-clicked the pinned rail and found all seven
actions in a themed menu (`borderRadius` non-zero, panel background not
transparent). Activity showed `THIS APP ONLY`, Kryvex CPU and Kryvex memory;
outside-click and `Escape` both closed it, and the sidebar's own **×** removed
the compact block. Opening the local service produced a dock titled
`Tone Lab Theme`; the dock's Pause reached the guest (`audio.paused === true`)
and Play resumed it. Navigating Home left the frame `display: flex`, the guest
reported `document.visibilityState === "visible"`, and the audio kept playing
with the dock still visible. Captures:
`screenshots/verify-service-context-menu.png`,
`screenshots/verify-resource-panel.png`,
`screenshots/verify-service-media-dock.png`,
`screenshots/verify-media-dock-home.png`.

**Not run, plainly.** A real YouTube or Spotify page was not played in this
batch, so the site-specific selectors and the ad-pruning client were exercised
against a synthetic player response and a real Chromium guest, not a live
account. A full installer/portable artifact was not produced: the first
`electron-builder --dir` attempts failed on this machine with `EPERM` renaming
`win-unpacked.tmp`, and the builder could not find `pnpm` on PATH. With a
temporary `corepack pnpm` shim and `--config.npmRebuild=false`, the directory
build succeeded; its `Kryvex.exe` carried the Kx icon
(`screenshots/packaged-exe-icon.png`), and `resources/icons/kryvex.ico` was
present in the package. The installed `C:\Kryvex\Kryvex.exe` 0.8.5 also still
carries that icon (`screenshots/installed-exe-icon.png`). The package was not
signed or released.

## Windows notification identity: 2026-10-22

A toast click opened Electron's default welcome page. Windows resolves a toast
through the Start Menu shortcut whose AppUserModelID matches the notifier. The
installed app and the source checkout were both using `net.xiondigital.kryvex`,
while Electron's unpackaged `Electron.lnk` pointed at the bare `electron.exe`.
That shortcut therefore competed with `Kryvex.lnk` for the installed app's
toasts; selecting it launched Electron with no app path.

The packaged identity now stays on `net.xiondigital.kryvex`; a source run uses
`net.xiondigital.kryvex.dev`. `Notification.handleActivation` is registered so
an Action Center click restores and focuses the window.

| Check | Result | Detail |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 | Renderer |
| `npx tsc --noEmit -p tsconfig.electron.json` | exit 0 | Main process |
| `npx vitest run` | exit 0, **423/423** in 43 files | Adds `notifications.test.ts` for the identity split |
| `npx vite build` + `tsc -p tsconfig.electron.json` | exit 0 | Renderer bundle rebuilt |
| Built app launched with an isolated profile | pass | A guest renderer reported `--app-user-model-id=net.xiondigital.kryvex.dev` |
| Running `C:\Kryvex\Kryvex.exe` | observed | Its renderer reported `--app-user-model-id=net.xiondigital.kryvex`, so the installed shortcut keeps its own identity |
| Packaged-AUMID toast, clicked | pass | Windows resolved it to `Kryvex.lnk`, brought the installed window to the foreground (`foreground=Kryvex`), and started no Electron process |

A source run's cold toast click can still open Electron's welcome page: Electron
creates `Electron.lnk` with the bare executable as its target, and changing that
requires an installed executable. The packaged app is the supported path for
click-to-relaunch. The installed 0.8.5 binary was not replaced, so the packaged
side of this change was checked from the running process identity, the shortcut
layout and a clicked toast, not from a newly installed build.

## Browser start page, private tabs and feeds: 2026-10-22

`scripts/verify-browser-start.cjs` drives the built Electron app with an
isolated profile and a local fixture server. It does not inspect source or call
the parser directly; every check below happened through the rendered page.

| Check | Result | Detail |
| --- | --- | --- |
| Start page cards | pass | Shield, field guide, feeds and quick-launch cards all present |
| Home button position | pass | First control in `.browser-toolbar`, labelled `Home` |
| RSS through the visible form | pass | The fixture story appeared after typing the URL and pressing Add feed |
| OPML through the file input | pass | Two feed chips, Atom story appeared |
| Options menu | pass | New tab, New private tab, Home, library entries, Close private tabs, Shield settings |
| Private tab marking | pass | `.tab.is-private` and `.browser-start.is-private` |
| Private history | pass | `/article` never reached persisted history |
| Private session | pass | No private tab in `kryvex-state.json` |
| Ordinary history | pass | The same `/article` was persisted from an ordinary tab |
| Close private tabs | pass | Menu action removed every `.tab.is-private` |
| Feed errors | pass | No unavailable-feed note after both fixtures loaded |
| Screenshots | pass | `screenshots/browser-start.png`, `screenshots/browser-private.png`, captured by Electron `Page.captureScreenshot` (no overlay) |

`tests/rss.test.ts` covers RSS 2.0, Atom, CDATA, entities, relative item URLs,
permalink GUIDs, the 12-item cap, cross-feed deduplication, OPML import and
persisted-feed sanitisation. `tests/rss-rules.test.ts` covers the main-process
URL allowlist. `tests/store.test.ts` covers private-tab removal on load and the
feed add/remove reducers.

## Disk pulse: 2026-10-22

The secret storage tool: analyzer, guarded cleaner and its verification harness.
Read-only in the harness; deletion is proven against a fixture, not the user's
drive.

| Check | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | Renderer and main |
| `npm test` | exit 0, **466/466** | 48 files, including the 22 disk tests |
| `node scripts/audit-i18n.cjs` | clean | 35 renderer files |
| `npm run build` | exit 0 | Renderer bundle and main process |
| `node scripts/verify-disk-pulse.cjs` | PASS, **12 assertions** | Real app, disposable profile |

**Real-app run.** A fresh profile opened `#/disk`; the theme gallery was closed,
the disclaimer appeared before any scan and was accepted, the health panel read
`97% FULL` with `29 GB` free and `902 GB` used of `931 GB`, and Analyze listed
seven cleanup categories with the real `%TEMP%` size (`14 MB`, 20 files). The
clean button armed only after the scan and was not pressed. The analyzer drew
eight drive folders, largest first (`Users` 11 GB).

Scans run in a worker thread, and the harness proves it from the outside: while
the drive walk was still running, a `kryvex:disk:health` call from the renderer
answered in **0 ms**, and a second scan was started and stopped again so the
worker teardown path is exercised. Capture:
`screenshots/verify-disk-pulse.png`.

`tests/disk-rules.test.ts` covers containment (`Temp-evil` is outside `Temp`),
drive roots, protected subtrees, traversal, the 24-hour filter, target lookup and
size formatting. `tests/disk-service.test.ts` runs the real cleaner against a
fixture: old files in the root and a subdirectory are removed, a fresh file and
the root survive, and a path or unknown id is refused before any unlink.
`tests/disk-scan.test.ts` covers the scan body the worker thread runs: target
sizing with the age filter, unavailable caches, an aborted signal returning
cancelled with zero sizes, and real `statfs` health.

## Self-update 0.8.6 → 0.8.7: 2026-10-22

The published chain, driven through the app's own Updates panel rather than a
loopback fixture. The machine already had 0.8.6 installed at `C:\Kryvex`, so the
test downgraded it first: the published `Kryvex-Setup-0.8.6-x64.exe` (SHA-256
`5eb83690…` matched against the 0.8.6 `SHA256SUMS.txt`) was installed with
`/S /D=C:\Kryvex`, and `C:\Kryvex\Kryvex.exe` then reported `0.8.6.0`.

`node scripts/verify-self-update.cjs --exe C:\Kryvex\Kryvex.exe` then launched
that build with an isolated profile and pressed the real buttons:

| Check | Result | Detail |
| --- | --- | --- |
| live feed check | PASS | `0.8.6.0` installed, feed offered `Kryvex 0.8.7 is available.` |
| installer download | PASS | `Kryvex-Setup-0.8.7-x64.exe`, 120,492,592 B |
| checksum | PASS | downloaded SHA-256 `79653c01a0f93ba17f7b25b6446183037cc7a5d2c5b9f6a344775c0c40c96daa` equals the published `SHA256SUMS.txt` entry |
| app quit | PASS | `{code: 0}`, so NSIS could replace the files |
| installer wizard | PASS | five pages, install page ran 39,940 ms, exit 0 |
| version after | PASS | `C:\Kryvex\Kryvex.exe` reports `0.8.7.0` |
| relaunch | PASS | the updated build boots with an isolated profile and `appInfo()` returns `{version: "0.8.7", packaged: true}` |

The download landed in the isolated `%APPDATA%\Kryvex\updates` and was removed
with the profile. Four Kryvex processes the installer relaunched were closed
afterwards; no Kryvex or setup processes were left running.

## Extension packages: `extract-zip` replaced, 2026-10-22

Two Dependabot advisories landed against `extract-zip` 2.0.1, the direct
dependency the extension installer used to unpack `.zip`/`.crx` packages, and
neither has a patched release: GHSA-jmr9-qjv8-65gv (a symlink entry pointing
outside the destination) and GHSA-7pqw-9j4j-h8q3 (a symlink entry followed by a
file of the same name, writing through the link). Both need the archive to
decide where bytes land, so [electron/zip-extract.ts](../electron/zip-extract.ts)
reads the central directory itself and refuses symlinks, special file types,
absolute and parent paths, backslash separators, names Windows folds together
(trailing dot or space, `CON`, `NUL`), duplicate names and file/folder
collisions before it writes anything; files are created with `wx`, the
unpacked total is capped at 256 MB, and ZIP64, encryption and every method but
stored/deflate fail with a message the install dialog can show.

`tests/zip-extract.test.ts` covers 21 cases: intact bytes for stored and
deflated entries, folder case preserved, the symlink-then-file chain from the
advisory, ten hostile name shapes, case-folded duplicates, file/folder
collisions, encryption, unknown methods, ZIP64, size mismatches, a deflate bomb,
a non-ZIP buffer, an empty archive, an existing file at the target and a
truncated archive.

Checked against real packages from the Chrome Web Store, comparing every
extracted file with Python's `zipfile` by SHA-256:

| Package | Bytes | Files | Missing / extra / differing |
| --- | --- | --- | --- |
| uBlock Origin Lite 2026.1021.1354 | 9,170,770 | 929 | 0 / 0 / 0 |
| Dark Reader 4.9.133 | 849,702 | 89 | 0 / 0 / 0 |
| Bitwarden 2026.10.0 | 24,874,412 | 194 | 0 / 0 / 0 |

The app's own path was then driven end to end with the compiled
`dist-electron/extensions.js` and a stubbed Electron: `installFromWebStore`
installed uBlock Origin Lite (2,390 ms), the record appeared under
`<userData>/extensions/ext-…`, `manifest.json` unpacked, the folder was handed to
`session.extensions.loadExtension`, and removal deleted it and emptied the
records. A crafted CRX holding a symlink and a file beneath it was refused with
"The package contains a symbolic link.", nothing was written for it, and the
install list stayed unchanged.

Electron moved 44.2.0 → 44.9.3 in the same change, which clears the four
Electron advisories below 44.5.0. `pnpm audit --prod` afterwards reports one
high, `ip` (GHSA-2p57-rm9w-gvfp), reached as
`webtorrent > torrent-discovery > bittorrent-tracker > ip`; there is no patched
version and `bittorrent-tracker` calls only `ip.toString` from the tracker
*server* parser, which this app never runs, so the vulnerable `isPublic` path is
never reached.

`pnpm audit:deps` (`scripts/audit-deps.cjs`) is the standing replacement for the
Dependabot alerts, which are disabled on the repository: it runs `pnpm audit`
across every scope, fails on high and critical advisories, and carries the `ip`
advisory above as its only exception. Checked on 2026-10-22: PASS with the
exception printed, exit 1 with the exception removed, and exit 1 when `pnpm` is
not on PATH, so a broken audit cannot report success. CI runs it before
typecheck, and the release workflow runs it again after install so a tag cut
days after `main` was last green is checked against the advisories of that day.

Every exception carries a `reviewBy` date and the gate fails once it passes.
Checked with copies of the script (no `pnpm` on PATH, to prove the policy check
runs before the audit): `reviewBy` set to the previous day → exit 1,
`STALE … was due for review on 2026-10-22 and is now 2026-10-23`; `reviewBy`
deleted → exit 1, "needs a review date"; `2027-02-31` → exit 1 (it is not
a calendared day, and `Date.parse` alone would have rolled it into March);
`reviewBy` set to the current UTC day → PASS, so the date is inclusive. The
shipped exception (`ip`, `2027-04-22`) passes and prints its review date.

The 14-day warning was checked at the boundary with copies of the script, each
run with `GITHUB_ACTIONS=true`: `reviewBy` at +0, +1, +13 and +14 days → PASS
with an `EXPIRING` line and a `::warning::` annotation ("due today", "due
tomorrow", then "in N days"); +15 and +16 days → PASS with no warning, so the
boundary is inclusive and silent beyond it. The same +3-day copy run without
`GITHUB_ACTIONS` prints the `EXPIRING` line with no `::warning::` text, so a
local run never shows annotation syntax. The shipped exception is 181 days out
and prints no warning.

The runner path was proven rather than inferred on 2026-10-23: with the
exception's `reviewBy` temporarily set three days out on a throwaway branch,
dispatched run 39893563434 logged
`EXPIRING     GHSA-2p57-rm9w-gvfp (ip) review is due in 3 days, on 2026-10-26…`
and `GET /repos/…/check-runs/{id}/annotations` returned one entry at level
`warning` with that text, so the annotation is real and not just printed. The
branch was deleted afterwards; `main` never carried the temporary date.

The annotation's location was fixed and re-proven on 2026-10-23. Local copies
run with `GITHUB_ACTIONS=true` emit
`::warning file=scripts/audit-deps.cjs,line=38::…`, and line 38 is the line of
the shipped exception's `id` (`grep -n` confirms it), so the position is derived
from the file rather than hard-coded. Without `GITHUB_ACTIONS` the command is
still never emitted. On a throwaway branch with the date three days out,
dispatched run 39897268568 returned an annotation with
`path=scripts/audit-deps.cjs line=38`; the earlier run had reported
`path=.github line=11`, which is the symptom this change removes. The branch was
deleted afterwards and `main` still carries `reviewBy: '2027-04-22'`.

## Wellness widget: 2026-10-23

New Home widget, off by default until the intake form is completed.
`tests/wellness.test.ts` (27 cases; the suite is now 514) covers local day keys,
BMI and its bands, the Mifflin-St Jeor estimate (1780 kcal for 80 kg, 180 cm and
30 years, 2760 at moderate activity), water-goal rounding and clamps, XP per
component, level thresholds and the cap, streaks with and without today, the
seeded daily task, log insertion/replacement/capping, water pacing, bedtime
rounding past midnight, and the stored-state sanitiser (off without an intake,
clamped goals, impossible dates dropped, later duplicate days replacing earlier
ones).

The web preview was driven end to end on `127.0.0.1:5199`: heart → intake form →
175 cm, 72 kg, 1996, moderate → save, which produced BMI 23.5 (Healthy) and a
2460 kcal target; then +250 ml, 7.5 hours of sleep, the daily task and Check in.
XP read 26 (8 check-in + 8 sleep + 10 task); reaching the 2000 ml goal took it to
38, and a reload kept both the log and the widget enabled. Turning Wellness off
in the Widgets picker hid the card, and the heart reopened it with the saved
values pre-filled. No console errors, `node scripts/audit-i18n.cjs` reports no
hardcoded strings, and `pnpm build:web` passes.

Not executed: the packaged desktop build (`pnpm build && electron .`). The
widget holds renderer state only and touches no IPC, so the web preview runs the
same code, but the Electron shell was not launched for this change.

## Media dock controls and service force-close: 2026-10-23

Two gaps were closed in the service surfaces. The bottom media flyout now has a
volume slider, a mute button and a repeat toggle for the page that is playing,
and every row in the resource manager has a **Kill** button that force-closes
one module.

The dock additions are page-level. `electron/media-rules.ts` grew
`clampPageVolume` and `dockGuardScript`; `electron/media.ts` installs the guard
on each service guest's `dom-ready` once the user has changed something, and
re-installs it after a navigation. The guard sets `volume` on the current media
element and on every later `play` (document capture, so a single-page player
that swaps elements keeps the level), and on `ended` it rewinds and restarts
the clip; a rejected `play()` reloads the page instead. `serviceVolume` and
`serviceRepeat` live in `settings.player`, sanitised so an older state file
reads as full volume with looping off.

`serviceSessions.stop` closes every guest in one partition with
`waitForBeforeUnload: false`, which is the part a page cannot veto. The shell
then removes the frame, clears the module's unread count, leaves its view if it
was open, and keeps the partition, so the site still remembers the user. The
button arms on the first press for four seconds, like an end-process prompt.

**Unit tests.** `tests/media-rules.test.ts` adds three cases: volume clamping
(fractions, 0, above 1, negatives, numeric strings, `NaN` and `undefined`),
the guard carrying `volume` and `repeat` (and treating anything other than
`true` as off), and the script's document-level `play`/`ended` listeners plus a
valid-JavaScript parse. `tests/store.test.ts` adds two: a state file without
`serviceVolume` reads 1, and saved values are clamped (7 becomes 1, -1 becomes
0) while `serviceRepeat: true` survives. The suite is 519/519.

**Desktop harness.** `node scripts/verify-service-ux.cjs` (after
`pnpm build`) drives the real Electron app against a local audio page. New
passing checks:

- the island exposes `.media-dock-volume-range`; moving it to 40 sets the
  guest's `<audio>.volume` to 0.4;
- the repeat guard arrives in the page carrying 0.4, and with the fixture's own
  `loop` disabled the clip restarts at the end (observed at 0.367 s, not
  paused);
- the first press on **Kill** only arms the button (`Kill?`) and the module
  keeps running;
- the second press removes `s-tone` from the stage, navigates to `#/services`,
  leaves `s-pause` mounted, and the killed row leaves the panel.

The fixture moved its second service to `localhost` because the resource
sampler attributes guests by host and two services on `127.0.0.1` shared one
row, which would have hidden whether the killed module left the panel. The
harness runs unpackaged `electron .`; the installer and release pipeline were
not exercised for this change.

**Other checks.** `npm run typecheck` exits 0 for both projects;
`node scripts/audit-i18n.cjs` reports no hardcoded strings in 36 renderer
files; `npm run build` and `npm run build:web` (1.3 MiB) both pass.

## Em dash sweep: 2026-10-23

The spaced em dash was removed from the interface, documentation, scripts and
comments: 621 occurrences across the tracked text files, leaving zero literal
em dashes in the repository. Replacements are context-aware rather than
mechanical: a label or heading takes a colon (`## Vexium: a local assistant`),
a parenthetical pair becomes parentheses (`on your machine (Ollama or LM
Studio) over loopback`), a clause that starts with a conjunction takes a
comma, and a sentence that already contains a colon takes a comma to avoid a
second one. One matcher keeps the glyph as an escape rather than prose:
`chrome-store.ts` strips a `\u2014` suffix from page titles. The RSS entity
table now maps `&mdash;` to a hyphen, and standalone placeholder dashes became
`n/a`. Translation keys and their values were rewritten together, and the i18n
audit plus all 519 tests still pass.

## Home widgets, notes toggle and ordering: 2026-10-23

Sticky notes became an opt-in widget and the four Home cards moved from fixed
positions to a small registry. `src/lib/home-widgets.ts` holds the ids, the
persisted boolean behind each one, the default column and the pure helpers that
normalise a saved order, list one column, and move a card past its neighbour.
`HomeSettings` gained `widgetOrder` and `widgetAreas`; `sanitizeHome` runs both
through the registry, so a saved file that predates the registry keeps its
booleans and gets the default order, and an unknown id is dropped rather than
trusted. `showTasks` remains the flag for notes, but its default is now `false`;
a file with no saved order predates the Notes button, so its `true` is read as
the old default once and comes back closed. After that first save the order is
present and the user's own notes choice is kept.

In the shell, the heart gained a note button beside it that toggles the notes
card, and the Widgets picker lists every card with a position number, up and
down buttons limited to its own column, and a Main/Side switch. A column with no
visible card is not rendered, and `.home-board.is-single` lets the main stack
take the full width. Moving a card into the side column is what lets another
widget use the space when the guide is closed, while the guide keeps its own
in-card collapse.

**Unit tests.** `tests/home-widgets.test.ts` adds 9 cases: order normalisation
(duplicates, junk and a newly registered id appended), column sanitising,
a cross-column move that leaves the other column untouched, movement stopping
at both ends, visibility filtered by flag and column, notes off for a new
workspace, a pre-registry `showTasks: true` closing once, that choice kept after
an order exists, and a saved order that predates the registry repaired. The
suite is 528/528.

**Web preview.** `npx vite --port 5191` was driven in the browser panel. The
fresh board rendered weather and guide with no notes card, and the toolbar
showed `Show sticky notes` with `aria-pressed=false`. Pressing it inserted
`.home-tasks` into `.home-board-main` and the button became `Hide sticky notes`.
Opening Widgets listed four rows with position numbers `1, 2, 2, 1` for the two
columns. `Move Sticky notes to the side column` placed `.home-tasks` before
`.home-guide` inside `.home-board-side`; `Move Sticky notes down` swapped them.
Hiding the guide removed `.home-guide` while notes stayed in the side column;
hiding notes as well removed `.home-board-side` and left a single 558 px
column with `is-single` set. The preview console showed no errors or failed
requests.

**Other checks.** `npm run typecheck` exits 0 for both projects,
`node scripts/audit-i18n.cjs` reports no hardcoded strings in 36 renderer files,
and `npm run build:web` passes (1.3 MiB).

Not executed: the packaged desktop build. The board is renderer-only state with
no IPC, and the web build runs the same components, but the Electron shell was
not launched for this change.

## Spotify ad mute and skip: 2026-10-23

An opt-in guard for the Spotify module, off for every existing and new
workspace. `settings.player.spotifyAdGuard` is sanitised as `true` only when it
was saved as a boolean `true`, so an upgrade cannot start muting a module.
`src/App.tsx` pushes the switch to the main process once at launch and on every
change; `kryvex:spotify:guard` is accepted only from the shell.

`electron/spotify-ads.ts` polls each Spotify service guest every 1.2 s while the
switch is on, mutes the guest with `webContents.setAudioMuted` when its player
reports an ad, restores the module's own mute policy when the ad ends, and
presses one control at most once every 20 s. `electron/spotify-rules.ts` holds
the host and podcast checks, the marker sets, the probe and skip scripts, and
the cooldown. The page is read, never rewritten; no network request, cookie or
account field is touched.

Podcast breaks are detected from an `/episode/` or `/show/` path and from show
markers in the now-playing bar, with the Media Session title and album as a
fallback for breaks that change metadata without changing the bar. A podcast
never uses the generic Next control, because that advances to the next episode;
it uses an explicit `control-button-skip-ad`, `ad-skip-button` or a button
labelled Skip ad when Spotify provides one, and otherwise stays muted until the
break ends. Track ads keep the Next fallback.

**Unit tests.** `tests/spotify-rules.test.ts` adds 15 cases: the web player over
https is recognised while lookalikes, plain http, junk and non-strings are not;
episode and show paths are recognised while track, playlist and home paths are
not; the probe parses and returns the `{ad, podcast, track, skipAd}` object,
keeps its markers, does not use the permanent sidebar slot and carries the
podcast escape hatch; the guest payload is sanitised to booleans; the skip
decision needs an explicit control unless the context is a track; a skip script
without Next contains only the explicit Skip ad control, while the track form
keeps both; the cooldown allows the first attempt, refuses a recent one, allows
one at the boundary and refuses a `NaN` clock; the restore helper keeps a module
muted only when its policy says so; and the setting defaults to off, survives a
saved `true`, ignores `'yes'`, and leaves `serviceVolume` and `serviceRepeat` at
their existing defaults. `tests/i18n.test.ts` adds two catalogue cases: one
checks that every translated playback key resolves in Spanish, German and
French, and one covers the settings title, the toggle label and `GUARDED`.
The suite is 547/547.

**Browser checks.** Vite previews on `127.0.0.1:5192` and `127.0.0.1:5193` were
driven in the browser panel, and `/electron/spotify-rules.ts` was imported into
the page for a DOM fixture. With
`<div data-testid="now-playing-bar">` fixtures, the probe returned `ad: true`
for a `context-item-info-ad-subtitle` label and for the exact label
`Advertisement`, and `ad: false` for a normal artist plus a sidebar
`ad-slot-container`, for a track whose text is just `Ad`, and for a page with no
now-playing bar. The podcast flag was true for a `/episode/` path and for a
`context-item-info-show` marker, and false for a track path. A Media Session
title of `Advertisement` with no bar also reported an ad. The track flag was
true for a track page and for a playlist with an artist link, and false for an
episode or the home page, so an unclear context is mute-only. The skip script
without Next clicked an explicit Skip ad button and did not click an enabled
Next button; the track form clicked Next. Both refused `disabled`,
`aria-disabled="true"` and a missing button. A disabled explicit control was
never clicked: the track script fell back to Next, while the podcast script
returned without one. In Settings, opening **Service playback** revealed the
switch, turning it on changed the block meta to `GUARDED`, set
`aria-checked="true"` and saved `settings.player.spotifyAdGuard: true` to local
storage. The podcast wording was present in the panel. The preview console
showed no errors.

**Other checks.** `npm run typecheck` exits 0 for both projects,
`node scripts/audit-i18n.cjs` reports no hardcoded strings in 36 renderer files,
`npm run build` and `npm run build:web` both pass (1.3 MiB).

Not executed: playback of a real Spotify track ad or podcast break, because that
needs a signed-in account and Spotify serving an ad. The mute, restore and skip
sequencing is covered by the rule tests and the DOM fixture, but the live
selectors and Spotify's actual podcast Skip ad control are unverified against a
current build. The 0.8.8 packaging pass below exercises the packaged installer.


## 0.8.8 build and bundled runtime: 2026-10-23

The tag candidate was built on this machine with the pinned runtime and a
disposable profile.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 547/547 across 52 files |
| `npm run audit:i18n` | clean, 36 renderer files |
| `npm run build` | exit 0 |
| `electron-builder --publish never --config.electronDist=node_modules/electron/dist` | produced `Kryvex-Setup-0.8.8-x64.exe` and `Kryvex-Portable-0.8.8-x64.exe` |
| Packaged `appInfo()` | `{version: "0.8.8", packaged: true, electron: "44.9.3"}` |
| Bundled runtime | `resources/bin/llama-server.exe`, `runtime.json` release `b11835`, 44 MB |
| Model run | Qwen2.5-1.5B from `X:\KryvexData\models` started on loopback, `/v1/models` answered, chat returned `{ok: true}`, stop returned `stopped` |
| Wizard capture | 4 pages, install page 25,923 ms, installer exit 0, installed `C:\Kryvex\Kryvex.exe` reports 0.8.8.0 |
| `check-release-record.cjs` | PASS |
| Published artifacts | stable v0.8.8 release; both EXEs downloaded and `sha256sum -c SHA256SUMS.txt` passed; each reports `ProductVersion 0.8.8` |
| `verify-service-ux.cjs` | PASS on rerun; dock volume and repeat reached the guest page (the first run hit a transient DOM race after the idle transition) |

## Spotify and YouTube playlists in the player: 2026-10-23

The player's playlist import and its YouTube bridge were built from the 0.8.8
tree on `main`. Nothing was released.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` | exit 0, **565/565** across 56 files |
| `npm run audit:i18n` | clean, 38 renderer files |
| `npm run build` | exit 0; 1,079 kB renderer and both Electron targets |
| Live Spotify embed | the public Today's Top Hits page parsed to 50 tracks, each with artist, preview URL and full-track link |
| Live YouTube page and continuation | 100 rows from the playlist page plus 82 from one browse continuation, with titles, artists and durations |
| Built-app import | a Spotify playlist added 50 rows and started its first preview from `p.scdn.co`; a YouTube video added one row and a second import of it added none |
| YouTube bridge | the selected video loaded through `http://127.0.0.1:<ephemeral>/youtube?v=...`; the bridge reported its duration and the transport advanced the clock |
| Empty/private/oversized paths | covered by unit tests for the classifier, both parsers, dedupe and the 500-row cap |

**Regression found and fixed during the run.** The player page's attach effect
runs before the provider's mount effect. The provider was calling `attach(null)`
on mount, which cleared the stage the page had just attached and left the local
media element in the hidden host: a Spotify preview still played, but the stage
and any local video were blank. The mount effect now only seeds the host when no
stage is attached. The retest placed the local video inside `.player-screen` and
kept the YouTube iframe in its positioned host.

**Not run, plainly.** A full YouTube video was not watched to its end, so
completion, auto-advance and repeat on a real embed remain unverified beyond the
reported duration and clock. Spotify import depends on its public embed markup;
the parser was checked against today's live page, not a fixture of every locale.

## Vexium Core naming and one-click setup: 2026-10-23

There is no trained in-house model in this tree. Vexium Core is the product name
for the supported local stack: the included llama.cpp runtime plus the reviewed
Qwen2.5-1.5B-Instruct artifact. The upstream name, publisher and Apache-2.0
licence remain visible, and the catalogue keeps `name` separate from
`productName`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` | exit 0, **566/566** across 56 files |
| `npm run audit:i18n` | clean, 38 renderer files |
| `npm run build` | exit 0; 1,087 kB renderer and both Electron targets |
| Built-app card | showed **Vexium Core**, `Qwen2.5-1.5B-Instruct · Qwen (Alibaba Cloud) · Apache-2.0 · Q4_K_M`, and the installed list repeated both names |
| Provider order | **VEXIUM CORE** was first and active in a fresh profile; OLLAMA and LM STUDIO followed |
| Configured but stopped | the Model row named `qwen2.5-1.5b-instruct`, said the local server was stopped, and selected it instead of showing an empty runtime |
| One-click start | both the model row and the card offered **Start Vexium Core**; the action configured the installed path and called `modelStart`, and the seeded placeholder `.gguf` then produced the expected load error |
| Existing profiles | a saved provider is preserved; only a fresh or missing assistant state defaults to Vexium Core |

A real 1.1 GB model was not re-started in this pass; the bundled runtime and
real starter were already measured in the 0.8.8 run above. The one-click test
used a deliberately invalid placeholder to keep the check fast, so success on a
valid model is supported by the earlier runtime evidence, not by this fixture.

## Google sign-in: the claim, not the engine (2026-10-23)

The refusal reported from Gmail's sign-in was reproduced without credentials.
Google's identifier step answers `/v3/signin/rejected` ("This browser or app may
not be secure") for any email, so a guest can be driven to that step and its
verdict read from the page. Each run used a fresh profile, a `persist:svc-*`
partition, real key events through `webContents.sendInputEvent`, and one
identifier submit; the identifier was `kryvex.probe.test@example.com`.

| User agent | Client hints | Identity preload | Farble | Google's answer |
| --- | --- | --- | --- | --- |
| Chrome, reduced (`Chrome/152.0.0.0`) | Chrome brands | on | off | refused |
| Chrome, reduced | Chrome brands | off | off | refused |
| Chrome, full (`Chrome/152.0.7977.167`) | Chrome brands | on | off | refused |
| Chrome, reduced | none | off | off | refused |
| Electron (`Kryvex/... Electron/44.9.3`) | Chrome brands | on | off | account step |
| Electron | none | off | off | account step |

The user agent was the only variable that changed the verdict: Google refuses a
page that claims Chrome from an engine it can tell is not Chrome, and lets the
same engine through when it names itself. "Account step" means the page showed a
captcha, or answered "Couldn't find this account" for the fake identifier; it
never showed the refusal card.

The fix follows from that measurement. `electron/sign-in-hosts.ts` recognises
`accounts.google.*`, `myaccount.google.*` and `accounts.youtube.com`; those
hosts get the application's own user agent on the wire and through
`webContents.setUserAgent`, no client hints, no identity preload and no
fingerprint farbling. Every other page keeps the Chrome identity the 0.8.0 work
established.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` | exit 0, **571/571** across 57 files; adds `tests/sign-in-hosts.test.ts` (host rule, ports, lookalikes) and two `withApplicationUserAgent` cases in `tests/user-agent.test.ts` |
| `npm run build` | exit 0 |
| `npm run verify:identity` | **PASS**: a loopback guest still reports `Google Chrome / Chromium / Not(A:Brand`, the running engine's full version in `getHighEntropyValues`, a `Navigator.prototype` accessor returning `[object NavigatorUAData]`, `Sec-CH-UA` headers on the wire, farbling active with native-looking wrappers, and seed 0 for `accounts.google.com` while an ordinary page keeps its seed |
| End-to-end guest | the sign-in page's `navigator.userAgent` was the application's agent, `navigator.userAgentData.brands` was Chromium's own, no own `userAgentData` property existed, and the identifier submit reached Google's account step instead of `/v3/signin/rejected` |

**Not run, plainly.** No real Google account was signed in, no captcha was
solved, and no other provider was tested. The probe scripts were temporary and
are not in the tree; the steps above are enough to rebuild them. Google can
change the gate at any time, and a stale stored session remains a separate
failure the refusal banner still covers.

## Vexium Core on launch, the page card and the 0.8.9 build: 2026-10-23

Vexium Core became the provider a profile actually uses, so three follow-ups were
built and measured together: a started runtime now survives a relaunch, the
Vexium page states what is installed and can start it, and a profile saved on
Ollama's untouched default moves to the local stack once.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` | exit 0, **583/583** across 58 files; adds `tests/vexium-core.test.ts` (`resolveAssistantSettings` migration, `shouldAutoStartCore`, `installedCoreFor`) |
| `npm run audit:i18n` | clean, 38 renderer files |
| `npm run build` | exit 0 |
| `npm run package:win` | exit 0: `release/Kryvex-Setup-0.8.9-x64.exe` (`beef57815f77cbbd…`, 128.1 MiB) and `release/Kryvex-Portable-0.8.9-x64.exe` (`e51968fa55404748…`, 127.9 MiB), both `ProductVersion 0.8.9` |
| Real model | `%APPDATA%\Kryvex\models\qwen2.5-1.5b-instruct.gguf`, 1,117,320,736 bytes, started by the bundled llama.cpp `b11835` |
| Auto-start in the packaged app | `release/win-unpacked/Kryvex.exe` with a copied profile (`KRYVEX_USER_DATA`): the chip reached **RUNTIME ONLINE** with no click, and the card read **RUNNING** with `qwen2.5-1.5b-instruct` and its loopback origin |
| Card actions | **Stop server** took the card to **STOPPED** with **Start Vexium Core** in its place; clicking it returned the chip to **RUNTIME ONLINE** and the card to **RUNNING** |
| Streamed reply | "Reply in one short sentence confirming you are online." streamed back **"I am online."** from the real weights |
| Migration | a saved `ollama` / `127.0.0.1:11434` / no-model profile resolves to `local` / `127.0.0.1:8080` once and keeps `migrated: true`; a saved model or a user-set Ollama address is preserved |
| Setup over 0.8.8 | `Kryvex-Setup-0.8.9-x64.exe /S /D=C:\Kryvex` exit 0: `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.8.9.0` and `FileVersion 0.8.9`, `resources\app.asar` is the 0.8.9 build (44,544,043 bytes), `resources\bin\llama-server.exe` is present, and the HKCU uninstall entry reads `DisplayVersion 0.8.9` |
| Installed app | launched from `C:\Kryvex` with the existing profile: Settings showed `0.8.9`, the chip reached **RUNTIME ONLINE** with no click, the card read **RUNNING** for `Qwen2.5-1.5B-Instruct · 1.04 GiB` on `http://127.0.0.1:5227`, and a reply streamed back |
| Saved state | `settings.assistant` ended as `local` / the chosen loopback port / empty model / `migrated: true`; quitting the app killed the runtime and left only `TIME_WAIT` sockets on that port |

The packaged runs drove the built renderer over `--remote-debugging-port` with a
throwaway profile first and then with the real one; the scripts were temporary
and are not in the tree. **Not run:** no tag, release record or installer wizard
capture exists for 0.8.9, so `pnpm release:check` would refuse that tag.
`pnpm audit:deps` could not run in this shell because `pnpm` was not on `PATH`;
it is not evidence about the dependency tree either way.

## 0.8.9 release record, wizard capture and the web build: 2026-10-23

The release record and the installer wizard capture are the two things the
tag-triggered workflow refuses to build without, and the published PWA was still
serving its 0.8.4 bundle, so both were closed out together.

| Check | Result |
| --- | --- |
| `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer release/Kryvex-Setup-0.8.9-x64.exe --version 0.8.9` | PASS: four pages captured, install page ran 23,012 ms, installer exited 0, 33,366 ms end to end, archived to `docs/media/releases/0.8.9-wizard/` |
| `node scripts/check-release-record.cjs` | PASS for 0.8.9: record, `## Wizard capture` section, capture link, manifest, 4/4 pages, 4/4 screenshots, text on every page |
| `npx vite build --outDir dist-web` | exit 0: `assets/index-CS5hOLB_.js` (1,092.94 kB) and `assets/index-C71yy4YJ.css` (180.61 kB), `sw.js` cache `kryvex-web-0.8.9-v1` |
| `node scripts/check-web-build.cjs` | PASS (1.3 MiB): manifest, 192px and 512px icons, service worker shell, hashed bundle |
| `gh-pages` publish | commit `99c67f4` on `XiONDiGiTaL/Kryvex`; the branch holds exactly the `dist-web` tree plus `.nojekyll` |
| Live HTML | `https://xiondigital.net/Kryvex/` and `/index.html` both served `index-CS5hOLB_.js` with `age=0` |
| Live app | a cold incognito visit to `#/settings` rendered Settings and the status bar read `v0.8.9`, with no console errors |

The first wizard attempt walked all five pages but lost its manifest when
`scripts/verify-wizard.ps1` read `MainWindowHandle` after the dialog had closed
and passed `$null` to `IsWindow`; a null now means `IntPtr.Zero`, and the rerun
above is the archived capture.

**Not run:** no `v0.8.9` tag was cut, so no GitHub Actions release exists and
the published EXEs have not been hash-verified. A browser tab that loaded the
0.8.4 bundle keeps it until it reloads, and GitHub Pages caches HTML for ten
minutes, so a warm tab can show the old version briefly after a publish.

## Currency converter endpoint: 2026-10-23

The Home converter asked `api.frankfurter.app`, and the published 0.8.9 web build
showed **Rates are unavailable right now** beside a working weather card. The
fetch was the failure, not the rates.

| Check | Result |
| --- | --- |
| `fetch('https://api.frankfurter.app/latest?from=USD&to=EUR')` from the page | `TypeError: Failed to fetch` |
| the same URL from Node, redirects not followed | `301`, `location: https://api.frankfurter.dev/v1/latest?from=USD&to=EUR`, no `access-control-allow-origin` |
| `fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR')` from the page | `200`, `{"amount":1.0,"base":"USD","date":"2026-10-23","rates":{"EUR":0.89342}}` |
| a neighbouring cross-origin call (`api.open-meteo.com`) from the same page | `200`, so the browser had network egress |

So the old host redirects to the new one without CORS headers, and the browser
rejects the redirect before the request is ever made. `CurrencyWidget` now calls
`https://api.frankfurter.dev/v1/latest?base=<from>&symbols=<to>`; the response
shape the card reads (`rates[to]`, `date`) is unchanged.

| Check after the fix | Result |
| --- | --- |
| `npm run build:web` | exit 0, bundle `assets/index-GS008kh0.js`, `check-web-build` PASS |
| `gh-pages` publish | commit `a9b9f31`; served HTML points at `index-GS008kh0.js` |
| Live card, 100 USD to BRL | `$100.00 = R$504.65`, `1 USD = 5.0465 BRL`, dated `Oct 23` |
| Live calculator, `7 × 8 =` | `56` |

Not run: the desktop build was not re-exercised for this fix; the widget uses the
same `fetch` in both, and the failure was a browser CORS rule rather than an
Electron difference.

## 0.8.9 tag and published build: 2026-10-23

The release record, wizard capture, web rebuild and the converter fix were
committed to `main` as `5d1d948`, and `v0.8.9` was cut from it.

| Check | Result |
| --- | --- |
| `npm run typecheck` before the commit | exit 0 |
| `npm test` before the commit | exit 0, **583/583** across 58 files |
| `npm run audit:i18n` | clean, 38 renderer files |
| `node scripts/check-release-record.cjs` | PASS for 0.8.9 |
| `npm run build:web` + `check-web-build.cjs` | PASS, 1.3 MiB, `assets/index-GS008kh0.js` |
| Workflow run 39979410726 | success in 2m44s: tag/version check, `release:check`, `audit:deps`, typecheck, tests, one-time-code relay, `package:win`, checksums, publish |
| Release state | `v0.8.9` published, `isDraft: false`, `isPrerelease: false` |

Published assets, downloaded from `releases/download/v0.8.9/`:

| Asset | Bytes | SHA-256 | `ProductVersion` |
| --- | --- | --- | --- |
| `Kryvex-Setup-0.8.9-x64.exe` | 134,257,313 | `81059d4dd90ae33b807af46984925437652d354cd8e7b4400bdef482f0259f9d` | 0.8.9 |
| `Kryvex-Portable-0.8.9-x64.exe` | 134,020,092 | `1f3ec163b80e02b4b868155b858296ad6071b46f1304c01cdc0226801bdbc0ad` | 0.8.9 |

`sha256sum -c SHA256SUMS.txt` reports OK for both, so the digests the updater
checks are the digests of the files a user downloads.

**Not run:** the published EXEs were not installed and launched again; the
locally built 0.8.9 pair had already been installed over 0.8.8 and exercised
(above), and the workflow build differs only by its CI environment. A local
`electron-builder` rebuild after the converter fix failed with
`EPERM` renaming `release/win-unpacked` on `X:`, which is why no local 0.8.9 EXE
contains that one-line fix; the tag build does.

## Google sign-in: one identity per site family (2026-10-24)

The 0.8.9 fix changed identity per *host*, which meant a Gmail sign-in claimed
Chrome on `mail.google.com`, reported Kryvex on `accounts.google.com`, and
claimed Chrome again on the way back. Google's post-password risk check runs
across exactly that round trip, where a browser that changes product is easy to
read as a different browser than the one that just authenticated. The identity
rule now follows the site family instead: `isGoogleSite` covers `google.com` and
its country domains, `youtube.com` and Google's CDNs, and `hardening.ts`,
`identity.ts` and the identity preload all ask that one question. The shield also
stands aside for the account hosts, because a blocked subresource there fails a
sign-in without a message.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` (sign-in and user-agent files) | exit 0, 11/11; `tests/sign-in-hosts.test.ts` now covers the family rule and its lookalikes |
| `npm run build` | exit 0 |
| `npm run verify:identity` | **PASS**; a loopback guest still reports `Google Chrome / Chromium / Not(A:Brand`, Chrome `Sec-CH-UA` on the wire, native-looking farbling wrappers, seed 0 for `accounts.google.com`, and the new assertions that `accounts.google.com`, `mail.google.com`, `www.youtube.com` and `google.com` share one identity while `example.com`, `notgoogle.com` and `accounts.google.com.evil.test` do not |
| `npm run verify:google` | **PASS**, 7/7 against the live site; details below |

`scripts/verify-google-signin.cjs` is new. It opens the real
`accounts.google.com` in a guest with the production plumbing and reads what
Google can see, rather than asserting what the rules decided:

| Check | Observed |
| --- | --- |
| Landed on the identifier step | `/v3/signin/identifier?service=mail…`, not `/v3/signin/rejected` |
| `navigator.userAgent` on the account host | the application agent (`Kryvex/… Electron/…`), no Chrome claim |
| `navigator.userAgentData` | Chromium's own (`Not?A_Brand / Chromium`), no own property, so the Chrome patch is off |
| One throwaway identifier submitted with real key events | "Couldn't find this account" — Google's account step, not the refusal card |
| Return leg `mail.google.com` → `accounts.google.com` → … | every hop carried the same agent |
| `www.youtube.com` under the same agent | ordinary YouTube page, title `YouTube`, no unsupported-browser notice |

The probe writes `.tmp-google-signin.log` and is release-time only; it talks to
the internet whereas the rest of the suite does not.

**Not run, plainly.** No real Google account signed in, so the password and
post-password checks remain unmeasured; no captcha was solved; only Gmail and
YouTube were probed. Google can change the gate at any time, and the Google
family now reports an Electron agent on its product pages as well as its account
pages — the trade that keeps one identity across the flow.

## Published 0.8.9 install, local packaging and the desktop tools (2026-10-24)

Three checks that the release record had left open, run after the identity fix.

| Check | Result |
| --- | --- |
| Published `Kryvex-Setup-0.8.9-x64.exe` re-downloaded and hashed | `81059d4d…9f9d`, matching `SHA256SUMS.txt` |
| Silently installed over the existing `C:\Kryvex` copy | new `Kryvex.exe` written at 07:32 with `ProductVersion 0.8.9`; the uninstall entry reads "Kryvex 0.8.9" |
| Launched from the installed copy | `Kryvex.exe` window titled **Kryvex**, still running after 12 s |
| Vexium Core starts on launch | `llama-server.exe` as a child of the app, `--model …\models\qwen2.5-1.5b-instruct.gguf --port 14988`; `/health` answers `200` and `/v1/models` lists that file |

Local packaging had been failing with `EPERM` on `release/win-unpacked`, and the
first attempt here failed earlier still: `electron-builder` picked the pnpm
collector from the lockfile, and `pnpm list` was not on `PATH`, so the collector
reported "No JSON content found in output". `pnpm@10.34.8` is now installed into
the user npm prefix. After that, `npx electron-builder --publish never` built
`Kryvex-Setup-0.8.9-x64.exe` (134,257,576 B) and
`Kryvex-Portable-0.8.9-x64.exe` (134,020,431 B), and deleting
`release/win-unpacked` and rebuilding `--dir` succeeded again, so the EPERM
rename no longer occurs.

The Home currency card and the player's playlist import were then driven in the
built desktop app over CDP, in a disposable profile with `startView: home`:

| Check | Observed |
| --- | --- |
| Saved pair restored | `USD → BRL` |
| Live rate | `1 USD = 5.0465 BRL · Oct 23`, `$100.00 = R$504.65`, which matches the rate |
| Edit the amount | `$250.00 = R$1,261.63`, recomputed in place |
| Switch the target | `1 USD = 0.89342 EUR`, a second fetch from the same host |
| Spotify playlist import | 50 rows queued from `37i9dQZF1DXcBWIGoYBM5M`, toast "50 tracks from Today's Top Hits added to the queue", rows such as `01 Housewife AUDIO · SPOTIFY PREVIEW · Tate McRae` |

**Not run:** a YouTube playlist import (the Spotify provider answered first and
the check stops at the first success), playback of the queued rows, and a signed
-out/in state change on the installed copy.

## Which identity Google's sign-in accepts (2026-10-24)

The 10-24 fix removed the mid-flow identity swap but kept the agent that named
Kryvex, and Google answered with its *lite* sign-in flow (`WebLiteSignIn`), the
one it serves to browsers it does not trust to finish a sign-in. So the identity
was measured properly: one Electron process, one partition per variant, one
throwaway identifier submitted with real key events, and Google's answer read
from the URL and the page.

| Variant | User agent | Client hints | `window.chrome` | Answer |
| --- | --- | --- | --- | --- |
| `app` | `Kryvex/0.8.9 … Electron/44.9.3` | none | absent | accepted, `WebLiteSignIn` |
| `chrome` | `Chrome/152.0.0.0` | Google Chrome | absent | refused, `/signin/rejected` |
| `chromium` | `Chrome/152.0.7977.167` | Chromium | absent | refused, `/signin/rejected` |
| `chrome-deep` | `Chrome/152.0.0.0` | Google Chrome | present | accepted, `GlifWebSignIn` |
| `chromium-deep` | `Chrome/152.0.7977.167` | Chromium | present | accepted, `GlifWebSignIn` |

The brand claim was not the differentiator; the two refusals are exactly the two
variants without `chrome.app`, `chrome.csi` and `chrome.loadTimes`. Electron
ships an empty `chrome` object, and Google reads that as an embedded view.

Shipped: the bare Chromium agent (`chromiumUserAgent`), Chromium's own brand list
(`withChromiumClientHints`), the `chrome` surface plus `navigator.webdriver ===
false` in the preload for every guest, and no `userAgentData` patch on Google
because the engine's own brands already match there.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0 for renderer and main |
| `npm test` | exit 0, **591/591** across 58 files; `tests/user-agent.test.ts` now covers `chromiumUserAgent`, and `tests/privacy.test.ts` covers the Chromium hint set |
| `npm run verify:identity` | **PASS**; loopback guest keeps Chrome brands, hints and native-looking wrappers, and now also proves `window.chrome.app/csi/loadTimes/runtime` are callable and `navigator.webdriver` is false |
| `npm run verify:google` | **PASS**, 10/10 live: landed on `/v3/signin/identifier?…flowName=GlifWebSignIn`, agent `Chrome/152.0.7977.167 Safari/537.36` with no `Kryvex`/`Electron` token, `userAgentData` `Not?A_Brand / Chromium`, `chrome.app/csi/loadTimes` callable, `webdriver false`, identifier accepted, and the `mail.google.com → accounts.google.com → workspace.google.com` return leg carried one unchanged agent |

**Not run, plainly.** No real account was signed in, so the password and
post-password checks are still unmeasured, and no captcha was solved. Only Gmail
(the account host and the return leg) and YouTube were probed. The full flow is
Google's regular one, which is a classification change, not a guarantee.

## A Google service signs in inside its own module (2026-10-24)

The identity work fixed the browser check, and a real sign-in then exposed the
next gap: Gmail's account flow opened as its own window, the user finished it
there with phone verification, and the window ended up showing the inbox while
the Gmail module behind it still showed its signed-out page. The module never
learned that a session now existed.

`electron/service-signin.ts` puts the flow back in the frame:

- a Google product page opening Google's account pages navigates the module's own
  frame instead of creating a window — the sign-in is cookie-based and needs no
  opener;
- a service popup that reaches the opener's own site closes and its page loads in
  the module;
- a popup that visited a sign-in host refreshes the module when it closes, so the
  cookies it earned are reflected in the stage.

Verified in the built app, disposable profile, Gmail service seeded into the
state, driven over CDP:

| Check | Observed |
| --- | --- |
| The module opens Google's sign-in in its own frame | guest at `https://accounts.google.com/v3/signin/identifier?continue=https://mail.google.com/…&flowName=GlifWebSignIn` |
| The form renders there | `input[name="identifier"]` present inside `.service-frame.is-active webview` |
| No stray window | no `page` target outside the module carried `mail.google.com` or `accounts.google.com` (only an `accounts.youtube.com` iframe, which is part of the page) |

| Also run | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; adds `tests/service-signin.test.ts` (5 cases: Google-in-frame, third-party OAuth left alone, lookalike hosts, popup return matching) |

**Not run:** a completed sign-in inside the frame (that needs the account's phone
verification, which only the account owner can do), a YouTube module sign-in, and
the popup-fold path end to end — its rules are unit-tested, but no live provider
was driven through it.

## 0.9.0 release: tag, publish and the published install (2026-10-24)

The record, the matrix harness and the wizard capture were committed as
`93e3c10`, tagged `v0.9.0`, and published by the workflow.

| Check | Result |
| --- | --- |
| `node scripts/check-release-record.cjs 0.9.0` | PASS, 11/11 lines |
| Wizard capture | 4 pages, installer exit 0, install page ran 24,501 ms, archived under `docs/media/releases/0.9.0-wizard/` |
| `npm test` | 596/596 across 59 files |
| Workflow run [40094955810](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40094955810) | success |
| Release state | `v0.9.0` published, `isDraft: false`, `isPrerelease: false` |
| Published assets | downloaded, `sha256sum -c SHA256SUMS.txt` OK for both, each `ProductVersion 0.9.0` |
| Installed over the 0.8.9 copy | `C:\Kryvex\Kryvex.exe` 0.9.0, launched, Vexium Core started |
| Gmail module in the installed build | `mail.google.com/mail/u/0/#inbox`, `Inbox - <account> - Gmail`, compose present, no refusal |

| Asset | Bytes | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.0-x64.exe` | 134,259,751 | `28f3da2a3e51b65113c557b639998d0ce470ebb32451d5603ae87211b9e7d8bb` |
| `Kryvex-Portable-0.9.0-x64.exe` | 134,022,614 | `db90684966530c020b449499fa443b691b94f5359b415389d2fbb91c85f76d26` |

Re-checked live on the installed 0.9.0 over CDP (`127.0.0.1:9360`, the app left
running from the install): the Gmail module's guest sits at
`https://mail.google.com/mail/u/0/#inbox`, `document.title` reads
`Inbox - <account> - Gmail`, 50 inbox rows (`tr.zA`) are rendered, a **Compose**
control is present, and no `Sign in` control is in the page. The signed-in
session therefore loads and stays inside the module frame, which is the step
0.8.9 broke by handing the finish to a standalone window.

**Not run:** a fresh credential entry inside the frame after the release (the
persistent partition was already signed in, so this pass exercised the session
restore rather than the password and mobile-verification steps) and the Gmail
module on a second machine. The `gh-pages` bundle was rebuilt and published
separately; see the section below.

## 0.9.0 web bundle published: 2026-10-24

The published PWA was still serving its 0.8.9 bundle, so the same renderer was
rebuilt from `main` and pushed to `gh-pages`. The only source change needed was
the worker's cache name, which still read `kryvex-web-0.8.9-v1` and would have
kept the old shell in place for a browser that already had it.

| Check | Result |
| --- | --- |
| `pnpm build:web` | exit 0: `assets/index-HSssHscJ.js` (1,092.95 kB) and `assets/index-C71yy4YJ.css` (180.61 kB); `check-web-build` PASS (1.3 MiB, 4/4 manifest icons) |
| service worker | `public/sw.js` names `kryvex-web-0.9.0-v1`; the build copied it unchanged |
| Local serve (`python -m http.server 4173 -d dist-web`) | `#/settings` reported `v0.9.0`, the worker was active at `/sw.js`, and `caches.keys()` held only `kryvex-web-0.9.0-v1` |
| `gh-pages` publish | commit `56398b1`; the branch holds exactly the `dist-web` tree plus `.nojekyll`, with `assets/index-GS008kh0.js` replaced by `index-HSssHscJ.js` |
| Live HTML | `https://xiondigital.net/Kryvex/` served `index-HSssHscJ.js` and `index-C71yy4YJ.css` on the first poll after the push |
| Live app | `#/settings` reported `v0.9.0` beside the `WEB` badge; the worker was active on `https://xiondigital.net/Kryvex/sw.js`, its cache held `./`, `index.html`, both hashed assets, the manifest and the icons, and a reload logged no console error and no failed same-origin request |

The only failed request on the live page is `https://example.com/favicon.ico`
(`ERR_BLOCKED_BY_ORB`), which comes from the default service list and predates
this publish.

## Service lifecycle and emulator saves: 2026-10-24

The lifecycle model, the emulator save store and the keyboard path were verified
against the browser build served from `dist-web` on `127.0.0.1:4183`. The desktop
shell was not rebuilt for this pass: no main-process code changed.

| Check | Result |
| --- | --- |
| `pnpm typecheck` (both projects) | exit 0, no diagnostics |
| `pnpm test` | 60 files, 625 tests pass, including the new `service-lifecycle`, emulator-saves, calculator-keyboard and Yandex cases |
| `pnpm build:web` + `check-web-build` | PASS, 1.4 MiB, manifest icons 4/4, hashed bundle `assets/index-BwG4LSYg.js` |
| `pnpm audit:i18n` | no hardcoded UI strings in 39 renderer files |
| Emulator pane after leaving `#/emulator` | Still in the DOM, `lifecycle-pane is-parked`, computed `position: fixed`, `opacity: 0`, and the same iframe element (`dataset.mark` survived) |
| Default policy "Stop when leaving" | Pane unmounted on leave; returning remounted it |
| Per-service override | `auto-pause` on the emulator overrode a `stop` default and kept it parked |
| Settings → Service lifecycle | Five policies in the default select, four service rows with a live "Now: …" line, the idle row appears when any service uses `auto-pause`, and the override was written to `kryvex.state.v1` |
| Frame protocol before a cartridge | `kryvex-save-state` answered `kryvex-save-failed` ("The game is still starting.") and raised the toast; `kryvex-pause`/`kryvex-mute` were no-ops; an unknown type was ignored |
| Console | No errors after removing the redundant `allowFullScreen` attribute |
| Calculator keyboard | Focused card, `1 2 * 3 - 4`, Enter → `32`; Escape cleared to `0`; a note or filter field keeps its own keys because the handler is on the card |
| Yandex | Present as `yandex` in the Settings engine select; `searchUrl` encodes the query |
| `docs/LIFECYCLE.md` | Documents states, policies, the capability table and the save model |

**Not run:** a save/load round trip with a real ROM and core (it needs a
cartridge the tester owns; the sandboxed frame only produces states once the core
has started), the optional save folder against a real directory handle, a Disk
pulse scan left running across a view change, a room held open across a view
change, and the installer build.

## Release batch: player, rooms, currency, typography, Lexium

Automated, all passing at the time of writing:

- `pnpm typecheck` — renderer and Electron projects.
- `pnpm test` — **660 tests in 64 files**.
- `pnpm build:web` + `check-web-build.cjs` — **PASS (1.4 MiB)**, worker cache name
  and precached shell checked.
- `scripts/audit-i18n.cjs` — no hardcoded UI strings in 40 renderer files.

Feature-level evidence:

| Area | Check |
| --- | --- |
| Currency | Live `GET api.frankfurter.dev/v1/latest?base=USD&symbols=TRY` returned `49.738`, `date: 2026-10-23`; an unknown code returns **404**, which the card maps to "the source does not quote {code}". `tests/currency.test.ts` covers the expanded list, search, staleness and both conversion directions. |
| Spotify import | The embed payload was captured from `open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M` and reduced to two rows in `tests/fixtures/spotify-embed.html`; the parser keeps a row whose `audioPreview` is missing instead of dropping it, and carries the playlist cover into rows without art. |
| YouTube | `tests/player.test.ts` maps embed error codes (101/150 → embedding disabled, 100 → removed, 153 → referer) and the artwork fallback. The stage is now a real 16:9 box behind a sized overlay, so a wide stage can no longer collapse to a 200 px strip. |
| Lexium | `tests/lexium-proxy.test.ts` starts a real HTTP server and pushes a WAV through the new main-process proxy: multipart fields, endpoint per engine, dead port → `offline`, and the health probe. |
| Visualizer | `tests/visualizer.test.ts` covers modes, FFT bucketing, smoothing, loudness and which URLs may be analysed. |
| Typography | `tests/typography.test.ts` covers scale clamping, whole-pixel token sizing, the curated families, and the pinned reorder action. |
| Translation | `tests/i18n-coverage.test.ts` measures every `t()` literal against `es`/`de`/`fr` and fails if the untranslated set grows. Backlog recorded in `docs/I18N.md`. |

Not exercised here, and therefore not claimed as working:

- YouTube playback of a real video inside the packaged desktop build (the embed
  needs the loopback bridge, which only runs under Electron).
- The Spotify import against a live playlist *through the app*; the parser is
  tested against a captured payload, the network path is not.
- A two-machine rooms session: stream late-join, the fullscreen overlay, and
  remote control were not driven with a second client.
- Lexium against a running Whisper server: the transport is tested, the server
  itself is not installed on this machine.
- The visualizer with a real audio file in a browser (the canvas needs a playing
  element and an audio graph).

## 0.9.x close-out: link play, floating modules, translation sweep

Run on 2026-10-25 in `X:\Veyra`, Node 24.19.0, Windows 11, on the working tree
that became this commit.

| Check | Command | Result |
| --- | --- | --- |
| Renderer typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Main-process typecheck | `npx tsc --noEmit -p tsconfig.electron.json` | exit 0 |
| Full suite | `npx vitest run` | **679/679** across 66 files |
| Netplay rules | `npx vitest run tests/netplay.test.ts` | 12/12 — pad packing in W3C order, analogue trigger threshold, neutral/disconnected pads, axis clamping, payload sanitising, chunked cartridge round trip, a holey transfer refused, the 16 MB ceiling, and the frame document's pad/snapshot/restore hooks |
| Floating geometry | `npx vitest run tests/floating.test.ts` | 7/7 — default rect fits the viewport, minimum size, title bar stays reachable in every direction, drag/resize clamping, cascade, inline style |
| Translation coverage | `npx vitest run tests/i18n-coverage.test.ts` | 5/5 — backlog ratcheted to es 41 / de 68 / fr 56, every new string translated |
| Production build | `npx vite build` | exit 0, `dist/assets/index-edne1GkB.js` 1,303 kB |

### Floating modules, driven in a browser

`npx vite --port 4197` served the renderer; the desktop browser panel opened
`#/services`, GitHub was opened, and **Float this module** was pressed:

- the route fell back to `#/services` and the stage reported
  `service-stage is-idle has-float`, so the rest of the workspace stayed usable;
- the frame was `position: fixed` at 364,368 with 514×793, `opacity: 1`,
  `pointer-events: auto`, `z-index: 41`, with the drag grip and resize handle
  present;
- a pointer drag from the grip moved the window to 284,328 (80 px left, 40 px
  up), read back from `getBoundingClientRect`;
- **Dock this module** removed `.is-floating`, navigated to
  `#/service/s-starter-3`, and the stage returned to `has-active`;
- the console held no error, only Vite's connect line.

The emulator page in the same run rendered the **LINK PLAY** panel with the
no-room state and an **Open Rooms** action. A real two-machine session was not
driven: it needs two clients, a reachable room relay and a cartridge, and none
of those exist in this environment. The pad packing, chunk assembly, pad
injection and state snapshot/restore paths are what the tests above cover; the
transport itself is the same action set Rooms already uses.

### Web bundle republished with the directive batch (2026-10-25)

- `pnpm build:web` — PASS, 1.5 MiB, `assets/index-CdNKanky.js`,
  `assets/index-CZRARpKT.css`; `public/sw.js` now names the cache
  `kryvex-web-0.9.0-v2` so a browser holding the previous shell replaces it.
- Served locally at `http://127.0.0.1:4173/`: the worker reached `activated`,
  and the cache held the shell, the manifest, both icons, the new JS and the new
  CSS.
- Published from a clean `dist-web/` checkout of `gh-pages` as commit
  `e5343b6` ("Publish Kryvex Web for the 0.9.x directive batch"); the branch
  still contains only built files and `.nojekyll`.
- Live at `https://xiondigital.net/Kryvex/`: the HTML names
  `assets/index-CdNKanky.js` and `assets/index-CZRARpKT.css`, `sw.js` reports
  `kryvex-web-0.9.0-v2`, the worker is active with the same seven entries, and
  the footer reads **v0.9.0**. `#/emulator` renders the **LINK PLAY** panel, and
  **Float this module** on the GitHub module produced
  `service-stage is-idle has-float` with the frame `position: fixed` at
  364,387 × 515,830, `z-index: 41`. No console error and no failed request.

## 0.9.1 release: tag, publish and the published installers (2026-10-25)

`C:\Kryvex` was on 0.9.0 from the previous release; this is the first cut after
the directive batch.

| Step | Command | Result |
| --- | --- | --- |
| Local package | `pnpm package:win` | exit 0, `Kryvex-Setup-0.9.1-x64.exe` and `Kryvex-Portable-0.9.1-x64.exe`; no EPERM |
| Wizard capture | `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer release/Kryvex-Setup-0.9.1-x64.exe --version 0.9.1` | PASS — 4 pages, installer exit 0, install page ran 22,310 ms, archived under `docs/media/releases/0.9.1-wizard/` |
| Record | `node scripts/check-release-record.cjs` | PASS, 11/11 |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Suite | `npx vitest run` | 679/679 across 66 files |
| Tag | `git tag -a v0.9.1 && git push origin v0.9.1` | workflow run 40201665939, **success** |
| Published assets | `gh release download v0.9.1` then `sha256sum -c SHA256SUMS.txt` | both OK; both report `ProductVersion 0.9.1` |

The release is published and stable (not draft, not prerelease) with
`Kryvex-Setup-0.9.1-x64.exe` (134,304,845 B),
`Kryvex-Portable-0.9.1-x64.exe` (134,067,617 B) and `SHA256SUMS.txt`. The
installer run left `C:\Kryvex\Kryvex.exe` reporting `0.9.1.0`.

Not performed in this cut: launching the installed 0.9.1 and reporting its
version and Vexium Core start, and driving Gmail sign-in inside it. Those are
separate verification steps, and the release workflow does not cover them.

### Web client republished at 0.9.1 (2026-10-25)

- `public/sw.js` cache rotated to `kryvex-web-0.9.1-v1`; `pnpm build:web` PASS,
  1.5 MiB, `assets/index-252XQbt_.js` and `assets/index-CZRARpKT.css`.
- Local serve at `http://127.0.0.1:4175/`: worker `activated`, cache holding the
  shell, manifest, both icons, the new JS and CSS, footer **v0.9.1**.
  (Two stale `http.server` processes were still bound to 4173 from earlier runs
  and answered 404; both were stopped and the check moved to a fresh port.)
- Published to `gh-pages` as commit `e64d9c9` ("Publish Kryvex Web for 0.9.1").
- Live at `https://xiondigital.net/Kryvex/`: HTML names the new bundle and CSS,
  `sw.js` reports `kryvex-web-0.9.1-v1`, the worker is active with the same
  seven cache entries, the footer reads **v0.9.1**, **Float this module** still
  produces `service-stage is-idle has-float`, and the console is clean.

## 0.9.2 release: Vexium Core from a first run (2026-10-25)

`C:\Kryvex` was on 0.9.1 from the previous cut. This release carries the 3B core,
the first-run install and the pinned upward drag.

| Step | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | exit 0, renderer and `electron/` |
| Suite | `npx vitest run` | 701/701 across 67 files |
| Local package | `pnpm package:win` | exit 0, `Kryvex-Setup-0.9.2-x64.exe` (134,313,725 B) and `Kryvex-Portable-0.9.2-x64.exe` (134,076,589 B); no EPERM on `release/win-unpacked` |
| Wizard capture | `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer release/Kryvex-Setup-0.9.2-x64.exe --version 0.9.2` | PASS — 4 pages, installer exit 0, install page ran 22,000 ms, archived under `docs/media/releases/0.9.2-wizard/` |
| Record | `pnpm release:check` | PASS, 11/11 |
| Installed copy | `(Get-Item 'C:\Kryvex\Kryvex.exe').VersionInfo.ProductVersion` | `0.9.2.0` |
| Web build | `pnpm build:web` | PASS, 1.6 MiB, `assets/index-BsVxj6u-.js`, `assets/index-D6pb3bHp.css`, cache `kryvex-web-0.9.2-v1` |
| Web published | `git -C ../Veyra-pages push origin HEAD:gh-pages` | commit `825f945`; Pages build for that commit `built` |

The wizard ran against the existing per-user install in `C:\Kryvex` and upgraded
it in place: page 1 offered "There is already a per-user installation.(C:\Kryvex)
Will reinstall/upgrade." and page 2 reported **Space required: 465.8 MB**,
**Space available: 54.9 GB**. `release/win-unpacked/Kryvex.exe` reports
`0.9.2.0`. The harness closed four Kryvex processes the installer relaunched.

**Vexium Core install from a first run**, driven in the packaged Electron build
with a fresh `userData` over CDP, not a mocked bridge:

| Step | Observed |
| --- | --- |
| Empty thread, no core | heading `Vexium Core is not installed.`, call to action `Install Vexium Core 3B · 1.96 GiB`, core card `Not installed`; no Hugging Face **Get a model** link and no "start Ollama or LM Studio" notice |
| Press the call to action | 1.96 GiB fetched from `XiONDiGiTaL/Vexium-Core` release `v2`, SHA-256 verified, configured and started — 27 s to `RUNNING` |
| Core card afterwards | `Vexium Core 3B · 1.96 GiB`, `vexium-core-3b · 4096 context · http://127.0.0.1:11534` |
| Tool answer | "What is 18% of 240?" → **"18% of 240 is 43.2."** in 2.4 s |

Not performed in this cut: pressing **Switch to Vexium Core 3B** on a machine
that already has Vexium Core Light, which uses the same download and verification
path but was not exercised.

### Web client republished at 0.9.2 (2026-10-25)

- Published to `gh-pages` as commit `825f945` ("Publish Kryvex Web for 0.9.2");
  the branch still carries only built files and `.nojekyll`.
- The GitHub Pages build for that commit reports `status: built`.
- Live at `https://xiondigital.net/Kryvex/`: the HTML names
  `assets/index-BsVxj6u-.js`, the footer reads **v0.9.2**, and
  `https://xiondigital.net/Kryvex/sw.js?cb=…` reports
  `kryvex-web-0.9.2-v1`. The bare `sw.js` URL was still answered from the
  Cloudflare edge cache (`cf-cache-status: HIT`, `max-age=14400`, age 227 s)
  with the 0.9.1 worker, so a browser that visited earlier keeps its 0.9.1 cache
  name for up to four hours; navigation is network-first, so the page it renders
  is already the new build. No cache-purge capability is available here.
| Tag | `git tag -a v0.9.2 && git push origin v0.9.2` | workflow run 40214015353, **success** |
| Published assets | `gh release download v0.9.2` then `sha256sum -c SHA256SUMS.txt` | both OK; both report `ProductVersion 0.9.2` |

The release is published and stable (run
[40214015353](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40214015353),
commit `fa401f4`) with `Kryvex-Setup-0.9.2-x64.exe` (134,313,756 B, SHA-256
`fc5f372d…82deb9`), `Kryvex-Portable-0.9.2-x64.exe` (134,076,531 B, SHA-256
`5eabc0a5…45568d`) and `SHA256SUMS.txt` (189 B). The local pair differs only by
the build environment. Nothing was downloaded into the repository: the check
used `.tmp-release-verify/`.
## Vexium Core upgrade paths in the installed 0.9.2 (2026-10-25)

Run after the 0.9.2 release was published, against two things in turn: the
published install in `C:\Kryvex` (`ProductVersion 0.9.2.0`), then a packaged tree
built from the fixed sources in `release/win-unpacked`. Each run used its own
isolated profile — `KRYVEX_USER_DATA` plus isolated `APPDATA`/`LOCALAPPDATA` —
seeded with a **hard link** to the pinned Light file
(`qwen2.5-1.5b-instruct.gguf`, 1,117,320,736 B) and a `kryvex-local-model.json`
pointing at it, so the app started on Vexium Core Light exactly as a 0.9.1
profile does. The user's own profile and its service sessions were neither opened
nor modified.

Phase 1, Light running and the 3B absent:

| Step | Observed on the published 0.9.2 |
| --- | --- |
| Core card | `RUNNING`, installed `qwen2.5-1.5b-instruct` |
| Active build | `qwen2.5-1.5b-instruct · 4096 context · loopback URL` |
| Button | **Install Vexium Core 3B · 1.96 GiB** |
| Press | label `Downloading 0%` → peak 99%, progress bar rendered, checksum stage at 19.1 s, **3B running at 27.0 s** |
| File on disk | `modelsexium-core-3b.gguf`, 2,104,932,768 B, SHA-256 `626b4a66…15c62d`, matches the pinned catalogue entry |
| Runtime | `/v1/models` reports the 3B path; card shows `Vexium Core 3B · 1.96 GiB` |
| Answer | "What is 18% of 240?" → **"18% of 240 is 43.2."** |

Phase 2, the 3B on disk and Light configured again — the only state that shows
the switch label:

| Step | Published 0.9.2 | Fixed tree |
| --- | --- | --- |
| Button | **Switch to Vexium Core 3B** | **Switch to Vexium Core 3B** |
| Press | 3.2 s, no download, card ends on `vexium-core-3b` | 3.2 s, no download, card ends on `vexium-core-3b` |
| Busy label | `Downloading 0%` — **wrong**, nothing was downloading | **Vexium Core is starting…** |
| Answer | "18% of 240 is 43.2." | "18% of 240 is 43.2." |

The label defect is fixed in `coreBusyState()` (`src/lib/vexium-core.ts`), which
`Assistant.tsx` now uses for the busy label, with three cases in
`tests/assistant.test.ts`. Suite after the fix: **704/704** across 67 files,
`pnpm typecheck` exit 0, and the two-phase run reports
`SWITCH VERIFICATION: PASS` on the rebuilt tree.

Not covered by these runs: a profile that also holds signed-in services, because
the seed profile is local-only. The models directory and the runtime do not
depend on service sessions, and the fix is not in the published 0.9.2 binary,
which still shows the old label until the next cut.

## Workspace windows proof of concept (2026-10-26)

Run in `X:\Veyra`, Windows 11, on the tree that adds the Workspace surface.

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` | exit 0 |
| Window rules | `npx vitest run tests/workspace.test.ts` | 15/15 — containment, edge resize, the z band under 8 windows and 160 raises, dropped placement, maximize/restore, minimize, close and renumbering, refit on shrink, detached reachability |
| Full suite | `npx vitest run` | **787/787** across 75 files |
| Production build | `pnpm build` | exit 0, `dist/assets/index-Br9v0XwV.js` 1,377 kB |

### Driven in the renderer (web build, `npx vite --port 5183`)

The rail reads Home, Services, Browser, **Workspace**, Vexium, Rooms, Settings.
`#/workspace` measured its canvas at 683×861 and showed the empty state. Two
services were added from the bar's button (the dialog is the same one the
Services page uses); they opened as windows at 423×585, cascaded 26 px apart, at
`z-index` 30 and 31, fully inside the canvas.

- **Raise:** a pointer down on the lower window swapped the two z values and
  `document.elementFromPoint(300, 300)` then returned the raised frame.
- **Drag:** a pointer drag on the title bar moved the window exactly
  +40 / +30 px (160,255 → 200,285) with no change in size.
- **Resize:** a drag on the east handle grew the width from 423 to 483 and
  stopped at the canvas edge.
- **Maximize / restore:** filled 683×861 exactly, and restore returned
  200,285 × 483×728.
- **Minimize:** the frame stayed mounted with `opacity: 0`, `pointer-events:
  none` and `inert`, and a tray chip appeared; the chip restored it.
- **Dialog above live windows:** with both frames mounted, Add service put
  `.modal-layer` at `z-index` 50 over the board's 25 and the windows' 30/31, and
  a hit test 20 px inside the dialog returned the dialog, not a service.
- **Surface resize:** shrinking the viewport re-fitted both windows inside a
  556×496 canvas.
- **Route away and back:** on `#/home` the frames stayed mounted but hidden
  (`opacity: 0`, stage `is-idle`), and returning to `#/workspace` restored the
  exact geometry and stacking.

The Home eyebrow now reads **Home** instead of `WORKSPACE 01 / ELEMENT x529`,
and the three stale catalogue entries were removed with it.

Not covered here: live guest content. The renderer without Electron has no
`<webview>`, so each frame drew the existing "open in this browser" card. The
window mechanics above are the same either way — the guest is an OOPIF inside the
same frame — but a two-service drag over real Google and GitHub sessions has to
be confirmed in the desktop build.

## Kryvex Link: the phone companion (0.9.4, 2026-10-26)

Run on 2026-10-26 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3, on
the working tree that became this commit.

| Check | Command | Result |
| --- | --- | --- |
| Renderer typecheck | `pnpm typecheck` (`tsc --noEmit` ×2) | exit 0 |
| Full suite | `npx vitest run` | **818/818** across 76 files |
| Link rules | `npx vitest run tests/link-rules.test.ts` | 22/22 — code and token shape, ten private address families accepted and nine public forms refused, traversal/reserved/percent-encoded names rewritten, collisions numbered, scheme and credential rules for links, the command allowlist, size labels |
| State sanitiser | `npx vitest run tests/store.test.ts` | 40/40 — the link starts off and only an explicit `true` turns it on; `link` is a pinnable tool |
| Translation coverage | `npx vitest run tests/i18n-coverage.test.ts` | 5/5 — the ratchet held at es 41 / de 68 / fr 56 with 49 new strings translated |
| Renderer copy audit | `npx vitest run tests/i18n.test.ts` | PASS — no hardcoded UI strings; the companion's own table is why its page uses a local helper |
| Production build | `npx vite build` | exit 0, and the build now emits `dist/companion.html` + `companion-*.js` 21.26 kB (7.03 kB gzip) beside the shell |
| End-to-end harness | `pnpm verify:link` (`scripts/verify-link.cjs`) | **30/30 PASS** |

### What the harness asserts

It launches the built app on a disposable profile whose saved switch is on and
never opens the Link page, so the boot path is what starts the listener:

- the listener is up on the first free port in 43110–43129 and a six-digit code
  is ready;
- `/` serves the companion page, the page references its bundle, the bundle is
  served as JavaScript (21,154 bytes), and `GET /../package.json` sent as a raw
  path returns 401 with no file;
- an unpaired visitor is told `paired: false`; a wrong code mints nothing; state
  without a token is 401; seven wrong guesses produce 429 twice;
- the live code pairs a device, the desktop's device list carries a 16-character
  handle with no `token` field, and pairing retires the code;
- the event stream opens with `text/event-stream`, a clipboard post is accepted,
  and the desktop relays it back as an `event: clipboard` frame containing the
  text;
- an upload named `../escape me.txt` is stored as `escape me.txt` inside
  `Downloads\Kryvex Link` with the exact payload, is listed by the desktop, and a
  second harness run with a name already on disk gets `escape me (2).txt` rather
  than a failure;
- `focus` runs and `shutdown` is refused with 400;
- a link from the phone lands the shell on `#/browser` and the persisted state
  holds a tab for `https://example.com/from-the-phone`;
- the outbox is empty until a file is offered; a seeded offer is listed without a
  path on this machine and downloads with matching bytes and a
  `content-disposition` carrying the name; an unknown id is 404;
- unpairing is 200 and the retired token is 401 on the next request.

### The phone page, driven in a real browser

The built app ran on a disposable profile and the preview browser opened
`http://127.0.0.1:43110/`. The pairing form rendered (`Pair with Kryvex`, the
six-digit field, the phone-name field), the code was typed, and **Pair** landed
on the app with the tab bar **Clipboard / Files / Send / Remote / This phone** and
a `LIVE` badge:

- **Phone → desktop clipboard:** typing a sentence and pressing *Send to desktop*
  put it on the Windows clipboard — confirmed independently with
  `powershell Get-Clipboard` — and the page's own Clipboard panel showed it back
  through the event stream.
- **Desktop → phone clipboard:** `Set-Clipboard` on the desktop appeared in the
  page within the poll interval.
- **Phone → desktop file:** a synthetic `File` dispatched at the page's own file
  input uploaded through the page's XHR path; the page listed it under *Sent to
  the desktop* (26 B) and the bytes were on disk in
  `Downloads\Kryvex Link\from-the-page.txt`.
- **Remote:** pressing *Open Rooms* on the page moved the desktop shell to
  `#/rooms`; the transport showed *Nothing here yet.*, which is correct with no
  media playing.
- No console error and no failed request appeared in the page or the shell.

### Not executed (do not treat as passing)

- **A real phone.** The page was driven from Chromium on this machine; no
  Android or iOS device was on the network during the run, so the touch layout,
  *Add to home screen* and the phone's own browser quirks are unverified.
- **OS notifications.** They need a secure origin, and this link is plain HTTP on
  the LAN; the in-page notice path was exercised, the `Notification` path was not.
- **The offer picker.** *Offer a file* opens the native dialog, which cannot be
  driven here; the download half it feeds was tested with a seeded offer.
- **A public source address.** The 403 for a non-private peer is covered by unit
  tests on the address rule; no request from off-network was produced.

## World clock and screen capture: the installed 0.9.4-hotfix.1 (2026-10-26)

Run on 2026-10-26 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3, on
the working tree that became this commit, and then against the build installed by
`Kryvex-Setup-0.9.4-hotfix.1-x64.exe`.

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` (`tsc --noEmit` ×2) | exit 0 |
| Full suite | `npx vitest run` | **828/828** across 77 files |
| World clock rules | `npx vitest run tests/world-clock.test.ts` | rows are places, a bare zone string from an older board still loads, an unknown zone is dropped, a second city in the same zone relabels that row, a fifth is refused, removal by id, 12/24-hour formatting and day offsets |
| Capture rules | `npx vitest run tests/capture-rules.test.ts tests/screen-capture.test.ts` | extension forced to match the kind, a proposed `setup.exe` becomes a `.png` stem, traversal and control characters stripped, non-base64 and oversized payloads refused, dimension labels |
| Store migration | `npx vitest run tests/store.test.ts` | an old `captures` inbox folds into sticky notes, `screenCaptures` and `clockHour12` are sanitised, the widget flags come from the registry |
| Translation coverage | `npx vitest run tests/i18n-coverage.test.ts` | ratchet held; the new clock and capture strings exist in es/de/fr |
| Renderer copy audit | `node scripts/audit-i18n.cjs` | PASS — no hardcoded UI strings in 49 renderer files |
| Web build | `pnpm build:web` | PASS (1.7 MiB): `assets/main-DEX2m-Ju.js`, `assets/main-BKKSMrRQ.css`, `assets/companion-CTBsK4FZ.js`, worker cache `kryvex-web-0.9.4-hotfix.1-v1` |
| Windows packaging | `pnpm package:win` | exit 0 — Setup (134,362,910 B) and Portable (134,125,765 B), no EPERM on `release/win-unpacked` |
| Version resource | `Get-Item C:\Kryvex\Kryvex.exe` | `ProductVersion 0.9.4.0`, `FileVersion 0.9.4-hotfix.1` |
| Wizard capture | `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer release/Kryvex-Setup-0.9.4-hotfix.1-x64.exe` | PASS — 5 pages, installer exit 0, install page 25,350 ms, archived to `docs/media/releases/0.9.4-hotfix.1-wizard/` |
| Checksums | `pnpm release:checksums` | wrote both digests to `release/SHA256SUMS.txt` |
| Release record | `pnpm release:check` | PASS for 0.9.4-hotfix.1, 11/11 |
| Installed build, driven over CDP | `pnpm verify:home-tools` (`scripts/verify-home-tools.cjs`) | **12/12 PASS** |
| Tag workflow | `gh run view 40338277766` | `windows` 3m9s and `web` 48s, both **success** |
| Published release | `gh release view v0.9.4-hotfix.1` | stable, `prerelease=false`, marked **Latest**; Setup 134,363,017 B, Portable 134,125,865 B, `SHA256SUMS.txt` 207 B |
| Live web client | `curl https://xiondigital.net/Kryvex/` | serves `assets/main-DEX2m-Ju.js` and `assets/main-BKKSMrRQ.css`, the bundle reports **0.9.4-hotfix.1**, `sw.js` names `kryvex-web-0.9.4-hotfix.1-v1` |

### What the installed-build harness asserts

It launched `C:\Kryvex\Kryvex.exe` on a disposable profile with
`--remote-debugging-port`, then used the board the way a user would:

- the page opens, and both the footer and `appInfo()` report **0.9.4-hotfix.1**;
- the **Widgets** picker switches **World clock** and **Screen capture** on, and
  both cards draw on the board;
- the clock's 12-hour switch flips (`24H` → `12H`, stored as `clockHour12`);
- typing *Izmir* and submitting reached the geocoder, the card offered the
  result, and **Add city** produced a row labelled **Izmir** — not the zone's
  name — which the row's × then removed (1 → 0);
- the capture card drew its target list populated from the system sources
  (**Kryvex**, Brave windows, the screen);
- no page exception was raised during any of it.

The save path was exercised earlier in this same working tree, before the release
commit: the card captured the Kryvex service to a 1440×846 PNG and **Save as…**
opened the native dialog over the app and wrote a 156 KB file into
`Downloads\Kryvex Captures`, which the recent list then showed. That run's
cleanup deleted the folder it created.

### Not executed (do not treat as passing)

- **The save dialog against this installed binary.** The dialog is native and
  cannot be driven by the CDP harness; the file write and the folder default were
  proven on the same sources in the run above, not on this package.
- **A recorded clip through the OS dialog.** The WebM path is covered by unit
  tests and by a three-second recording that produced a playable preview, but its
  save was not taken through the dialog.
- **The browser/PWA fallback.** The web shell has no main process, so the card
  asks the browser to share a surface and downloads the result; that path was
  not driven in a browser.
- **A city lookup with no network.** The offline message and the rows already on
  the clock are unit-tested; no live offline run was made.
- **A capture of a minimised window.** The source list offers windows the system
  reports; what a minimised window yields was not measured.

## Capture preview window (2026-10-26)

Run on 2026-10-26 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3, on
the working tree built with `pnpm build` (no installer needed for this one).

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` (`tsc --noEmit` ×2) | exit 0 |
| Full suite | `npx vitest run` | **838/838** across 78 files |
| Window rules | `npx vitest run tests/capture-window-rules.test.ts` | 10/10 — kind, language fallback, pixel clamp, a one-line target, and bounds for a 4K screenshot, a tiny capture, a recording and a small desktop |
| Renderer copy audit | `node scripts/audit-i18n.cjs` | PASS — no hardcoded UI strings in 50 renderer files |
| Build | `pnpm build` | emits `dist/capture.html` and `assets/capture-*.js` (6.14 kB) beside the shell and companion pages |
| End-to-end | `pnpm verify:capture-window` | **24/24 PASS**, on two consecutive runs |

### What the harness proves

It launches the built app on a disposable profile with its own CDP port and uses
the board the way a user does:

- the capture card can be switched on and its target list is populated;
- capturing Kryvex's own window opens a **second CDP page target**,
  `dist/capture.html` — a real window of its own, not a card overlay;
- the picture renders there (`naturalWidth > 0`, 1440×900 or 1474×1250 depending
  on the window), and the toolbar carries **New capture · Save as… · Copy ·
  Always on top · Actual size · Close**;
- **Always on top** flips its pressed state, and **Copy** reports the still went
  to the clipboard;
- **Save as…** opens the native Windows dialog: the harness finds that dialog by
  its window class and process, accepts it, and the app then shows
  `Saved to C:\Users\…\Downloads\Kryvex Captures\kryvex-kryvex-<stamp>.png`,
  offers **Show in folder**, and the file on disk is a 302 KB PNG with the right
  signature;
- the board's recent list gets the entry even though the save happened in the
  other window;
- **Close** removes that window; a three-second **Record** reopens it on a video
  (`readyState ≥ 2`, 1440 px wide, brand reading *Recording*);
- **New capture** closes the window and returns the shell to `#/home`;
- no page exception is raised in either window.

### Not executed (do not treat as passing)

- **The installed binary.** This ran against `pnpm build`; the same sources are
  packaged in the installer, but the package itself was not driven here.
- **The web/PWA fallback.** There is no preview window without a main process, so
  the card keeps its browser download path; that path was not re-driven.
- **Display scaling and multiple monitors.** The window is sized from the primary
  display's work area; a capture taken on a second monitor at another DPI was not
  measured.
- **Esc and Ctrl+S.** Both are wired in the window, but Esc would race the dialog
  checks and Ctrl+S would open a second dialog, so neither was pressed by the
  harness.

## Window motion, the header capture button and the phone address list (0.9.4-hotfix.2, 2026-10-26)

Run on 2026-10-26 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3, on
the working tree that became this commit.

| Check | Command | Result |
| --- | --- | --- |
| Renderer typecheck | `npx tsc -b` | exit 0 |
| Full suite | `npx vitest run` | **843/843** across 78 files |
| Window motion settings | `npx vitest run tests/workspace.test.ts` | 20/20 — the three motions survive the sanitiser, anything else falls back to `subtle`, the speed clamps to 0.5–2 in half steps |
| Link address ranking | `npx vitest run tests/link-rules.test.ts` | 24/24 — a virtual adapter ranks below the real one, duplicates collapse under the first name, an unnamed address is kept and labelled `Network` |
| Translation coverage | `npx vitest run tests/i18n-coverage.test.ts` | 5/5 — the ratchet held, and all eleven strings this batch added are translated |
| Production build | `pnpm build` | exit 0 |
| Link harness | `pnpm verify:link` | **32/32 PASS** |
| Motion and capture harness | disposable CDP script, not kept (see below) | 13/13 PASS |

### What the link harness now proves

Two checks were added to `scripts/verify-link.cjs`, and both read the live status
of the running app rather than a unit fixture:

- every advertised address carries its adapter name and a `likely` flag, and
  `urls` and `links` agree element for element. On the machine it ran on the
  answer was `192.168.50.250 Ethernet 1 (likely), 192.168.56.1 Ethernet 3
  (likely), 10.147.19.81 ZeroTier One (…), 10.124.101.81 ZeroTier One (…)`;
- the reachable adapter is listed first.

That output is the diagnosis for the reported "phone hangs, then
`ERR_CONNECTION_ABORTED`": two of the four addresses in the report belong to a
ZeroTier tunnel, and a phone cannot reach a tunnel. The view now labels those
instead of leading with them, and the card explains the same-network and
firewall conditions.

### The motion and capture harness

A throwaway script (`.tmp-check-motion.cjs`, deleted after the run) launched the
built app on a disposable profile whose saved state hid the capture card, then
drove it over the DevTools protocol:

- the header's tool row is `Activity, Capture, Add, Settings, Help` — the capture
  button sits directly beside Activity;
- clicking it lands on `#/home`, reveals the capture card, rings it and focuses
  its target picker; the revealed choice is written back to the state file;
- the Workspace bar opens the motion panel, which lists `Subtle, Bouncy, None`
  and the four speeds; choosing Bouncy persists `{ motion: 'bouncy',
  motionSpeed: 1 }` and marks that button pressed;
- dragging the seeded pinned service onto the canvas opens a window with
  `data-motion="bouncy"`, `--window-motion: 260ms`, a running animation and the
  three controls in the order `Minimize, Maximize, Close`.

The harness found one real defect, now fixed: the open animation's effect was
keyed on the window record's identity, so raising or moving a window during the
animation cancelled the timer and left the frame marked as opening. It is keyed
on a boolean now.

### Not executed (do not treat as passing)

- **A phone on the LAN.** The address list was verified, not a real handset
  reaching it; the firewall rule was not inspected or added.
- **The installed binary.** This ran against `pnpm build`.
- **Reduced motion.** The stylesheet disables animation under
  `prefers-reduced-motion`, but the emulation was not switched on.

## Dragging a pinned service onto the canvas (2026-10-26)

The 0.9.4-hotfix.2 section above reported this drag as working. It did not: that
harness dispatched `dragover` and `drop` inside the page, which skips the
browser's own drag arbitration — and the arbitration was refusing every one of
these drops.

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` | exit 0 |
| Full suite | `npx vitest run` | **856/856** across 80 files; 6 new in `tests/service-drag.test.ts` |
| Production build | `pnpm build` | exit 0 |

### The cause, and how it was proved

Chromium intersects the effect a drop target asks for with the source's
`effectAllowed`, and a target asking for something the source never offered gets
no `drop` event at all. The pinned row declared `move` (it is also reordered in
place) while the canvas demanded `copy`, so the delivered `dragover` ended with
the operation still `move` and the drop was cancelled before the shell could see
it. A Services card declared `copy`, which is why the same canvas accepted that
drag — the gesture only failed from the rail.

A throwaway script (`.tmp-ws-drag.cjs`, deleted after the runs) launched the built
app on a disposable profile and pushed a real drag through Chromium's pipeline
with `Input.dispatchDragEvent`, carrying the rail's exact payload
(`text/plain` + `application/x-kryvex-service`) and the operation mask that
`effectAllowed` produces:

- mask 16 (`move`, the rail as it was): `dragenter` and `dragover` delivered,
  `dropEffect` stuck at `move`, **no `drop` event**, no window;
- mask 1 (`copy`, a Services card): drop delivered, `dropEffect: copy`, a
  680×473 window at the drop point;
- mask 17 (`copyMove`, the rail after the fix): drop delivered, `dropEffect:
  copy`, a 680×473 window;
- mask 16 again, with the canvas now deriving its request: drop delivered as
  `move`, a window. A move-only source can no longer be refused.

### The rail's own drags

The same script re-ran the two drags the rail already had, because the change
touches the shared drop handlers:

- a pinned row dropped on the row above it reordered to `Rail Two, Rail One`
  with the operation staying `move`, so the reorder cursor is unchanged;
- a Services card dropped on the rail pinned `Rail Two` (`Rail One, Rail Two`,
  two rows) with the operation `copy`.

### Not executed (do not treat as passing)

- **A hand-driven drag.** CDP mouse events do not start a native drag in this
  Electron build, so the drop was fed through the browser's drag pipeline rather
  than by a moving pointer. The pipeline is where the effect is arbitrated, which
  is the part that was broken.
- **The installed binary.** This ran against `pnpm build`.

## World clock card and board clock controls (2026-10-26)

The clock's search became a mode, and the board clock gained size, alignment and
two more looks. Verified on the built app with a disposable profile whose saved
state was one city (`İzmir`), `clockStyle: outline`, `clockFont: mono`,
`clockScale: 145` and `clockAlign: center`, read back through CDP:

| Check | Result |
| --- | --- |
| Saved city with the search collapsed | The card showed `İzmir`, one row, the **Add city** button and no search field |
| **Add city** opens the field | Field appeared, placeholder `Please enter a city`, focus landed in it |
| Size reaches the digits | `145%` rendered the outline clock at **84.1 px** (58 px `clamp()` ceiling × 1.45); the **Fit** chip returned it to **58 px** |
| Alignment reaches the layout | **Right** produced `align-right`, computed `align-items: flex-end` and `text-align: right` |
| Closing the search | **Add city** returned and the field went away, leaving a clock rather than a search box |
| Controls offered | Show the clock · Bare · Card · Clock radio · Outline · Classic · Theme · Accent · Muted · 70% · 85% · Fit · 120% · 145% · 180% · Left · Centre · Right |

`pnpm typecheck` exit 0; `npx vitest run tests/i18n-coverage.test.ts
tests/store.test.ts tests/home-widgets.test.ts` 57/57; `pnpm build` exit 0.
The German and French words for `Position` are the same as English, so the
control is keyed `Alignment` (`Ausrichtung`, `Alignement`) to keep the coverage
ratchet honest.

## Catalogue additions and Turkish (2026-10-26)

Ten presets joined the catalogue (mail providers, Wikipedia, Weather.com, the
marketplaces) and Turkish became the fifth UI language. The built app was
opened on a disposable profile whose saved language was `tr`:

| Check | Result |
| --- | --- |
| Locale | `document.documentElement.lang` = `tr` |
| Home board | Greeting read **İyi günler** |
| Services view | Heading **Servisler**; filter chips read **Tümü 5 · İletişim 2 · Üretkenlik 1 · Geliştirme 1 · AI 0 · Kaynaklar 0 · Medya 1 · Diğer 0** |
| Settings → Language | **Türkçe** is in `LANGUAGES`, so the picker offers it |
| Resolver | `normalizeLanguage('tr-TR')` → `tr`; `languageLabel('tr')` → `Türkçe` |

Unit coverage: `tests/services.test.ts` now pins the ten new ids, Mailinator's
public-inbox warning, the muted marketplaces, Wikipedia/Amazon categories and
id uniqueness (17/17). `tests/i18n-coverage.test.ts` gained the Turkish
ratchet (`TURKISH_BACKLOG` 1291, measured — only a fall) and a placeholder
audit that walks **es, de, fr and tr** and fails if a translation drops or
renames an interpolation token; all four pass today.

Full suite **866/866** in 80 files; `pnpm typecheck` exit 0; `pnpm build` exit 0.

Turkish is deliberately partial: the shell, board, clock, workspace, service
controls, browser, player, rooms, emulator/disk and Vexium labels are
translated and the long explanatory paragraphs still fall back to English.

## Placing services on the canvas, and no duplicate sidebar entries (2026-10-26)

Two reports came out of the 0.9.4-hotfix.2 canvas: a service already in the
sidebar would not become a window on it, and adding one that was already
installed left a second entry in the sidebar that existed only on the canvas.

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` | exit 0 |
| Full suite | `npx vitest run` | **877/877** across 80 files; 11 new (placement rule, canvas placement, the stored switch) |
| Production build | `pnpm build` | exit 0 |
| End-to-end | `pnpm verify:canvas` | **24/24 PASS** |

### What the harness drives

`scripts/verify-workspace-placement.cjs` launches the built app on a disposable
profile seeded with two loopback services, then uses the app the way the reports
describe it. The service records are read back from `kryvex-state.json`, so
"no duplicate" means the saved profile rather than the DOM:

| Check | Result |
| --- | --- |
| The canvas starts empty and offers *Add service* | PASS |
| A pinned row publishes a drag payload | PASS (`application/x-kryvex-service` read back) |
| The drop opens that service as a window inside the canvas | PASS (live `<webview>`, box within the canvas, one window) |
| The dialog lists the installed services above the presets | PASS |
| Clicking an installed chip frames it and adds no record | PASS (two windows, still two records) |
| Typing an installed site shows the clash note before the save | PASS |
| Saving frames the existing service instead, with a toast saying why | PASS (still two records, one per site) |
| The instance switch clears the warning and adds a deliberate copy | PASS (three records, two on one host) |
| The two records on one host keep separate ids | PASS |
| No page exceptions | PASS |

### Not executed (do not treat as passing)

- **A hand-driven drag.** The harness builds a real `DataTransfer` and
  dispatches the drag events, which is what reaches the shell's MIME handling;
  the pointer-driven version was covered by the CDP drag-pipeline run recorded in
  the previous section.
- **The installed binary.** This ran against `pnpm build`.
- **Two accounts actually signed in.** The isolation claim rests on one session
  partition per service id, which the record ids prove here; no second sign-in
  was performed against a real site.

## Virtual LAN in a room (`pnpm verify:vlan`)

`scripts/verify-vlan.cjs` drives the built app in a disposable profile, opens a
room and exercises the strip. It compares what the panel shows against
`os.networkInterfaces()` on the machine running it, which is what makes an
invented or stale address fail rather than pass.

| Check | Result |
| --- | --- |
| The lobby shows no Virtual LAN strip | PASS (no room, nothing to publish into) |
| The only bridge member whose name contains `vlan` is `vlanStatus` | PASS (no IPC can start a network, route it or elevate) |
| The strip is labelled and starts idle with the panel closed | PASS |
| Every address listed is a real address on this machine | PASS (`10.147.19.81`, `10.124.101.81`, both real ZeroTier adapters) |
| No listed address is loopback or link-local | PASS |
| Each address names the engine family it belongs to | PASS (`zerotier`) |
| Nothing is listed as shared before anyone shares | PASS |
| Publishing lists this device once, marked as this device | PASS |
| The published address is the one the machine really has | PASS |
| The strip reports the address it published | PASS |
| Withdrawing removes the row | PASS |
| No page exception | PASS |

Last run: **18/18 PASS**. Screenshots: `screenshots/vlan-strip.png`,
`screenshots/vlan-shared.png`.

### Not executed (do not treat as passing)

- **Two machines over a virtual IP.** This machine has a live ZeroTier adapter,
  but nothing was reached across it; no game or service was connected to. That
  belongs to milestone B in `docs/VIRTUAL_LAN_EVAL.md` §8.
- **The no-adapter state**, because this machine has two tunnel adapters up: the
  empty-state wording is covered by `tests/vlan-rules.test.ts` and the panel's
  own copy, not by this run.
- **The browser build's notice**, which `pnpm build:web` builds but this harness
  does not drive.

### Unit rules (`tests/vlan-rules.test.ts`)

Adapter families (`ZeroTier One`, `easytier`, `Tailscale`, `WireGuard Tunnel`,
`TAP-Windows Adapter V9`, `Hamachi`, `tun0`), the virtual-machine and container
exclusions (`vEthernet (Default Switch)`, VirtualBox host-only, VMware, `veth0`,
plain `Ethernet`), the address ranges (private and CGNAT in; `172.32.x`,
loopback, link-local, multicast, `0.x`, malformed out), ordering and de-duping,
the peer-payload sanitiser (a bare string, a loopback address, an empty
withdrawal and an HTML-looking payload all refused), and the engine-token list.

## The PC dictation engine's language guard (`pnpm verify:lexium-language`)

The report behind this harness: a Turkish song was transcribed with **Use this
PC** on a machine whose only recogniser is English, and the transcript came back
as fluent English that was nowhere in the audio — an `en-US` dictation engine
reading a Turkish recording. The engine does not refuse foreign audio, so the
refusal has to happen in Lexium, before anything is sent.

`scripts/verify-lexium-language.cjs` drives the built app in a disposable profile
pinned to the PC engine, loads a real synthesised WAV through the real file
input, and clicks the real button.

| Check | Result |
| --- | --- |
| The engine line names the installed recogniser | PASS (`en-US`) |
| The profile asks for Turkish, which this PC cannot hear | PASS |
| The synthesised recording decoded in the renderer | PASS |
| No transcript is produced for a missing language | PASS |
| The message names the recogniser this PC actually has | PASS |
| The message says it is the PC dictation engine that cannot hear it | PASS |
| The engine was never started for that request | PASS |
| The refusal is immediate | PASS (6 ms) |
| The installed language still transcribes the recording | PASS ("The quick brown fox jumps over the lazy dog") |
| The transcript is labelled with the language recognised | PASS (English) |
| The result says it was dictated on this PC, without claiming to be unsure | PASS |
| No page exception | PASS |

Last run: **12/12 PASS**. Screenshots: `screenshots/lexium-language-guard.png`,
`screenshots/lexium-dictation.png`.

### What is not covered

- **A Turkish recogniser.** This machine has none, which is what makes the
  refusal testable; a machine that *does* install Turkish runs the engine
  normally, and that path is covered by the English run plus
  `pnpm verify:lexium-speech`.
- **Singing on a Whisper server.** Only the language guard and the in-box engine
  are exercised here; no Whisper server was run.
- **A low-confidence transcript end to end.** The floor and the verdict are
  covered by `tests/lexium-dictation.test.ts` and by the confidence the real
  engine reported (`0.844`, verdict `ok`); no audio was found that makes the real
  engine report below the floor, so the uncertain branch is not exercised in the
  app. It is not reported as tested.

### Unit rules (`tests/lexium-dictation.test.ts`)

Recogniser selection (a missing language is refused, an installed one matches in
any regional spelling, only `auto`/empty picks the first, a specific language
never falls back), the installed-language list, the culture parser, the verdict
(empty, below the floor, at the floor, above it, a missing confidence), and a
parity table asserting the main-process module and the renderer copy agree over
every culture/language combination, so the two cannot drift.

## The one-click Whisper engine (`pnpm verify:speech`)

The report behind this harness: a Turkish voice note of a song was transcribed
with **Use this PC** and came back as recognisable English that was not in the
recording. The dictation engine cannot follow singing or an accent; a Whisper
model can, but a first-time user had to find a build, find a model and run a
command first. `Download and start` in Lexium now does that, and this harness
tests the whole path on the real network, the real CPU and the real disk.

| Check | Result |
| --- | --- |
| The reviewed catalogue passes its own validation | PASS (tiny, base, small) |
| The pinned build downloads and is verified | PASS (8,928,640 bytes, `6ba69e34…`) |
| The pinned model downloads and is verified | PASS (147,951,465 bytes, `60ed5bc3…`) |
| The model on disk hashes to the pinned SHA-256 | PASS |
| No partial, archive or staging file is left behind | PASS |
| The server starts on loopback | PASS (`http://127.0.0.1:8129`, pid reported) |
| The server answers its own page | PASS (HTTP 200) |
| A real recording transcribes through the renderer's proxy | PASS ("The quick brown fox jumps over the lazy dog") |
| The response carries timed segments, so `.srt` would export | PASS (1 segment, 0s → 2.72s) |
| Language detection works | PASS (`english`) |
| Turkish is accepted by the pinned build | PASS (`language: turkish`) |
| An empty upload is refused | PASS (`invalid`) |
| A model in use cannot be removed | PASS (`busy`) |
| Stopping the engine kills the listener | PASS |
| A removed model cannot be started again | PASS (`not-installed`) |

Last run: **PASS** on the default `base` model. `--model=tiny` runs the same
path with a 78 MB download, `--root=<dir>` reuses an existing profile and
`--keep` leaves it in place for inspection.

### The app half (`pnpm verify:speech-bridge`)

`scripts/verify-speech-bridge.cjs` drives the built app in a disposable profile
and downloads nothing: the shell window exposes the bridge, the handlers answer
it, the catalogue arrives intact, a model id outside the catalogue is refused
before anything is fetched, Lexium renders the card with the three models and
the **Download and start** button, the failure line reads in the user's
language, and merely opening the panel installs nothing.

It also presses the **Start with Kryvex** switch rather than calling the bridge
directly: the switch starts as `aria-checked="false"`, the panel's own button
turns it on, the state read back from the main process agrees, the choice is on
disk in `speech/kryvex-speech.json`, and pressing it again turns it off without
leaving an engine running. A fresh profile also reports `autostarted: false`, so
Lexium never adopts an address Kryvex did not start. The Settings **Start with
Windows** row is checked in the same run: an unpackaged build reports
`canChange: false`, refuses `startupSet(true)`, and the row is disabled with
**Available in the installed app.** Last run: **PASS**.

### The packaged half (`pnpm verify:packaged-startup`)

`scripts/verify-packaged-startup.cjs` runs `release/win-unpacked/Kryvex.exe` — a
build where `app.isPackaged` is true — and checks the two things the source
harness deliberately cannot:

- **A real startup entry.** `startupSet(true)` writes
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` with
  `net.xiondigital.kryvex="…\Kryvex.exe"`, read back from Windows and compared
  with the launched executable, then removed by the same switch. An entry that
  already exists (a person who installed the app and turned it on) is left alone
  and the check is skipped rather than overwritten.
- **The engine at launch.** A model is installed once into
  `.tmp-packaged-startup/profile` and reused on later runs, so the download is
  not repeated. The switch is turned on, the window is closed, the engine's pid
  is confirmed dead, and the app is reopened: `speechStatus()` must report
  `running` with `autostarted: true` before anyone presses a button, and Lexium
  must show that address. Last run: **PASS** on `tiny` — install, start, quit,
  relaunch by itself, adoption, switch off.

### What is not covered

- **A download pressed in the app.** The card is rendered and its bridge is
  exercised, but the button itself is not clicked in the harness, because that
  would download 148 MB as a side effect of a UI test. The installer path is
  covered directly by `pnpm verify:speech`, which uses the same main-process
  calls the button makes.
- **`small` and `tiny` through the app.** Both are pinned and validated, and
  `tiny` is exercised by `--model=tiny`; `small` shares the same code path and
  was only verified as a download-on-demand entry, not transcribed here.
- **The quiet launch cases.** `resume()` with the switch off, nothing
  installed, or a removed model is covered by `tests/speech-runtime.test.ts`;
  the packaged harness only exercises the case where a model exists.
- **A machine with a real sign-in.** The Run entry is written and removed, but
  no run signed out of Windows and signed back in to watch it start.
- **Other platforms.** The pinned build is Windows x64, measured from the
  release asset. Nothing else was run.

## The shell batch after the built-in tools (`pnpm verify:shell-batch`)

Five small behaviours the shell was asked for, checked against the built app in a
disposable profile over CDP. Each check is written so that the thing it asserts
is the thing a person would notice: a panel that stays open where it should not,
one clock changing the other's format, a caret that blinks on a card nobody
clicked, or a room that is popped out and cannot be dragged.

| Check | Result |
| --- | --- |
| The sliders button opens the options panel | PASS |
| A press inside the panel leaves it open | PASS |
| A press outside the panel closes it | PASS |
| The world clock switch changes its own rows | PASS (`13:53` → `1:53 PM`) |
| The world clock switch leaves the board clock alone | PASS (`06:53`) |
| The board clock switch changes the board clock | PASS (`06:53` → `06:53 AM`) |
| The board clock switch leaves the world clock alone | PASS |
| The calculator shows no caret before it is clicked | PASS |
| The caret blinks while the calculator has focus | PASS (`kx-calc-caret 1.06s`) |
| The caret goes when the calculator loses focus | PASS |
| The board offers an arrow to move a Home section up | PASS |
| The page is drawn in the new order | PASS (`… Quick launch → Recent activity → Startup` ⇒ `… Quick launch → Startup → Recent activity`) |
| The picker closes again, leaving the new order in place | PASS |
| The Rooms view offers a pop-out | PASS |
| The window is titled Rooms | PASS |
| The window holds the room itself, not a copy of the page | PASS |
| The window carries minimize, maximize and close | PASS |
| The window opens inside the viewport | PASS (`594, 274` of `1440×900`) |
| The route says where the room went | PASS |
| The pop-out drags by its title bar | PASS (`40, 35`) |
| *Bring it back* returns the room to its own view | PASS |
| No renderer exception | PASS |

Last run: **22/22 PASS** of the 22 checks the harness held then. It holds 23 since
its caret check was split into the two motion branches — the check, not the app,
had assumed the host allows motion. See the CI section at the end of this file.

### The clock's outline on a theme that has no `--fg`

The outline style stroked its digits with `var(--fg)`, a token no theme defines:
the declaration was invalid at computed-value time, `-webkit-text-stroke-color`
fell back to `currentColor`, and the digits are `transparent` by design — so the
clock was invisible on every theme, not only on the one it was reported on. The
five `var(--fg)` uses in the stylesheets now name `var(--ink)`, the token the
theme runtime actually sets.

### What is not covered

- **A region capture.** Implemented since this batch and covered by
  `pnpm verify:capture-window`, which grew the whole area path (see the section
  below this one).
- **Reordering with the mouse.** The Home section arrows are exercised by a
  press on the real button; dragging a block to a new place is not implemented.
- **A second display.** The pop-out opens on the primary display's viewport;
  moving a Kryvex window to another monitor is not part of this harness.

## The dragged capture area (`pnpm verify:capture-window`)

The capture window's own harness gained the area path, because the crop is the
part that can be quietly wrong: a box that produces a picture of the wrong size is
worse than no area feature at all. Every size below is read back out of the app's
own pixels — the preview window's `naturalWidth`/`videoWidth` — rather than from
the picker's claim about itself.

| Check | Result |
| --- | --- |
| The card starts on the whole target and offers an area | PASS |
| An area capture says it will ask for the area | PASS |
| The picker opens on a frozen frame of the target | PASS (`1440×900` in 746 ms) |
| A drag marks a box and offers to capture it | PASS (`719 × 450` of `1440×900`) |
| The box is smaller than the target it was drawn on | PASS |
| The picker confirms the area | PASS |
| The cropped still opened in the preview window | PASS |
| The still is the area, not the whole target | PASS (`719×450`, picker said `719 × 450`) |
| The chosen area is reused without asking again | PASS |
| The cropped recording arms and runs | PASS (389 ms to start) |
| The cropped recording can be stopped | PASS |
| The cropped recording opened in the preview window | PASS |
| The clip is the size of the area | PASS (`718×450` from a `719 × 450` area, even-rounded for VP8/VP9) |
| No page exception | PASS |

Last run: **37/37 PASS**, twice in a row, together with the whole-target checks
that were already there — the same run still takes a full-size still, saves it
through the real Windows dialog into `Downloads\Kryvex Captures`, and records a
three-second clip.

### The wait that made every capture stall

The first frozen frame took the full `SHOT_READY_TIMEOUT_MS` cap — 6 seconds —
because `firstFrame()` waited on `requestVideoFrameCallback`, and these `<video>`
elements are deliberately detached: they exist to be drawn from, never displayed,
so a callback that waits for a paint went unanswered until it timed out. The wait
is now a poll on `videoWidth`/`readyState`, and the picker opens in ~740 ms while
the cropped recorder starts in ~390 ms.

### The bug this harness caught

The still path reported "the area no longer fits" whenever the crop came back
smaller than the frame — which is every successful crop — so confirming an area
captured it once and then forgot it, and the next capture asked for the box
again. `cropBox()` now returns `exact`, true only when the box *is* the region
that was asked for, and the card reports a dropped area from that.

### What is not covered

- **An area that goes stale on a resized target.** `cropBox()` returning
  `exact: false` and the card dropping the area is covered by
  `tests/capture-region.test.ts`; the harness never resizes the target between
  saving an area and capturing with it.
- **A drag that starts outside the frame.** Held at the frame's edge by
  `regionFromDrag()` and covered by unit tests; the harness drags inside it.
- **A cropped recording longer than three seconds.** The same clip is recorded
  for 3.5 s; the three-minute cap and the stop path are unchanged and covered by
  the whole-target run.
- **The browser build.** The picker is renderer-only and shares the path, but no
  browser run was made.

## The product name, spelled correctly (`pnpm verify:link`)

Run on 2026-10-27 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3.

The phone companion shipped as **Kyvex Link** — one letter short — and the name
had spread into the desktop copy, the phone page, the served page's own title,
the catalogue labels, the docs and the `localStorage` keys the phone keeps its
pairing under. The spelling is now `Kryvex Link` everywhere, and a phone that
paired under the old keys is not asked for a new code: the older value is read
once and moved onto the current key.

| Check | Command | Result |
| --- | --- | --- |
| Renderer and main typecheck | `pnpm typecheck` (`tsc --noEmit` ×2) | exit 0 |
| Full suite | `npx vitest run` | **1005/1005** across 89 files |
| Companion storage | `npx vitest run tests/link-companion.test.ts` | 9/9 — a token under the old key is moved forward and the old key removed, the current key wins when both hold a value, unpairing clears both spellings, the phone name moves the same way, a blank name falls back, and storage that throws reads empty instead of breaking the page |
| Renderer copy audit | `node scripts/audit-i18n.cjs` | PASS — no hardcoded UI strings |
| End-to-end harness | `pnpm verify:link` (`scripts/verify-link.cjs`) | **35/35 PASS** |
| CI on the push | run 40536740847 (`.github/workflows/ci.yml`) | **success**, 1m19s — install, advisories, typecheck, unit tests, web build, one-time-code relay |

### The page check that failed before this fix

The harness asserts *the companion page is served* by looking for "Kryvex Link"
in the HTML the link server returns, and that HTML **is** `companion.html`: the
page's `<title>` and its `noscript` line were the two places the old spelling
survived the rename. Read straight out of the file, `git show
HEAD:companion.html` contains "Kryvex Link" **false**; `dist/companion.html`
after the fix, **true**. The harness row above is that check passing, on the page
the real server serves.

### The CI the commit before this one failed, and why

Run 40529322614, on the commit before this batch, is **failure**, and it stopped
at step 5, *Install dependencies* — `pnpm install --frozen-lockfile` — two
seconds in, with the advisories, typecheck, unit tests, web build and the
one-time-code relay all **skipped**. Two seconds to failure is a manifest and
lockfile that disagree, not a download that timed out, and that is exactly what
they did: the shell batch's slice of `package.json` had been rebuilt from the
version before the services batch, so it dropped `pdf-lib` while the lockfile's
importer block still declared `pdf-lib ^1.17.1`. The dependency is not decoration
— File Forge's PDF group loads it on demand with `await import('pdf-lib')` — and
a local typecheck cannot see any of it, because the package is installed here
whatever the manifest says and a dynamic import is not resolved at compile time.

The first commit of this batch restores both dropped lines; the run for this
batch passes that same step in 10 s. CI is also the only place the two files were
ever reconciled on a clean checkout: locally, `pnpm install --frozen-lockfile`
stopped at *Aborted removal of modules directory due to no TTY* rather than
running, so the local checks could not settle it either way.

### What is not covered

- **A real phone.** The page is driven over HTTP and in Chromium on this machine;
  no Android or iOS device was on the network during the run.
- **An old token arriving from a real phone.** The move from the older key is
  covered by unit tests against a stubbed `localStorage`; no phone carried a
  token from the previous build into this one.
- **A downgrade.** A phone running the older page against a newer desktop is not
  a supported path; the old key is only ever read, never written.
- **The Electron harnesses in CI, for the run above.** That run predates the
  workflow steps for `verify:inhouse`, `verify:shell-batch` and `verify:link`, so
  its green covered install, advisories, typecheck, the unit suite, the web build
  and the one-time-code relay, and the harness results above are from this
  machine. They are steps from the next push; see the section below.

## The Electron harnesses, in CI (`.github/workflows/ci.yml`)

Run on 2026-10-27 in `X:\Veyra`, Node 24.19.0, Windows 11, Electron 44.9.3.

The three harnesses that drive a real app — `verify:inhouse` (Arcade, File Forge
and Canvas), `verify:shell-batch` (the shell changes) and `verify:link` (the phone
companion over its own HTTP listener) — were local-only. They need a built
desktop app and a window, and the workflow had neither. They are steps now, after
the web build:

| Step | Command |
| --- | --- |
| Build the desktop app | `pnpm build` (`vite build` + `tsc -p tsconfig.electron.json`) |
| Verify the in-house services | `node scripts/verify-inhouse-services.cjs` |
| Verify the shell batch | `node scripts/verify-shell-batch.cjs` |
| Verify Kryvex Link | `node scripts/verify-link.cjs` |

The web build above writes `dist-web/` and leaves `dist/` to this step, so the
desktop build is made once and the harnesses run from its output. Calling the
`pnpm` aliases would rebuild for each of the three; that is the only difference
from `pnpm verify:inhouse`, `pnpm verify:shell-batch` and `pnpm verify:link`.

### The Electron binary, on the runner

The harnesses need a real `electron.exe`, and pnpm runs a dependency's build
scripts only when the workspace allows it. `pnpm-workspace.yaml` allows
`electron`, but `allowBuilds` is a pnpm 11 setting and the workflows pin
`version: 10`, so it was checked rather than assumed. Against pnpm 10.34.8 — what
`version: 10` resolves to — a throwaway workspace with `allowBuilds: esbuild:
true` ran esbuild's postinstall, and the same workspace with `esbuild: false`
skipped it. The allowlist is honoured on pnpm 10, so Electron's postinstall runs
on the runner and the binary is there. No pin change was needed.

### A checkout with no `runtime/`

`runtime/` is gitignored and fetched at package time, so a runner has none of it.
The built-in tools harness was re-run with that directory moved aside: the app
booted, and all 29 checks passed in the same state a fresh checkout is in.

### What a window does on a runner

These harnesses measure layout with `getBoundingClientRect`, await
`requestAnimationFrame` and dispatch real pointer events. A runner's window sits
on a desktop nobody is looking at, and Chromium throttles a window it believes is
occluded: timers slow to roughly one tick a second and animation frames can stop,
which is enough for a `waitFor` to time out on a machine that is idle rather than
broken. Each harness therefore launches the app with
`--disable-background-timer-throttling`, `--disable-renderer-backgrounding` and
`--disable-backgrounding-occluded-windows`. Those switches change how often the
renderer wakes, not what a check measures, so the same checks run here.

### The three on this machine, with those switches

| Harness | Command | Result | Wall clock |
| --- | --- | --- | --- |
| Built-in tools | `node scripts/verify-inhouse-services.cjs` | **29/29 PASS** | 3.5 s |
| Shell batch | `node scripts/verify-shell-batch.cjs` | **23/23 PASS** | 3.6 s |
| Link | `node scripts/verify-link.cjs` | **35/35 PASS** | 10.3 s |

The desktop build ahead of them took 2.5 s. No `electron.exe` was left running
after the runs, and the report files (`.tmp-inhouse-report.txt`,
`.tmp-shell-batch-report.txt`) are gitignored.

### The first two runs on a runner

The steps first ran in CI run 40550101369, the push that added them, and the
runner found a difference at once — which is the whole reason they were moved:

| Step | On the runner | Result |
| --- | --- | --- |
| Build the desktop app | 3 s | success |
| Verify the in-house services | 5 s | **29/29 PASS** |
| Verify the shell batch | 5 s | **FAILED**, at the caret |
| Verify Kryvex Link | — | **skipped** |

The failure was the caret, and the check was wrong rather than the app:

```
FAILED: the caret blinks while the calculator has focus (none 0.001s)
```

`styles-board.css` stops the caret blinking for a reader who asked motion to
stop — the media query sits directly above that rule and says as much — and a
Windows runner ships with the system's animations off, which Chromium reports as
`prefers-reduced-motion: reduce`. The app was right; the check had taken the
host's preference for granted. It now emulates both branches over the DevTools
protocol — `reduce`, where the caret must show no animation, then
`no-preference`, where it must blink — and prints the host's own answer with the
first of them. On this machine, which asks for `no-preference`, it is the
`reduce` branch that proves the emulation reaches the renderer.

Run 40551244453, on that fix, is **success** on every step, and the runner's own
log carries both halves of the caret and all three harnesses:

```
PASS the caret holds still for a reader who asked motion to stop (this host asks for: reduce)
PASS the caret blinks while the calculator has focus (kx-calc-caret 1.06s)
All checks passed (29).
All checks passed (23).
link harness: PASS
```

All three pass on a runner as well as here: there 5 s, 9 s and 10 s against 3.5 s,
3.6 s and 10.3 s here. The 29 in-house checks and the Link harness were untouched
by this fix and passed on the runner at their first attempt.

### What is still not covered

- **The rest of the Electron harnesses.** `package.json` also holds
  `verify:browser`, `verify:services`, `verify:rooms`, `verify:capture-window`,
  `verify:model` and the other CDP harnesses — around twenty of them. They stay
  local for now; these three are the ones this batch added or changed, and the
  only ones whose behaviour on a runner is known.
- **Any runner but `windows-latest`.** Both runs used one image
  (`windows-2025-vs2026`, 20261021.278). A macOS or Linux runner would need a
  display server before any of this applies.
