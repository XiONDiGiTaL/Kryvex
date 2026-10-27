# Kryvex 0.9.4-hotfix.3: one-click Whisper for Lexium

Prepared 2026-10-26 for the `v0.9.4-hotfix.3` tag. This is a fix batch, so the
version line stays at **0.9.4** and the build wears the `-hotfix.3` suffix
([UPDATES.md](UPDATES.md)). 0.9.5 is still not cut. Everything in 0.9.4,
0.9.4-hotfix.1, 0.9.4-hotfix.2 and 0.9.4-hotfix.3 is included.

One reported failure is addressed, and the wall it ran into.

- **A Turkish voice note of a song was transcribed into English that was not in
  the recording.** **Use this PC** ran the recogniser Windows ships through
  `System.Speech`, which is a *dictation* engine for clear speech: given singing
  or a strong accent it answers with confident words that were never spoken. That
  is a limitation of the engine, not a setting, so the fix is not another
  warning — it is a real Whisper model, one click away.
- **Transcription was a dead end for a first-time user.** Lexium has always been
  a client for engines you run, so the first attempt ended on "nothing answered"
  with a command to copy and no model to point it at. The setup panel now opens
  on **Whisper on this machine**: **Download and start** fetches the pinned
  whisper.cpp server and one pinned multilingual model into app data, verifies
  both against their SHA-256, unpacks the archive and runs the server on
  loopback, then points Lexium at it. The three manual server options stay for
  anyone who already runs one.

## What changed

- **The pinned artifacts (`electron/speech-catalogue.ts`).** The
  `whisper-server` build is `whisper-bin-x64.zip` from `ggml-org/whisper.cpp`
  release `b5454` — 8,928,640 bytes, SHA-256
  `6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`, which is
  GitHub's own asset digest and was re-hashed from the downloaded archive. The
  models are the canonical GGML conversions in `ggerganov/whisper.cpp` on Hugging
  Face, each measured from a real download: `ggml-tiny.bin` 77,691,713 B
  `be07e048…c6e1b21`, `ggml-base.bin` 147,951,465 B `60ed5bc3…5fba2efe`
  (the default), `ggml-small.bin` 487,601,967 B `1be3a9b2…ffea987b`. The file
  names are the multilingual conversions, never the `*.en` variants: an
  English-only model answered with fluent English is the exact failure this
  batch exists to remove.
- **The rules (`electron/speech-runtime-rules.ts`).** Pure and testable: the
  layout under `<userData>/speech`, the model-id and catalogue validation, the
  archive rule that flattens only `Release/*.exe` and `Release/*.dll` (no nested
  paths, no device names, no control characters), the loopback argument list
  (`--host 127.0.0.1`, chosen port, half the cores capped at eight) and the
  progress percentage. The download-host policy is not duplicated: a build or a
  model is checked against `parseModelUrl` from `model-rules.ts`.
- **The verified transfer (`electron/artifact-download.ts`).** One streamed
  download into `<target>.part`, re-read and hashed, with the size and SHA-256
  compared before the caller may rename it into place. It reuses the redirect and
  host allowlist the model manager already uses, so a changed upstream file fails
  the check instead of being installed.
- **The runtime (`electron/speech-runtime.ts`).** Install, start, stop, remove and
  cleanup around the child process. The archive is unpacked with the app's own
  hardened ZIP reader (`electron/zip-extract.ts`), staged and then moved so a
  half-unpacked `bin` can never look like a working build; the partial, the
  archive and the staging folder are removed on success *and* on failure. The
  server prefers port 8129, falls back to an OS-assigned port when it is taken,
  is bound to loopback only, and is killed on stop and on quit. This module
  imports no Electron — it takes its root directory and a progress callback — so
  the whole path runs, and is tested, from a plain Node script.
- **Narrow IPC (`electron/main.ts`, `electron/preload.ts`, `electron/types.ts`,
  `src/types.ts`).** Six handlers (`speech:status`, `install`, `start`, `stop`,
  `remove`, `cancel`), each validated with `isShellSender`; an untrusted sender
  only ever gets the status back. The renderer names a model id from the reviewed
  catalogue and nothing else — no URL, host or path crosses the boundary — and
  progress is pushed to the shell rather than polled.
- **The panel (`src/components/LexiumLocalEngine.tsx`,
  `src/components/LexiumServerSetup.tsx`, `src/views/Lexium.tsx`,
  `src/styles-tools.css`).** A card above the manual options: model picker with
  sizes, **Download and start**, **Start the engine**, **Stop the engine**,
  **Use this engine**, **Cancel** during a download, a download progress bar,
  the installed models with a **Remove** button, the licence line, and the
  server's own last lines of output behind a disclosure when it fails. When the
  server comes up, Lexium selects it and says so; failures arrive as ids and are
  written as sentences in the reader's language.
- **New strings, four languages.** Thirty-eight strings in
  `src/lib/i18n-speech.ts` (es/de/fr) with Turkish in `src/lib/i18n-tr.ts`, and
  the ratchet in `tests/i18n-coverage.test.ts` extended to cover every one of
  them.
- **Two new harnesses.** `scripts/verify-speech-runtime.cjs`
  (`pnpm verify:speech`) runs the real install, start, transcription, stop and
  removal on this machine; `scripts/verify-speech-bridge.cjs`
  (`pnpm verify:speech-bridge`) drives the built app and downloads nothing.
