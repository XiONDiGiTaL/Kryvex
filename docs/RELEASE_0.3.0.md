# Kryvex 0.3.0: Windows release

Released 2026-10-19. This release adds visible, click-first navigation for
people who do not use keyboard shortcuts, improves the About credits, and
produces a standard Windows installer.

Download the installer, portable build and checksum list from the
[Kryvex 0.3.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.3.0).

## Highlights

- **Header quick access:** Add, Settings and Help buttons are always visible.
- **Home common actions:** four clickable cards for adding a service, browsing
  modules, opening the browser and opening settings.
- **Quick help:** a clickable dialog with four actions and an optional shortcut
  reference. Open it with the **Help** button or `#/home?help=1`.
- **Accessible About:** the **DEVELOPERS** row links
  [XiONDiGiTaL](https://github.com/XiONDiGiTaL) and
  [player529](https://github.com/player529).
- **Brand:** the fictional element designation is `x529` throughout the app,
  tile, banner and documentation.

## Artifacts

Attached to the GitHub release and built locally under `release/` (ignored by
Git):

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Kryvex-Setup-0.3.0-x64.exe` | 108 MiB | `e015dc3ec5cfec64cc8a154ae9c6ac54769c4c0227aae6910d4068ff7196a434` |
| `Kryvex-Portable-0.3.0-x64.exe` | 108 MiB | `c4e6941b1252aa82565a536ddf674804340d64b5385b52235bf0f34a953c2076` |

Checksums are also written to `release/SHA256SUMS.txt`.

## Install

1. Run `Kryvex-Setup-0.3.0-x64.exe`.
2. Accept the default per-user location or choose another folder. A protected
   folder prompts for administrator approval; the default folder does not.
3. The installer creates a Desktop shortcut, a Start Menu shortcut, and an
   uninstall entry under **Settings → Apps → Installed apps**.
4. Launch Kryvex and finish the wizard.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\kryvex`.

## Verification performed

- `pnpm typecheck`: exit 0.
- `pnpm test`: exit 0, 40/40 tests.
- `pnpm build`: exit 0.
- `pnpm capture`: exit 0, thirteen 1440×900 screenshots including `help.png`.
- Offscreen click probes: header Add/Settings/Help and Home common actions
  reached the expected dialogs and routes.
- Setup EXE: silent install to a custom temporary directory exited 0; the
  installed `Kryvex.exe` launched and completed all thirteen capture routes.
- Portable EXE: launched directly and completed all thirteen capture routes.
- Shortcuts: Desktop and Start Menu entries were created and removed by the
  uninstaller.
- Uninstaller: silent uninstall exited 0 and removed the install directory,
  shortcuts and uninstall registry entry.
- Authenticode: both EXEs report `NotSigned`.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. `node scripts/verify-self-update.cjs --no-app --wizard --archive
--installer <the published setup> --version 0.3.0` reads them from the
dialog's own controls; the capture is committed with this record:
[capture.md](media/releases/0.3.0-wizard/capture.md), 4 pages and exit code 0.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.3.0-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.3.0" |
| 2 | [Choose Install Location](media/releases/0.3.0-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 381.8 MB"; "Space available: 54.2 GB" |
| 3 | [Installing](media/releases/0.3.0-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.3.0" |
| 4 | [Completing Kryvex Setup](media/releases/0.3.0-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

0.3.0 shipped before a wizard capture became part of a release cut, so this
capture was recorded on 2026-10-27 from the installer that was actually
published for this version (`Kryvex-Setup-0.3.0-x64.exe`, SHA-256
`e015dc3ec5cfec64cc8a154ae9c6ac54769c4c0227aae6910d4068ff7196a434`) rather than
at release time: it is a replay of what that installer displayed, not a note
written then. The installer found the per-user copy already on the machine and
reported it as a reinstall/upgrade. The install page ran for 15,418 ms between
**Installing** and **Completing Kryvex Setup**, the whole capture took 25,188
ms, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an
  unknown publisher; no code-signing certificate is configured.
- The interactive wizard was configured and silently exercised, but was not
  clicked through manually.
- Auto-update is not configured.
- Windows x64 only in this release.
