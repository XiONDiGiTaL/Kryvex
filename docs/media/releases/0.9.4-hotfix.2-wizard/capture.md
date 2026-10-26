# Wizard capture: Kryvex 0.9.4-hotfix.2

Recorded 2026-10-26T16:20:51.081Z by `node scripts/verify-self-update.cjs --no-app
--wizard --archive`.

| Field | Value |
| --- | --- |
| Installer | `Kryvex-Setup-0.9.4-hotfix.2-x64.exe` |
| Installer version | 0.9.4-hotfix.2 |
| Pages | 4 |
| Exit code | 0 |
| Mode | started by the harness |
| Run length | 43,029 ms |

| # | Page | Text on the page |
| --- | --- | --- |
| 1 | [Choose Installation Options](pages/01-Choose%20Installation%20Options.png) | Who should this application be installed for? · Please select whether you wish to make this software available to all users or just yourself · There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade. · Kryvex 0.9.4-hotfix.2 |
| 2 | [Choose Install Location](pages/02-Choose%20Install%20Location.png) | Choose the folder in which to install Kryvex. · Setup will install Kryvex in the following folder. To install in a different folder, click Browse and select another folder. Click Install to start the installation. · Space required: 466.1 MB · Space available: 46.4 GB · Kryvex 0.9.4-hotfix.2 |
| 3 | [Installing](pages/03-Installing.png) | Please wait while Kryvex is being installed. · Kryvex 0.9.4-hotfix.2 |
| 4 | [Completing Kryvex Setup](pages/04-Completing%20Kryvex%20Setup.png) | Kryvex has been installed on your computer. Click Finish to close Setup. |

The wizard is a native Windows dialog, so these pages cannot appear in a CDP
screenshot of the shell. They are read from the dialog's own controls in visual
order, and the installer's exit code comes from a process handle opened while it
was alive. This run has four pages rather than five because NSIS folded the
"Installation Complete" step into the progress page; the first attempt stalled on
the "Kryvex is running. Click OK to close it." prompt, the running app was closed,
and the capture was re-run.

## Checks from the run

- PASS the wizard showed more than one page, 4 pages: Choose Installation Options → Choose Install Location → Installing → Completing Kryvex Setup
- PASS the installer exited 0, exit code 0
- PASS the wizard opened an install progress page, "Installing"
- PASS the install page ran instead of being skipped, 26,684 ms between "Installing" and "Completing Kryvex Setup"
- PASS the wizard reached its finish page, "Completing Kryvex Setup"
- PASS every page was photographed, 4/4 pages
- PASS the capture was archived with the release record, `docs/media/releases/0.9.4-hotfix.2-wizard/`
