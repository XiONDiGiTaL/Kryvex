# Kryvex 0.8.1: Windows patch release

Published 2026-10-21 from the `v0.8.1` tag (commit `374f25e`). This is a
one-fix patch: 0.7.x and 0.8.0 could show an error dialog when the app closed.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.1 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.1).

## What changed

- **Closing the app no longer raises a main-process error.** Closing 0.7.x or
  0.8.0 could show **“A JavaScript error occurred in the main process:
  TypeError: Object has been destroyed”** before the window went away. The
  Rooms broker released its shell reference by comparing against
  `win.webContents` inside a `BrowserWindow` `closed` listener; the window is
  already destroyed by then, so the getter itself threw and Electron turned the
  exception into a blocking dialog. The handler now compares against a
  reference captured when the window was attached, and touches nothing on the
  closed window.
- **A guard against it coming back.** `pnpm verify:party-close` drives the
  compiled module with a window that throws on every property access once it is
  marked destroyed. It fails with `Object has been destroyed` against the old
  handler and passes against this one.

Everything from 0.8.0 is included: the GGUF model-file runner, the Chrome
identity and client hints for embedded pages, custom shield filter lists,
sign-ins that survive a restart, and the green **UP TO DATE** verdict.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.1-x64.exe` |
| `Kryvex-Portable-0.8.1-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry.

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.1-x64.exe` | 120,286,681 B (114.7 MiB) | `880b1804c733ffe83b48651759746fa53e333339f35b1f4da6eed7df3702634f` |
| `Kryvex-Portable-0.8.1-x64.exe` | 120,049,554 B (114.5 MiB) | `df96bf9672fe4b619eab6867d39b887347624e4963a65f9d3ae6dcab3604b93e` |

Both downloaded copies hash to those values, and both EXEs report
`ProductVersion 0.8.1`.

## Install

1. Run `Kryvex-Setup-0.8.1-x64.exe`, or let an installed 0.8.0 update itself
   through **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. Use **Settings → Updates** to confirm the release is seen.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for renderer and `electron/`.
- `npx vitest run`: exit 0, **261/261** tests across 27 files.
- `npm run build`: exit 0.
- `node scripts/verify-party-close.cjs`: PASS on the fixed handler, and FAIL
  with `Object has been destroyed` when the old line was put back, so the guard
  was checked in both directions.
- `node scripts/verify-updater.cjs`: PASS, including the up-to-date branch.
- Published artifacts: the Setup and Portable EXEs hash to the entries in
  `SHA256SUMS.txt` and report `ProductVersion 0.8.1`.
- The downloaded Portable EXE launched in a disposable profile with no feed
  override: `mode: portable`, `currentVersion 0.8.1`, and the launch check
  against the live GitHub API returned `current`. Its extracted
  `resources/app.asar` contains `shell === attached` and no longer contains
  `shell === win.webContents`, so the fixed handler is in the shipped binary.
  Closing that window exited with code 0 and printed no "Object has been
  destroyed" or "Uncaught Exception" text.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. `node scripts/verify-self-update.cjs --no-app --wizard --archive
--installer <the published setup> --version 0.8.1` reads them from the
dialog's own controls; the capture is committed with this record:
[capture.md](media/releases/0.8.1-wizard/capture.md), 4 pages and exit code 0.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.1-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.8.1" |
| 2 | [Choose Install Location](media/releases/0.8.1-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 421.3 MB"; "Space available: 50.1 GB" |
| 3 | [Installing](media/releases/0.8.1-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.8.1" |
| 4 | [Completing Kryvex Setup](media/releases/0.8.1-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

0.8.1 shipped before a wizard capture became part of a release cut, so this
capture was recorded on 2026-10-27 from the installer that was actually
published for this version (`Kryvex-Setup-0.8.1-x64.exe`, SHA-256
`880b1804c733ffe83b48651759746fa53e333339f35b1f4da6eed7df3702634f`) rather than
at release time: it is a replay of what that installer displayed, not a note
written then. The installer found the per-user copy already on the machine and
reported it as a reinstall/upgrade. The install page ran for 18,120 ms between
**Installing** and **Completing Kryvex Setup**, the whole capture took 30,811
ms, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The dialog could not be observed disappearing in an installed 0.7.x profile,
  because that profile keeps the old line until 0.8.1 installs over it. The fix
  is proven by the isolated probe that showed the throwing read, the in-app
  `try`/`catch` that logged it, and the guard that fails on the old handler.
- Everything else from 0.8.0 still applies: a model file needs a llama.cpp
  binary the user supplies, filter rules depend on the upstream engine, and
  fingerprint farbling is a preload wrapper rather than a Chromium patch.
