# Kryvex 0.8.3: Windows release

Published 2026-10-21 from the `v0.8.3` tag. A page's `window.open` no longer
leaves Kryvex for the system browser, so a sign-in that opens a window finishes
in the tab strip and hands its result back to the page that started it.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.3 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.3).

## What changed

- **Pop-ups open as tabs.** A browser tab calling `window.open` (the first step
  of most Google, Microsoft and GitHub sign-ins) used to hand the URL to the
  system browser. The provider then signed in a different application, and the
  opener page waited forever for the `postMessage` that ends the flow. Kryvex now
  keeps the popup inside its own window and shows it as an entry in the tab
  strip. The popup keeps the session and `window.opener` it was created with,
  which is exactly what a provider needs; the tab strip gives it a name, a close
  button and back/forward/reload.
- **The window covers the page, not the chrome.** The popup is placed over the
  browser canvas, so the toolbar, tab strip and library panel stay Kryvex's own.
  The renderer reports the canvas rectangle and the shell re-places the window on
  resize, library-panel toggle and scroll; a harness measures 0 px of drift.
- **Selecting another tab hides the popup**, selecting the popup shows it again,
  and a page calling `window.close()` closes the tab and returns to the page that
  opened it. Closing the opener closes its popup, the way a browser closes a
  window whose opener is gone.
- **Service modules are untouched.** A module's sign-in window still opens beside
  its stage, because that window belongs to the module rather than the browser's
  tab strip.
- **Why a window and not a tab view.** Electron refuses to adopt a popup's page
  into a `WebContentsView` (`options.webContents is already attached to a
  window`), and moving the page between contents is what would drop
  `window.opener`. The real window is the part that makes the sign-in work; the
  tab strip is the shell's presentation of it.
- **Browser tabs now allow popups so the policy can run.** Without the
  `<webview allowpopups>` attribute Electron refuses `window.open` before the
  main process is consulted, which the harness caught on its first run. The
  handler still decides: `background-tab` pop-unders, non-http(s) schemes and
  `about:blank`-only shells keep the old treatment.

