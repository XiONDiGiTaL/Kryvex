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
