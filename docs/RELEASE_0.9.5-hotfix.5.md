# Kryvex 0.9.5-hotfix.5: emulator folders, an honest model list, and windows you can actually move

Prepared 2026-10-28 for the `v0.9.5-hotfix.5` tag. This is a fix batch, so the
version line stays at **0.9.5** and the build wears the `-hotfix.5` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.4 is
included.

**Why not `0.9.5.1`.** `electron-builder` validates `package.json`'s `version` as
strict semver and refuses a fourth component before it packages anything, and npm
rejects the same string. `compareVersions()` in `electron/update-rules.ts` ranks
`0.9.5-hotfix.5` **above** `0.9.5-hotfix.4`, so an installed copy is offered this
patch.

This batch answers five reports and finishes one thing the emulator page was
missing.

- **The emulator can read a folder instead of one file at a time.** A picked
  folder is listed once, classified by the core that would open each file, and
  browsable; a BIOS folder offers only the names the selected console's core
  reads.
- **The Vexium panel stops claiming every artifact lives on Hugging Face.** The
  source line is read from the URL the downloader will actually fetch, so
  `github.com/XiONDiGiTaL/Vexium-Core · release asset` and
  `huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF` are no longer printed as the
  same thing.
- **The installed-model list folds, and the model in use is the one on top.**
  Pressing *Use this model* swaps that card to the lead position and marks it, so
  the button can no longer be pressed forever.
- **A screen share no longer doubles its own audio.** Monitoring now follows the
  source: off for a screen or window share, on for an app share, where Chromium
  mutes the captured `<webview>`.
- **A secret service and Rooms are both real windows on the Workspace**, and a
  popped-out room carries its own *Bring it back* — including when it is
  maximized, which is when the button behind it could not be reached.

## What changed