- **Version 0.9.4-hotfix.3.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.4-hotfix.3-v1`) move together. The installed
  `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.9.4.0` /
  `FileVersion 0.9.4-hotfix.3`.

## Artifacts

Built by the Release workflow on the `v0.9.4-hotfix.3` tag (`windows-latest`,
Node 22, pnpm 10) and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.4-hotfix.3):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-hotfix.3-x64.exe` | see the follow-up commit | recorded after the run |
| `Kryvex-Portable-0.9.4-hotfix.3-x64.exe` | see the follow-up commit | recorded after the run |

The pair was built from this working tree with `pnpm package:win` (Electron
44.9.3, x64) and the wizard capture below was taken from that local installer; the digest table is filled in by the follow-up commit once the
tag run has uploaded its own files, because the workflow builds the artifacts it
publishes. `SHA256SUMS.txt` carries the published pair and matches the uploaded
binaries. No model weights are bundled. Both EXEs are **unsigned**.

**Web client.** The same tag rebuilds and force-pushes `gh-pages`, so the
published worker names `kryvex-web-0.9.4-hotfix.3-v1` and the site reports the
version of this release.

## Install

1. Run `Kryvex-Setup-0.9.4-hotfix.3-x64.exe`, or update an installed 0.9.4
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. If Kryvex is running, setup asks to close it first;
   shortcuts stay and the profile in `%APPDATA%\Kryvex` is untouched, so services
   stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/`.
- `pnpm test`: **913/913** across 83 files, including the new
  `tests/speech-runtime.test.ts` (the reviewed pins validate, a host that left
  the allowlist is refused, a plain-http artifact is refused, an English-only
  model is refused, a pinned URL that points at another file is refused, the
  archive rule rejects nested and reserved names, the argv is always loopback)
  and the extended `tests/i18n-coverage.test.ts`.
- `pnpm verify:speech`: **PASS**, on the real network, disk and CPU with the
  default `base` model. The pinned build and model downloaded and were verified;
  the model *on disk* was re-hashed and matched the pin; no partial, archive or
  staging file was left behind; the server started on `http://127.0.0.1:8129` and
  answered its own page with HTTP 200; a phrase synthesised with the Windows
  speech stack transcribed through the same proxy the renderer calls as "The
  quick brown fox jumps over the lazy dog." with one timed segment (0s → 2.72s),
  so `.srt` export has content; `language: auto` detected English; a Turkish
  request was accepted and reported as Turkish; an empty upload was refused; a
  model in use could not be removed; the listener was gone after stop, and a
  removed model could not be started again.
- `pnpm verify:speech-bridge`: **PASS**, driving the built app in a disposable
  profile and downloading nothing — the shell exposes the bridge, the reviewed
  catalogue arrives intact (`tiny,base,small`), an id outside it is refused
  before anything is fetched, Lexium renders the card with its heading, its three
  models and its **Download and start** button, the panel's failure line reads in
  the user's language, and merely opening the panel installs nothing.
- `pnpm audit:i18n`: **No hardcoded UI strings found in 52 renderer files.**
- `pnpm build`: exit 0. `pnpm build:web`: **PASS** (1.8 MiB) with
  `scripts/check-web-build.cjs` reporting the shell, companion and worker, and
  the worker naming `kryvex-web-0.9.4-hotfix.3-v1`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.4-hotfix.3-x64.exe`: **PASS** — four pages captured,
  the installer exited 0, and the capture was archived under
  `docs/media/releases/0.9.4-hotfix.3-wizard/`.
- `pnpm release:check`: PASS for 0.9.4-hotfix.3.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record: [capture.md](media/releases/0.9.4-hotfix.3-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.4-hotfix.3-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.4-hotfix.3" |
| 2 | [Choose Install Location](media/releases/0.9.4-hotfix.3-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 466.2 MB"; "Space available: 47.2 GB" |
| 3 | [Installing](media/releases/0.9.4-hotfix.3-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.4-hotfix.3" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.4-hotfix.3-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 19,676 ms between **Installing** and **Completing Kryvex
Setup**, and the installer exited 0. The wizard found no running copy to close
first, so the capture has the four pages above rather than the five a stopped
install produces. The locally built pair used for it was 134,397,182 B
(`9de46096…d48016860ca` Setup) and 134,160,033 B (`b6dd06cd…4d1af58a7b84d`
Portable); those are not the published files, and the table under **Artifacts**
is the one to check a download against.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **The one-click engine is Windows x64 only**, because that is the release build
  that was measured. The web client and other platforms keep the three manual
  server options, and the card says so rather than offering a button that cannot
  work.
- **The button was not clicked inside the UI harness.** That harness would have
  to download 148 MB as a side effect of a UI test, so the installer path is
  covered by `pnpm verify:speech`, which calls the same main-process functions the
  button does. The card's own rendering, the bridge and the refusal of an unknown
  model id *are* covered in the app.
- **`small` was verified as a pinned, validated entry and not transcribed**: it
  shares the path `tiny` and `base` take, and neither the download nor the model
  was run end to end for it.
- **The PC dictation engine is still reachable** and still answers in the wrong
  language for foreign audio; the panel points at Whisper instead of hiding the
  engine, because it is genuinely the fastest option for clear speech.
- The local server is a child of the app: it does not survive a quit and does not
  start with the app. Closing Kryvex releases port 8129.
