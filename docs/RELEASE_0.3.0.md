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

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an
  unknown publisher; no code-signing certificate is configured.
- The interactive wizard was configured and silently exercised, but was not
  clicked through manually.
- Auto-update is not configured.
- Windows x64 only in this release.
