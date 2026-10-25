# Kryvex 0.9.3: Windows release

Prepared 2026-10-25 for the `v0.9.3` tag. This is a correction release for the
one thing the 0.9.2 verification caught in the installed build after the tag had
gone out: the Vexium Core card's single button told a machine that already held
the 3B core it was "Downloading 0%" while it was only starting a server. Nothing
else changes, and everything in 0.9.2 is included.

The assets are built on this machine by `pnpm package:win` and are attached to
the published
[Kryvex 0.9.3 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.3)
by the tag-triggered workflow. This record and its wizard capture were committed
before the tag, so the workflow had both to check (`pnpm release:check`).

## What changed

- **The core button names the job it is doing.** A press on the Vexium card is
  either a download of the reviewed 3B or a reconfigure of the runtime at a file
  already on disk, and only the first is a download. `coreBusyState()` in
  `src/lib/vexium-core.ts` now decides the busy label from the press itself
  rather than from `needsDownload`, so the switch path reads **Vexium Core is
  starting…** instead of **Downloading 0%** for the few seconds the server takes
  to answer. The install path still reads **Downloading n%** and then
  **Verifying the download…**. UI: `src/views/Assistant.tsx`. Tests:
  `tests/assistant.test.ts` (install keeps its percentage, activation starts, a
  verifying download outranks both).
- **The record now describes both upgrade paths as they behave.** With no 3B on
  disk the button is **Install Vexium Core 3B · 1.96 GiB**; **Switch to Vexium
  Core 3B** only appears once the file is present, and the press then downloads
  nothing. Corrected in [ASSISTANT.md](ASSISTANT.md), in the 0.9.2 record and in
  the two-phase measurement in [TESTING.md](TESTING.md).
- **Version 0.9.3.** `package.json`, the packaged `ProductVersion` and the web
  worker's cache name (`kryvex-web-0.9.3-v1`) all move together.

The code fix is commit `373566e`, measured on the installed 0.9.2 before this
cut: Light → 3B downloaded, verified and started in 27.0 s from the button
**Install Vexium Core 3B · 1.96 GiB**, and the switch path reconfigured and
started the 3B in 3.2 s with no download once its label was fixed. The full
two-phase run reports `SWITCH VERIFICATION: PASS`.

## Artifacts

Built locally by `pnpm package:win` from the working tree at `373566e` plus the
version bump (no EPERM on `release/win-unpacked`), then installed in place by the
wizard capture below:

| File | Local size | Local SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.3-x64.exe` | 134,314,523 B (128.09 MiB) | `7b4cb8c81c57bf0a3361358227969db3b92f3809e29ee8d9ca11322dc6c95400` |
| `Kryvex-Portable-0.9.3-x64.exe` | 134,077,378 B (127.87 MiB) | `15cd66772fcccb2c70f0090a32bbe92abdeebf7a2da649991af0fcf7e8b36be0` |

`release/win-unpacked/Kryvex.exe` reports `ProductVersion 0.9.3.0`, the packaged
renderer bundle carries `Vexium Core is starting…`, and the build log records no
EPERM. The published pair is built on `windows-latest` by the workflow from the
same sources; its byte counts and digests do not exist until that run finishes,
so they are recorded in a follow-up commit rather than here. The two pairs differ
only by the build environment. Both EXEs are **unsigned**, and the updater
ignores a release whose installer has no matching `SHA256SUMS.txt` entry. No
model weights are bundled: the 2.1 GB core is fetched once, on the user's press,
from the Vexium Core release.

## Install

1. Run `Kryvex-Setup-0.9.3-x64.exe`, or let an installed 0.9.2 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in.
3. Open **Vexium**. A machine without the 3B offers **Install Vexium Core 3B ·
   1.96 GiB**; a machine that already holds it offers **Switch to Vexium Core
   3B**, which starts the server and says so.
4. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npx vitest run`: exit 0, **704/704** tests across 67 files, including the new
  busy-label cases in `tests/assistant.test.ts` and the translation ratchet,
  which needed no new entries because the label already exists in all four
  languages.
- `pnpm package:win`: exit 0, producing the pair above with no EPERM on
  `release/win-unpacked`; `release/win-unpacked/Kryvex.exe` reads `0.9.3.0`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.3-x64.exe --version 0.9.3`: PASS — five pages
  captured, the install page ran for 19,685 ms, the installer exited 0, the
  capture was archived under `docs/media/releases/0.9.3-wizard/`, and the
  installed `C:\Kryvex\Kryvex.exe` now reports `ProductVersion 0.9.3.0`.
- `pnpm release:check`: PASS for 0.9.3.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built 0.9.3 installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.3-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.3-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.3" |
| 2 | [Choose Install Location](media/releases/0.9.3-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.8 MB" |
| 3 | [Installing](media/releases/0.9.3-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.3" |
| 4 | [Installation Complete](media/releases/0.9.3-wizard/pages/04-Installation%20Complete.png) | "Setup was completed successfully."; "Kryvex 0.9.3" |
| 5 | [Completing Kryvex Setup](media/releases/0.9.3-wizard/pages/05-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 19,685 ms between **Installing** and **Installation
Complete**, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- This release is one label and its documentation. The measured behaviour of the
  install and switch paths is unchanged from 0.9.2; the fix is what the button
  says while activation runs.
- The published web bundle on `gh-pages` still reports **v0.9.2** and caches
  under `kryvex-web-0.9.2-v1`. The 0.9.3 `sw.js` cache name is in the repository
  and takes effect at the next `gh-pages` build, which this cut does not publish.
- Google still decides the account step, unchanged from 0.9.0; the service view
  offers **Reset session & retry** and **Open externally**.
- A 3B model is still a small model. It is given deterministic tools for maths,
  units, distance and dates and refuses to claim it browsed, but it should not be
  trusted for current facts or for advice.
- The bundled runtime is **CPU-only** and x64.
