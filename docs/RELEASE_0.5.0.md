# Kryvex 0.5.0: Windows release

Released 2026-10-19. This release makes the download location a first-class
setting and ships the complete 0.4.0 browser workspace with it.

Download the installer, portable build and checksum list from the
[Kryvex 0.5.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.5.0).

## Highlights

- **Choose the download folder:** **Settings → Data** shows the active folder
  and opens the native Windows folder picker from **Change folder**. The choice
  is persisted in `userData/kryvex-storage.json` and applied immediately.
- **Regular downloads and torrents share the setting:** downloads save directly
  into the selected folder; new torrents use its `Kryvex Torrents` subfolder.
- **One-click restore:** **Use the Downloads folder** returns to Electron's
  Downloads path when the location is not already the default.
- **Validated location:** the folder must be an absolute, writable directory.
  Relative paths, null bytes and oversized values are rejected; a damaged or
  hand-edited config falls back to the default instead of moving files
  silently.
- **Nothing gets stranded:** previously used download and torrent roots are
  retained (up to 12), so existing downloads and queue rows can still be
  opened, resumed, revealed or deleted after a change.
- **Localized UI:** the new controls, errors and toasts follow the system
  language or an explicit choice of English, Spanish, German or French.
- **Everything from 0.4.0 included:** browser library (downloads, history,
  bookmarks), restored tabs, find-in-page and zoom, privacy protections,
  microphone/camera prompts, the WebTorrent queue that restores
  paused, Chrome extension loading and Windows default-browser setup.

## Artifacts

Built with `pnpm run package:win` under `release/` (ignored by Git) and
attached to the GitHub release:

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Kryvex-Setup-0.5.0-x64.exe` | 114.5 MiB | `991be75a86fd2b9078f24e3dafbf293af783a91dffdf60f47388ad4252c63206` |
| `Kryvex-Portable-0.5.0-x64.exe` | 114.3 MiB | `42cc1530163f8a46aa9af1ac9dc9e161cca87086d20005b7a28c36a09dea89c8` |

The release checksum list is `SHA256SUMS.txt`.

## Install

1. Run `Kryvex-Setup-0.5.0-x64.exe`.
2. Choose the destination folder in the normal Windows wizard.
3. Launch Kryvex and open **Settings → Data** to choose where downloads go.
4. Use **Browser → Downloads / History / Bookmarks** for the browser library.
5. Open **Settings → Browser → Default browser** or the browser start page to
   register Kryvex and confirm it in Windows Default Apps.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

Built from the complete 0.5.0 working tree, then checked against the packaged
EXEs.

- `pnpm typecheck`: exit 0 for renderer and main.
- `pnpm test`: exit 0, **110/110** tests across 13 files.
- `pnpm build`: exit 0; 468.11 kB JS, 54.02 kB CSS.
- `pnpm capture`: exit 0; **seventeen** 1440×900 PNGs from the running window,
  including the new `settings-data` route.
- `pnpm verify:downloads`, pass; a completed file was written to a chosen
  folder, the location was changed again, the restored record was deleted with
  its file, and the location reset to Downloads.
- `pnpm verify:location-ui`, pass against the built app and against
  `release/win-unpacked/Kryvex.exe`; the Data row showed the seeded folder,
  offered Change folder and reset, and reset the live path and bridge value to
  the real Downloads folder.
- `pnpm verify:torrents`, pass; a `.torrent` and magnet survived a location
  change, restored paused in a fresh manager with no client, hydrated on
  Resume, transferred from a loopback peer, and deleted their folders and
  metadata. A magnet added after the change used the new torrent root.
- `pnpm verify:torrent-restore-ui`, pass; the Downloads hub rendered the
  restored row as **Paused** with **Resume**, no active speed and no peers.
- `pnpm verify:browser`, pass; find-in-page reported `1 of 3`, zoom reached
  110% and reset to 100%.
- `pnpm verify:restart`, pass; theme, start view and an open tab survived a
  close/relaunch, including a change made immediately before close, and a
  command-line URL joined the restored tab.
- `pnpm run package:win`, exit 0; produced the two artifacts and checksums
  above. Both EXEs report version `0.5.0`.
- **Installed and portable capture:** the silent custom-directory install, the
  installed EXE and the Portable EXE each completed all seventeen capture
  routes. The installed entry reads `Kryvex 0.5.0`.
- **Uninstaller:** silent uninstall exited 0 and removed the custom install
  directory, both shortcuts and the uninstall entry, and left no Kryvex
  process.
- **Checksums:** `sha256sum -c release/SHA256SUMS.txt` reports OK for both
  artifacts.
- **Authenticode:** both EXEs report `NotSigned`.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. `node scripts/verify-self-update.cjs --no-app --wizard --archive
--installer <the published setup> --version 0.5.0` reads them from the
dialog's own controls; the capture is committed with this record:
[capture.md](media/releases/0.5.0-wizard/capture.md), 4 pages and exit code 0.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.5.0-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.5.0" |
| 2 | [Choose Install Location](media/releases/0.5.0-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 420.4 MB"; "Space available: 50.4 GB" |
| 3 | [Installing](media/releases/0.5.0-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.5.0" |
| 4 | [Completing Kryvex Setup](media/releases/0.5.0-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

0.5.0 shipped before a wizard capture became part of a release cut, so this
capture was recorded on 2026-10-27 from the installer that was actually
published for this version (`Kryvex-Setup-0.5.0-x64.exe`, SHA-256
`991be75a86fd2b9078f24e3dafbf293af783a91dffdf60f47388ad4252c63206`) rather than
at release time: it is a replay of what that installer displayed, not a note
written then. The installer found the per-user copy already on the machine and
reported it as a reinstall/upgrade. The install page ran for 51,820 ms between
**Installing** and **Completing Kryvex Setup**, the whole capture took 64,785
ms, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an
  unknown publisher; no code-signing certificate is configured.
- Windows 10/11 requires the user's final confirmation in Default Apps. Kryvex
  cannot silently become the default browser.
- The native folder-picker dialog itself was not automated. Its selected path is
  normalised by the same tested `setDownloadLocation` function, and the UI
  harness verifies both display and reset against the live app.
- Torrents restore paused but there is no bandwidth scheduler, ratio limit,
  per-file selection or router port mapping.
- The interactive NSIS wizard was configured but the silent custom-folder path
  was the one exercised.
- Windows x64 only in this build. macOS and Linux were not exercised.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
- No auto-update or CI workflow is configured.
