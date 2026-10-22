# Kryvex 0.8.7 — Windows release

Published 2026-10-22 from the `v0.8.7` tag. This release adds **Disk pulse**, a
local drive analyzer and guarded cleaner, moves its scan into a worker thread so
a full-drive walk can never compete with the window, and moves the service
transport into the status bar.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.7 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.7).

## What changed

- **Disk pulse, the fourth secret service** (`#/disk`, element x533). Health for
  the profile drive with `statfs` (free, used, total, percent) drawn as a
  heart-rate trace whose amplitude and speed follow how full the drive is, plus
  a usage meter; a `LOW SPACE` chip from 90%. An analyzer sizes the drive's
  top-level folders, up to eight, largest first, as proportional bars. A cleanup
  plan lists seven categories with real sizes and file counts: user temp older
  than 24 hours, crash dumps, the legacy Windows internet cache, thumbnail and
  icon caches, Chrome caches, Edge caches and the Windows Error Reporting queue.
  Categories whose roots do not exist report `NOT FOUND` instead of a fake zero.
  A 20-second budget bounds the walk, `Stop scan` cancels it, and a second scan
  is refused while one is in flight. Details: [DISK_PULSE.md](DISK_PULSE.md).
- **The scan runs in a worker thread.** `electron/disk-scan.ts` holds the
  read-only half with no Electron import, `electron/disk-scan-worker.ts` is the
  worker entry and `electron/disk-service.ts` orchestrates: one worker per scan,
  cancelled with a six-second grace before termination, killed if it outlives
  the budget by 25 seconds, and always terminated in `finally`. The renderer
  validates the payload field by field before it reaches the view. In the
  release harness a health call answered in 0 ms while the walk was running, and
  a second scan could be started and stopped without leaving a worker behind.
- **Safety is structural, not a confirmation dialog.** The renderer sends target
  ids only; roots and filters live in `electron/disk-rules.ts` and are re-read on
  every clean, so a stale or forged page cannot name a path. Every `unlink` is
  re-checked: strictly below its target root, never the root, never a drive root,
  never inside `Windows`, `System32`, `SysWOW64`, `WinSxS`, `Program Files`,
  `Program Files (x86)`, `ProgramData`, Desktop, Documents, Downloads, Pictures,
  Videos, Music, Favorites, `AppData\Roaming`, `AppData\LocalLow`, `.ssh` or
  `.gnupg`. Symlinks and junctions are never followed and each file is `lstat`ed
  immediately before deletion. Temp ignores anything touched in the last 24
  hours, files in use are skipped and reported, and no category that needs an
  administrator is offered, so the tool never raises UAC.
- **Two human gates.** The first visit requires an accepted disclaimer
  (persisted once), and every clean requires a modal naming the exact categories
  and bytes plus a typed `CLEAN`. The modal states that deletion bypasses the
  Recycle Bin and cannot be undone. A system-essential file is unreachable
  because no target root contains one; the protected-root check would refuse it
  anyway.
- **Service transport in the status bar.** Pinned services that play audio raise
  a compact strip beside the status bar instead of a floating dock. It fades
  while the page is in use, returns at the bottom edge and expands into the full
  island on hover or when pinned; `Escape` closes the pinned island. Details:
  [SERVICE_UX.md](SERVICE_UX.md).
- **Licence boundary of the reference projects.** Disk pulse was designed after
  reviewing Cleanmgr+, CleanManager and SquirrelDisk, but only CleanManager is
  MIT. Cleanmgr+ ships a EULA that forbids derivative works and SquirrelDisk is
  AGPL-3.0, so neither contributed code; every line shipped here is Kryvex's own.
  Recorded in [ATTRIBUTION.md](ATTRIBUTION.md).

## Artifacts

Built locally with `electron-builder --publish never` from this tree, so the
wizard could be captured before the tag:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.7-x64.exe` | 120,575,206 B (114.99 MiB) | `b08369150934aa24227c841cef35daa791e051f11b9ab8504562c46664f011f1` |
| `Kryvex-Portable-0.8.7-x64.exe` | 120,337,993 B (114.76 MiB) | `fa298ebf9e0c27fa305d5400e51f5b318f173a093b3871f3d3896823c9a3cb61` |

Both EXEs are **unsigned**. The tag-triggered workflow rebuilds and publishes
them; `SHA256SUMS.txt` covers both, and the updater ignores a release whose
installer has no matching entry.

## Install

1. Run `Kryvex-Setup-0.8.7-x64.exe`, or let an installed 0.8.6 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay.
3. The Portable EXE runs without installing. Its state still lives in
   `%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck` — exit 0 for the renderer and `electron/` (strict).
- `npm test` — exit 0, **466/466** tests across 48 files. The 19 disk-rule and
  service tests and the three scanner tests are part of that count.
- `npm run audit:i18n` — clean, no hardcoded UI strings in 35 renderer files.
- `npm run build` — exit 0; renderer and main rebuilt before packaging.
- `node scripts/verify-disk-pulse.cjs` — PASS, **12 assertions** against the
  built Electron app in a disposable profile: the route opens, the disclaimer
  gates the tool and can be accepted, health reads real numbers (`97% FULL`,
  29 GB free), the analyzer runs, the main process answers IPC in 0 ms while the
  walk is still running, seven categories are listed with real sizes, Clean arms
  only after a scan and is deliberately not pressed, a second scan starts and can
  be stopped, and IPC still answers after the worker is torn down. Capture:
  [screenshots/verify-disk-pulse.png](../screenshots/verify-disk-pulse.png).
- Unit coverage: `tests/disk-rules.test.ts` (containment, traversal, drive roots,
  protected subtrees, the 24-hour filter, target lookup),
  `tests/disk-service.test.ts` (the real cleaner on a fixture) and
  `tests/disk-scan.test.ts` (the worker body: sizing, the age filter, missing
  caches, an already-aborted signal).
- Packaging and the published artifacts are recorded below.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. The capture comes from the locally built 0.8.7 installer before any
tag, and is committed with this record:
[capture.md](media/releases/0.8.7-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.7-wizard/pages/01-Choose%20Installation%20Options.png) | “Who should this application be installed for?”; “There is already a per-user installation.(C:\\Kryvex) Will reinstall/upgrade.” |
| 2 | [Choose Install Location](media/releases/0.8.7-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\\Kryvex`; “Space required: 422.0 MB” |
| 3 | [Installing](media/releases/0.8.7-wizard/pages/03-Installing.png) | “Please wait while Kryvex is being installed.”; “Kryvex 0.8.7” |
| 4 | [Completing Kryvex Setup](media/releases/0.8.7-wizard/pages/04-Completing%20Kryvex%20Setup.png) | “Kryvex has been installed on your computer. Click Finish to close Setup.” |

The run took 33,253 ms end to end, the install page ran for 23,091 ms, and the
installer exited 0. The installed `C:\\Kryvex\\Kryvex.exe` now reports
`ProductVersion 0.8.7.0`. A first attempt hung on the install page because an
installed Kryvex was still running; the run above was made with no Kryvex
process running, and scripts the installer relaunched were closed afterwards.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The cleaner runs on the main thread, not in the worker. It is bounded to 60
  seconds and needs the guard module beside every unlink, so it keeps the
  in-process `lstat`/protected-root re-check.
- Windows Update, delivery optimization, DISM and Recycle Bin emptying are not
  offered: they need an administrator or shell APIs, and this version never asks
  for elevation.
- The analyzer sizes top-level folders only. There is no duplicate finder, no
  sunburst chart and no scheduled scan.
- macOS and Linux were not exercised.