No 0.8.2 fix was removed. Everything from 0.8.2 is included: the lifecycle
guards that stopped the close-time **“A JavaScript error occurred in the main
process”** dialog, the up-to-date verdict, the GGUF model-file runner, the Chrome
identity for embedded pages, custom shield filter lists and sign-ins that
survive a restart.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.3-x64.exe` |
| `Kryvex-Portable-0.8.3-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry.

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.3-x64.exe` | 120,292,667 B (114.7 MiB) | `ed91ad0793de3a504c1a2667fbe464959da57429ee7c80af1240ed86533b8787` |
| `Kryvex-Portable-0.8.3-x64.exe` | 120,055,522 B (114.5 MiB) | `850fe2c6aa5112563b31f9927ccec345429f8f03dbeb56390b333d004f4a8ec4` |

Both downloaded copies hash to those values and to the digests GitHub reports,
and both EXEs report `ProductVersion 0.8.3`.

## Install

1. Run `Kryvex-Setup-0.8.3-x64.exe`, or let an installed 0.8.2 update itself
   through **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. Use **Settings → Updates** to confirm the release is seen.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for renderer and `electron/`.
- `npx vitest run`: exit 0, **287/287** tests across 29 files, including 19 new
  cases for the popup policy and its placement arithmetic.
- `npm run build`: exit 0.
- `node scripts/audit-lifecycle.cjs`: clean, 40 files.
- `node scripts/verify-popup-tabs.cjs`, PASS: the popup tab appears with the
  page's own title, the opener receives `kx-popup-ok` over `window.opener`, the
  popup's client rectangle equals the canvas rectangle with 0 px drift, tab
  switching hides and reshows the window, and closing returns to the opener.
- `node scripts/verify-updater.cjs`: PASS, including the up-to-date branch.
- `node scripts/verify-service-engine.cjs`: PASS.
- `node scripts/audit-i18n.cjs`: clean; the popup tab's fallback label and the
  canvas note are translated for es/de/fr.
- Published artifacts: the tag workflow (run 39582848868) passed every step and
  published a stable, non-draft release. The downloaded Setup and Portable EXEs
  hash to `SHA256SUMS.txt` and to the digests GitHub reports, and both report
  `ProductVersion 0.8.3`. Extracting the Portable build's `resources/app.asar`
  shows `dist-electron/popup-tabs.js` and `dist-electron/popup-rules.js` beside
  a `main.js` that registers every `kryvex:popups:*` channel, with `skipTaskbar`
  and `setBounds` in the placement code: the feature is in the shipped binary,
  not only in the checkout.

## Self-update from an installed 0.8.2

The installed 0.8.2 at `C:\Kryvex` was driven through its own **Settings →
Updates** to this release, with an isolated profile and a DevTools port so the
panel could be read without touching the user's state.

| Stage | What the installed 0.8.2 showed |
| --- | --- |
| Before a check | `v0.8.2 · BUILD INSTALLED`, "No update check has run yet.", `Check for updates` / `View release` |
| After **Check for updates** | `Kryvex 0.8.3 is available.`, "Download the installer, then Kryvex verifies it against the release checksum.", `Download update` / `View release` / `Check again`, with the release notes reading `**Full Changelog**: …/compare/v0.8.2...v0.8.3` |
| After **Download update** | `Kryvex 0.8.3 is ready to install.`, "The installer was verified. Kryvex closes, runs it, and you can reopen when it finishes.", `Install and restart` |
| After **Install and restart** | "Closing Kryvex to install…", then the app exited with code 0 and the NSIS wizard opened |

The file the updater downloaded into its own profile was
`updates/Kryvex-Setup-0.8.3-x64.exe`, 120,292,667 bytes, SHA-256
`ed91ad0793de3a504c1a2667fbe464959da57429ee7c80af1240ed86533b8787`: identical
to the published digest, so the mandatory check ran on the real file rather than
a fixture.

After the wizard finished, `C:\Kryvex\Kryvex.exe` reported
`ProductVersion 0.8.3.0` with a fresh write time, and a launch with an isolated
profile returned `version 0.8.3`, `packaged true`, Electron 44.2.0 / Chrome 152.
Settings → Updates in that build read `v0.8.3 · BUILD INSTALLED`,
"Kryvex 0.8.3 is the latest release.", a green **UP TO DATE** verdict and "Last
checked Oct 21, 2026, 06:19 AM"; pressing **Check for updates** again kept the
same current verdict.

Not recorded for this run, and not claimed:

- The wizard was advanced by sending `Enter` to its default button, so only the
  window title (`Kryvex Setup`) and the installed result were captured, not the
  page sequence or its copy.
- The finish page relaunched Kryvex with the **real** user profile
  (`%APPDATA%\Kryvex`), because NSIS starts the app through the shell rather
  than inheriting the driver's environment. That instance was closed afterwards;
  the version check above used a separate launch with an isolated profile.
- The reported exit code for the installer process came back empty (PowerShell
  returned no value), so “the wizard finished” rests on the process exiting, the
  EXE being replaced and the new version reporting itself.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. `pnpm verify:self-update --wizard --archive` reads them from the
dialog's own controls and commits them with this record:
[capture.md](media/releases/0.8.3-wizard/capture.md), four pages and exit code 0.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.3-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.8.3-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 421.3 MB" |
| 3 | [Installing](media/releases/0.8.3-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed." |
| 4 | [Completing Kryvex Setup](media/releases/0.8.3-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

The capture was made after this release was published, and because 0.8.3 is the
latest release it is a same-version reinstall: the installer itself calls it a
reinstall/upgrade. The install page ran for 20,323 ms between the two pages, and
the installer exited 0. The next release's capture is the first that will record
a real version change, driven by the app's own update.

## Known limitations


- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The popup is an owned window, so Windows keeps it above the shell: a Kryvex
  modal opened while a popup is visible can render behind it. Closing the popup
  or switching tabs restores normal stacking.
- A real Google or Microsoft sign-in was not completed, because no test accounts
  are available here. The harness exercises the transport those providers depend
  on: `window.opener.postMessage` across a real popup sharing the session, but
  a provider that inspects window geometry or blocks embedded user agents may
  still refuse.
- Popup tabs are session state: they are not written to the state file and do
  not come back after a restart, because the page that opened them is gone.
- The popup overlay is proven by measured geometry rather than a screenshot:
  desktop capture shows whatever is in front, and a CDP screenshot of the shell
  does not include a native child window.
- Everything from 0.8.0 still applies: a model file needs a llama.cpp binary the
  user supplies, filter rules depend on the upstream engine, and fingerprint
  farbling is a preload wrapper rather than a Chromium patch.
