# Kryvex 0.8.2: Windows patch release

Published 2026-10-21 from the `v0.8.2` tag (commit `31cfe5d`). 0.8.1 fixed the
one handler named in the reported stack; this release closes the rest of that
class of bug, so an installed build stops reading windows and web contents that
are already gone.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.2 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.2).

## What changed

- **Folder pickers no longer hand a closed window to Windows.** Choosing a
  download folder, installing an extension from a file or folder, or opening a
  `.torrent` called `dialog.showOpenDialog(window, …)` with only a null check.
  A destroyed parent window throws `Object has been destroyed` inside the
  picker, which reached the user as the blocking “A JavaScript error occurred in
  the main process” dialog. Each picker now asks whether the window is alive
  first and answers **“The main window is not ready.”**
- **The IPC sender check compares a reference, not the live getter.**
  `isShellSender` read `mainWindow.webContents` for every IPC message, so a
  message arriving while the window was tearing down threw out of the handler.
  It now compares against the `shellContents` captured when the window was
  created.
- **The permission broker holds its own shell reference.** `isShellCapture` and
  the broker's `send` read `this.window.webContents`; both use a shell captured
  at attach time plus `isAliveContents`, so a prompt resolved after the window
  closed is dropped instead of throwing.
- **Rooms asks before it reads.** The display-media handler compared against
  `shell.mainFrame` without checking whether the shell was alive, and the
  source list called `getType()` before `isDestroyed()`. A closed shell now
  refuses the request, and sources are filtered by liveness first.
- **A mechanical guard against the whole class.** `electron/lifecycle.ts` adds
  `isAliveWindow` / `isAliveContents`. `pnpm audit:lifecycle` walks the body of
  every `closed`/`destroyed` registration and reports any window or contents
  read, and `tests/lifecycle.test.ts` runs it over `electron/` **and** over a
  fixture holding the old crashing line, so the audit itself is checked.
  `pnpm verify:guards` drives the three compiled pickers with a window that
  throws on every property except `isDestroyed()` and an Electron stub that
  counts dialog requests; removing one compiled guard makes it fail with a
  dialog call and “Selection cancelled”. ED-013 records the rule.

No feature work is included, and nothing in 0.8.1 or 0.8.0 was removed.
Everything from 0.8.0 is included: the GGUF model-file runner, the Chrome
identity and client hints for embedded pages, custom shield filter lists,
sign-ins that survive a restart, and the green **UP TO DATE** verdict.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.2-x64.exe` |
| `Kryvex-Portable-0.8.2-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry.

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.2-x64.exe` | 120,287,904 B (114.7 MiB) | `41a009f8c3c9c6cbf8bab3ec830ca18bb4a932492043ca2087f4241573ebe036` |
| `Kryvex-Portable-0.8.2-x64.exe` | 120,050,696 B (114.5 MiB) | `5dca57aa46e846fa3e961727419ab9335d3431c90c0dbc524ca143429c2468b6` |

Both downloaded copies hash to those values, and both EXEs report
`ProductVersion 0.8.2`.

## Install

1. Run `Kryvex-Setup-0.8.2-x64.exe`, or let an installed 0.8.1 update itself
   through **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. Use **Settings → Updates** to confirm the release is seen.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for renderer and `electron/`.
- `npx vitest run`: exit 0, **268/268** tests across 28 files.
- `npm run build`: exit 0.
- `node scripts/audit-lifecycle.cjs`: clean, 38 files.
- `node scripts/verify-party-close.cjs`: PASS on the fixed Rooms handler.
- `node scripts/verify-window-guards.cjs`: PASS on all three pickers, and FAIL
  (`1 call(s)`, “Selection cancelled”) when the compiled download-picker guard
  was removed, so the guard was checked in both directions.
- `node scripts/verify-updater.cjs`: PASS, including the up-to-date branch.
- `node scripts/verify-service-engine.cjs`: PASS (mount, unread badge, popup
  cookie, cookie across restart, per-service clear).
- `node scripts/verify-rooms.cjs`: PASS with a 2560×1440 screen share flowing
  through the changed display handler.
- `npm run audit:i18n`, clean.
- Published artifacts: the release workflow (run 39559900423) passed every step
  and published without a draft. The downloaded Setup and Portable EXEs hash to
  the entries in `SHA256SUMS.txt` and to the digests GitHub reports, and both
  report `ProductVersion 0.8.2` / `FileVersion 0.8.2`. The Portable build's
  extracted `resources/app.asar` carries `isAliveWindow` in `storage.js`,
  `extensions.js` and `torrents.js` with the “not ready” answers,
  `shellContents` in `main.js`'s `isShellSender`, `isAliveContents` in
  `permissions.js`, and the attach-time reference in `party.js`; the old
  `shell === win.webContents` text is absent.
- The downloaded Portable EXE was launched against a disposable profile through
  `KRYVEX_USER_DATA`: it opened a window titled **Kryvex**, wrote its profile,
  and closed through the window's own close path: the process was gone within
  40 s and no Kryvex process or dialog was left behind.
- The live feed passes the app's own rules: parsing
  `api.github.com/repos/XiONDiGiTaL/Kryvex/releases/latest` yields release
  `0.8.2` with a trusted Setup URL, a Portable asset and checksum entries that
  match the uploaded digests; `isNewer` returns true for 0.8.1 and false for
  0.8.2.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. `node scripts/verify-self-update.cjs --no-app --wizard --archive
--installer <the published setup> --version 0.8.2` reads them from the
dialog's own controls; the capture is committed with this record:
[capture.md](media/releases/0.8.2-wizard/capture.md), 4 pages and exit code 0.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.2-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.8.2" |
| 2 | [Choose Install Location](media/releases/0.8.2-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 421.3 MB"; "Space available: 54.0 GB" |
| 3 | [Installing](media/releases/0.8.2-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.8.2" |
| 4 | [Completing Kryvex Setup](media/releases/0.8.2-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

0.8.2 shipped before a wizard capture became part of a release cut, so this
capture was recorded on 2026-10-27 from the installer that was actually
published for this version (`Kryvex-Setup-0.8.2-x64.exe`, SHA-256
`41a009f8c3c9c6cbf8bab3ec830ca18bb4a932492043ca2087f4241573ebe036`) rather than
at release time: it is a replay of what that installer displayed, not a note
written then. The installer found the per-user copy already on the machine and
reported it as a reinstall/upgrade. The install page ran for 18,639 ms between
**Installing** and **Completing Kryvex Setup**, the whole capture took 28,593
ms, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The lifecycle audit is a heuristic over handler bodies, not a parser: a read
  hidden behind a helper function is still possible.
- The Portable close was checked by window, process list and duration rather
  than a numeric exit code: PowerShell reports `ExitCode` only for a process it
  started, and the portable launcher spawns the app as a child. An installed
  0.8.1 build was not driven through the in-app self-update either; that path is
  covered by the live feed comparison above.
- A close while a media-permission prompt is on screen was not staged, so the
  broker's teardown path is covered by the guard and the type checker rather
  than by a click-through.
- Everything from 0.8.0 still applies: a model file needs a llama.cpp binary the
  user supplies, filter rules depend on the upstream engine, and fingerprint
  farbling is a preload wrapper rather than a Chromium patch.
