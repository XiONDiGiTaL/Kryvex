# Kryvex 0.9.4-hotfix.1: Windows hotfix

Prepared 2026-10-26 for the `v0.9.4-hotfix.1` tag. This is a fix, not a feature
release, so the version line stays at **0.9.4** and the build wears the
`-hotfix.1` suffix ([UPDATES.md](UPDATES.md)). 0.9.5 was never cut: the line does
not move again until a release whose features all work out of the box.
Everything in 0.9.4 is included.

Two Home-board tools were not doing what their cards said.

- **The world clock listed regions, not places, and could not forget them.** A
  user in İzmir read *Istanbul*, because the row was the zone's name, and a row
  added to the four-place list could not be taken off it. Rows are now places:
  the city and country are looked up through the same keyless geocoder the
  weather card uses, listed under the name the user typed, and removed with the
  × on the row. Adding a second city in a zone already on the clock relabels that
  row instead of stacking a duplicate, and the 12-hour / 24-hour switch in the
  card header now also drives the time in the board header, so one preference
  cannot apply to one and not the other.
- **"Quick capture" was an inbox, not a capture tool.** It stored typed lines and
  never removed them, which is not what the card promised. It is replaced by a
  screen capture and recorder for the app: pick an open service, a window or a
  screen, take a still or a clip, look at it, then copy it or choose where to
  save it — the same question a snipping tool asks, on Kryvex's own surfaces.

## What changed

- **The clock takes a city (`src/components/WorldClockWidget.tsx`,
  `src/lib/world-clock.ts`).** `worldClocks` is now a list of
  `{ id, zone, city, country, latitude, longitude }` rows. A bare zone string
  saved by an older build still loads and is labelled from its zone, unknown
  zones are dropped rather than drawn, and `Intl` formatting is what validates a
  zone offline (`isValidTimeZone`). `addClock` replaces the row for a zone,
  `removeClock` deletes one, and `MAX_WORLD_CLOCKS` still caps the list at four.
  The lookup goes through the main process (`kryvex:weather:lookup`, the
  Open-Meteo geocoder) and falls back to the web fetch outside Electron, so the
  same city search works in the browser build. `clockHour12` is a new setting,
  persisted through `src/lib/store.ts` / `src/lib/defaults.ts`.
- **The capture card captures (`src/components/ScreenCaptureWidget.tsx`,
  `src/lib/screen-capture.ts`).** The target list is the desktop capture source
  list the Party tools already use, grouped into **Services**, **Windows** and
  **Screens**; a still is drawn to a canvas and encoded as PNG, a clip is a
  `MediaRecorder` over the same stream with a live `REC 0:00` timer and a
  three-minute cap. The result appears in a preview with **Copy**, **Save as…**
  and **Discard**, and the last four captures are listed with **Show in folder**
  and **Forget** so the list can be cleared. Recording and `getDisplayMedia`
  failures are reported on the card instead of silently doing nothing.
- **The write happens in the main process (`electron/capture-tools.ts`,
  `electron/capture-rules.ts`, `electron/main.ts`, `electron/preload.ts`).**
  The renderer sends base64 and a suggested name over `kryvex:capture:save`,
  `:copy` and `:reveal`; only the shell renderer is accepted as sender. The save
  dialog is the only way a file is created and it opens in
  `Downloads\Kryvex Captures`; the name is sanitised to a bare stem with the
  extension forced to match the kind, so a proposed `setup.exe` cannot be written
  as an executable, and the payload is refused above 64 MiB (still) or 128 MiB
  (clip) or when it is not base64. Nothing here widens the preload surface or
  exposes a path the page chooses.
- **The old inbox is gone.** `src/components/CaptureWidget.tsx`,
  `src/lib/capture.ts` and `tests/capture.test.ts` were deleted; `migrateCaptures`
  in the store still folds any `captures` an older board saved into sticky notes,
  so nothing a user typed is lost. `home.screenCaptures` holds the recent list
  and `Screen capture` is the widget's label in the picker.
- **New strings, four languages.** The city search, the 12/24-hour switch, the
  capture card and its notices were added to `src/lib/i18n-home-tools.ts` in
  en/es/de/fr; `tests/i18n-coverage.test.ts` carries the ratchet upward and
  `scripts/audit-i18n.cjs` reports no hardcoded UI strings.
