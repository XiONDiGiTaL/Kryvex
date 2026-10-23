# Wizard capture: Kryvex 0.8.4

Recorded 2026-10-22T06:43:05.607Z by `pnpm verify:self-update --wizard --archive`.

| Field | Value |
| --- | --- |
| Installer | `Kryvex-Setup-0.8.4-x64.exe` |
| Installer version | 0.8.4 |
| Pages | 5 |
| Exit code | 0 |
| Mode | started by the harness |

| # | Page | Text on the page |
| --- | --- | --- |
| 1 | [Choose Installation Options](pages/01-Choose%20Installation%20Options.png) | Who should this application be installed for? · Please select whether you wish to make this software available to all users or just yourself · There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade. |
| 2 | [Choose Install Location](pages/02-Choose%20Install%20Location.png) | Choose the folder in which to install Kryvex. · Setup will install Kryvex in the following folder. To install in a different folder, click Browse and select another folder. Click Install to start the installation. · Space required: 367.7 MB |
| 3 | [Installing](pages/03-Installing.png) | Please wait while Kryvex is being installed. · Kryvex 0.8.4 |
| 4 | [Installation Complete](pages/04-Installation%20Complete.png) | Setup was completed successfully. · Kryvex 0.8.4 |
| 5 | [Completing Kryvex Setup](pages/05-Completing%20Kryvex%20Setup.png) | Kryvex has been installed on your computer. Click Finish to close Setup. |

The wizard is a native Windows dialog, so these pages cannot appear in a CDP
screenshot of the shell. They are read from the dialog's own controls in visual
order, and the installer's exit code comes from a process handle opened while it
was alive.

## Checks from the run

- PASS the wizard showed more than one page, 5 pages: Choose Installation Options → Choose Install Location → Installing → Installation Complete → Completing Kryvex Setup
- PASS the installer exited 0: exit code 0
- PASS the wizard opened an install progress page: "Installing"
- PASS the install page ran instead of being skipped: 19836 ms between "Installing" and "Installation Complete"
- PASS the wizard reached its finish page: "Installation Complete"
- PASS every page was photographed: 5/5 pages