- **Cartridge and BIOS folders (`electron/emulator-library.ts`,
  `src/lib/emulator-folders.ts`, `src/views/Emulator.tsx`,
  `electron/main.ts`, `electron/preload.ts`, `electron/types.ts`,
  `src/types.ts`, `src/styles-emulator.css`, `tests/emulator-folders.test.ts`).**
  `EmulatorLibrary` opens a native dialog, lists the files in the chosen folder
  and reads one file back on request. Nothing is copied, indexed or uploaded, and
  `isInsideFolder` refuses any path that resolves outside a folder that was
  picked, so the renderer cannot turn a listing into a general file reader; the
  IPC handler additionally requires the shell as its sender, so a service
  `<webview>` cannot call it. `src/lib/emulator-folders.ts` is the classifier: a
  file becomes a game only when an offered core claims its extension (and the
  second engine's formats stay out of the list while that engine is off), and a
  BIOS file is offered only for the names its console's core reads — a renamed
  dump is refused rather than loaded into the wrong slot. The loaded bytes go
  through the same validation, header sniffing and console choice as a file
  dropped on the slot. The web build has no bridge, so the panel says folders are
  a desktop feature instead of showing a button that cannot work.
- **The model panel says where the bytes come from (`src/lib/local-models.ts`,
  `electron/model-rules.ts`, `electron/model-download.ts`,
  `src/components/ModelManager.tsx`, `tests/model-rules.test.ts`).**
  `modelSource()` parses the URL the downloader resolves (`sourceUrl`, never
  authored in the catalogue and never trusted on the way back in) and the card
  names that host with the repository. Vexium Core and Vexium Core Light keep
  their real upstream repository in the architecture row — they are Qwen2.5
  weights Kryvex republishes — but the source row now reads the GitHub release
  they are actually fetched from, and the note above the list says so.
- **A fold for the installed list, and a lead card (`src/lib/local-models.ts`,
  `src/components/ModelManager.tsx`, `src/styles-tools.css`).** `orderCatalogue()`
  puts the model in use first, then the default core, then catalogue order; the
  rest sit behind *Other models* (count in the header), closed by default, so a
  long list no longer pushes the panel off the screen. The runtime's model wears
  an **In use** state and a disabled ✓ button instead of an identical *Use this
  model*, and the two pending/ready states are distinct.
- **Share audio follows the source (`src/lib/party-rules.ts`,
  `src/views/Rooms.tsx`, `tests/party-rules.test.ts`, `docs/PARTY.md`).** A
  screen or window share captures the mix the sharer is already hearing, so
  monitoring it played every sound twice a few hundred milliseconds apart — the
  doubling that was reported. `monitorShareByDefault()` now returns false for
  those sources and true for an app share, and the checkbox stays for anyone who
  wants it. The silence case is documented rather than papered over: system audio
  comes from the OS loopback path, so a device held in exclusive mode (ASIO)
  yields a silent track, and Kryvex installs no driver, virtual device or Stereo
  Mix requirement — it captures, encodes with Opus and sends over the room's peer
  connection.
- **Services and rooms are windows you can drag (`src/lib/service-drag.ts`,
  `src/views/Workspace.tsx`, `src/components/ToolWindowBoard.tsx`,
  `src/views/Services.tsx`, `src/components/shell.tsx`, `src/App.tsx`).** A
  dropped secret service becomes the same resizable window a catalogue service
  becomes; a view drag type (`application/x-kryvex-view`) lets Rooms be dropped
  the same way, because a view has no URL, partition or card to reuse. A view
  window carries *Bring it back* on its own title bar, and maximizing no longer
  leaves the window without its controls.
- **Repository badges (`README.md`).** Stars, forks, downloads, latest release,
  last commit, contributors, open issues and repo size, with the stable/beta
  platform badges above them.
- **Translations.** Every new string lands in `es`, `de`, `fr` and `tr`, and the
  coverage ratchet in `tests/i18n-coverage.test.ts` holds the backlog.
- **Version 0.9.5-hotfix.5.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.5-hotfix.5-v1`) move together.
- **The window harness runs in CI (`scripts/verify-room-window.cjs`,
  `verify:room-window`, `scripts/verify-batch.cjs`).** It is in the `shell`
  batch, beside `verify:canvas`, so what it measures is no longer local-only.

## Artifacts

Built by the Release workflow on the `v0.9.5-hotfix.5` tag (`windows-latest`,
Node 22, pnpm 10) and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.5-hotfix.5):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.5-x64.exe` | recorded after the tag | recorded after the tag |
| `Kryvex-Portable-0.9.5-hotfix.5-x64.exe` | recorded after the tag | recorded after the tag |

`SHA256SUMS.txt` travels with them. **The digests above are filled in by the
follow-up commit that records the published assets**, the way 0.9.5-hotfix.4's
were: at the time this record was written the tag had not run, so the only
installers that existed were the locally built pair below. Both EXEs are
**unsigned**.

The locally built pair from this working tree (`pnpm package:win`, Electron
44.9.3, x64), used for the wizard capture and **not** one of the published files:

| File | Size |
| --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.5-x64.exe` | 137,369,465 B (131.01 MiB) |
| `Kryvex-Portable-0.9.5-hotfix.5-x64.exe` | 137,125,571 B (130.78 MiB) |

**Web client.** The same tag rebuilds and force-pushes `gh-pages`, so the
published worker at `https://xiondigital.net/Kryvex/sw.js` names
`kryvex-web-0.9.5-hotfix.5-v1` and the site reports this version.

## Install

1. Run `Kryvex-Setup-0.9.5-hotfix.5-x64.exe`, or update an installed 0.9.5
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. Shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/`.
- `pnpm test`: **1051/1051** across 92 files, including the new
  `tests/emulator-folders.test.ts` and the extended
  `tests/model-rules.test.ts` and `tests/party-rules.test.ts`.
- `pnpm audit:i18n`: no hardcoded UI strings in 57 renderer files.
- `pnpm package:win`: exit 0, producing the two installers sized above.
- `node scripts/verify-room-window.cjs` in the built app: **14 checks, PASS** —
  a secret-service card publishes a drag payload and lands as a window inside
  the canvas (`[499,214,893,612]` in `[296,130,1096,696]`) with resize edges; the
  Rooms entry publishes its own payload and opens as a room window; that window
  carries *Bring it back*; maximize fills the canvas with the controls still on
  screen and topmost; docking returns to `#/rooms` with the view drawn again; no
  page errors.
- The model panel was read from the built app over CDP: the lead card is Vexium
  Core with `Source: github.com/XiONDiGiTaL/Vexium-Core · release asset`, the
  fold holds the other two cards and is closed by default.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record:
[capture.md](media/releases/0.9.5-hotfix.5-wizard/capture.md).

Recorded 2026-10-28T13:59:34Z from the local installer of this working tree. The
wizard found the existing per-user installation in `C:\Kryvex` and upgraded it in
place.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.5-hotfix.5-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.9.5-hotfix.5-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 486.3 MB" |
| 3 | [Installing](media/releases/0.9.5-hotfix.5-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.5-hotfix.5" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.5-hotfix.5-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 69,104 ms between **Installing** and **Completing Kryvex
Setup**, all four pages were photographed, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **No ROM or BIOS file was opened from a folder.** This repository ships none,
  so the classifier is covered by unit tests and the picker by its own code path;
  what was exercised is the listing, the classification and the refusal rules,
  not a game booted out of a folder.
- **The folder list is a list.** There is no metadata, box art or LaunchBox-style
  shelf: it shows the file name and the console, nothing more.
- **RetroArch is still its own window.** Reparenting a native SDL window into
  Kryvex's tree needs a native addon per architecture and ABI, which changes
  packaging, signing and the update path; [EMULATOR_ENGINES.md](EMULATOR_ENGINES.md)
  records why that is a project of its own rather than a UI change.
- **The audio change is a default, not a measurement.** Doubling was explained
  from the capture paths and removed by following the source; no audio was
  recorded and compared, and the silent case on an exclusive-mode device was not
  reproduced on this machine.
- **Virtual LAN remains unshipped.** Room membership is still not an operating
  system tunnel; the address that travels with a room is displayed, never
  dialled.