- **Version 0.9.4-hotfix.1.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.4-hotfix.1-v1`) move together. The packaged binary keeps the
  version line in its resource — `ProductVersion 0.9.4.0` with
  `FileVersion 0.9.4-hotfix.1` — which is what `scripts/verify-self-update.cjs`
  compares a hotfix on, and the app itself reports the full
  `0.9.4-hotfix.1` in its header and Updates panel.

## Artifacts

Built locally by `pnpm package:win` from this working tree (no EPERM on
`release/win-unpacked`), then installed in place by the wizard capture below:

| File | Local size | Local SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-hotfix.1-x64.exe` | 134,362,910 B (128.13 MiB) | `46dbe81a877a765772cf53e0cddc964fc2504822f18743bcd5f0561206d509e7` |
| `Kryvex-Portable-0.9.4-hotfix.1-x64.exe` | 134,125,765 B (127.90 MiB) | `23a81eb2c18d3323ef8d619677f637bbcd91a746001f2b242068a7d36df896aa` |

`release/SHA256SUMS.txt` carries both, and the installed `C:\Kryvex\Kryvex.exe`
reports `ProductVersion 0.9.4.0` / `FileVersion 0.9.4-hotfix.1`. No model weights
are bundled.

## Install

1. Run `Kryvex-Setup-0.9.4-hotfix.1-x64.exe`, or let an installed 0.9.4 update
   itself through **Settings → Updates** — the updater ranks a hotfix above the
   release it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npx vitest run`: exit 0, **828/828** tests across 77 files, including the new
  `tests/world-clock.test.ts`, `tests/screen-capture.test.ts` and
  `tests/capture-rules.test.ts`.
- `pnpm build:web`: PASS (1.7 MiB), `scripts/check-web-build.cjs` PASS, bundle
  `assets/main-DEX2m-Ju.js`, stylesheet `assets/main-BKKSMrRQ.css`, companion
  `assets/companion-CTBsK4FZ.js`, worker cache `kryvex-web-0.9.4-hotfix.1-v1`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.4-hotfix.1-x64.exe`: PASS — five pages captured, the
  install page ran for 25,350 ms, the installer exited 0, the capture was
  archived under `docs/media/releases/0.9.4-hotfix.1-wizard/`, and the installed
  `C:\Kryvex\Kryvex.exe` now carries this build.
- `pnpm verify:home-tools` (`scripts/verify-home-tools.cjs`), which drives the
  **installed** build over CDP: **12/12 checks passed.** The footer
  and `appInfo()` report `0.9.4-hotfix.1`; both cards can be switched on from the
  board's own **Widgets** picker; the clock card draws and its 12-hour switch
  flips; typing *Izmir* and pressing the button offered the lookup result, and
  **Add city** produced a row labelled **Izmir** that the × then removed (1 → 0);
  the capture card drew with its target list populated (Kryvex, Brave windows and
  the screen) and no page exception was raised.
- `pnpm release:check`: PASS for 0.9.4-hotfix.1.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built hotfix installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.4-hotfix.1-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.4-hotfix.1-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.4-hotfix.1" |
| 2 | [Choose Install Location](media/releases/0.9.4-hotfix.1-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 466.0 MB" |
| 3 | [Installing](media/releases/0.9.4-hotfix.1-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed." |
| 4 | [Installation Complete](media/releases/0.9.4-hotfix.1-wizard/pages/04-Installation%20Complete.png) | "Setup was completed successfully." |
| 5 | [Completing Kryvex Setup](media/releases/0.9.4-hotfix.1-wizard/pages/05-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 25,350 ms between **Installing** and **Installation
Complete**, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The capture target list is the system source list (services that are open as
  modules, windows, screens). A service that is not open is not offered, and a
  window that is minimised to the tray may be listed but capture black.
- Recording is capped at three minutes and produces WebM; there is no trimming,
  annotation or audio-only mode.
- The browser/PWA build has no main process: the card asks the browser to share a
  screen or window and downloads the result, so there is no save dialog and no
  **Show in folder**.
- The city lookup needs a network round trip. Offline, the card says the lookup
  is unreachable and the rows already on the clock keep working.
