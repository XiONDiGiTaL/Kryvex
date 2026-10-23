# Kryvex 0.8.8: Windows release

Published 2026-10-23 from the `v0.8.8` tag. This release bundles the llama.cpp
runtime with the app, turns the Home board into a rearrangeable widget board,
adds volume and repeat controls to the service dock, and adds an opt-in Spotify
ad guard. Everything in 0.8.7 is included.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.8 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.8).

## What changed

- **Vexium ships its runtime.** The installer now carries the pinned llama.cpp
  CPU runtime `b11835` under `resources/bin`, with its MIT and OpenMP licence
  files. A reviewed GGUF model can be started without installing llama.cpp
  first, and a user-supplied runtime still takes precedence. The runtime is
  fetched at package time by `scripts/fetch-runtime.mjs`, pinned by release
  tag, byte size and SHA-256, and is never fetched at launch. Details:
  [VEXIUM_MODELS.md](VEXIUM_MODELS.md).
- **Weights stay separate.** The installer does not contain a model. The
  reviewed Qwen2.5-1.5B starter is still an explicit download in **Settings →
  Vexium → Download models**, with its publisher, revision, size, SHA-256,
  licence and memory estimate shown first. The download is verified before it
  is registered, and inference remains bound to `127.0.0.1`.
- **The Home board is a widget board.** Weather, Wellness, sticky notes and the
  board guide are entries in one small registry. The Widgets picker shows or
  hides each card, moves it up or down inside its column, and switches it
  between the main and side columns. The order survives a restart, and the
  guide column collapses when it has no card. The pure rules live in
  `src/lib/home-widgets.ts` and are covered by `tests/home-widgets.test.ts`.
- **The service dock gained playback controls.** A volume slider applies to
  media a service page owns, and a repeat toggle loops the page's own clip when
  it ends. Both start unset, so a page keeps its own volume and looping until
  the user touches them.
- **Spotify ads can be muted, opt-in.** A **Service playback** switch mutes the
  Spotify module while its own player labels an ad, then restores the module's
  previous mute state. On a track, album or playlist page it can press
  Spotify's own Skip ad control, or Next, at most once every twenty seconds. A
  podcast or an unclear page is never advanced past the episode; an
  unskippable ad stays. It reads the page and changes no account, cookie or
  request. Detection depends on Spotify's labels, so an unlabelled host-read
  segment is left alone. Details:
  [SERVICE_UX.md](SERVICE_UX.md).
- **Documentation and copy.** The README, status record and docs use a
  consistent punctuation style, and the new Pro pilot document records an
  on-hold proposal only. No cloud account, payment flow or hosted service is
  part of this release or changes existing behaviour.

## Artifacts

Built locally before the tag with `electron-builder --publish never
--config.electronDist=node_modules/electron/dist`:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.8-x64.exe` | 134,326,914 B (128.10 MiB) | `66d7eff545fbeac377dad29874307dcd776c7399e352d46ec423052a710dea98` |
| `Kryvex-Portable-0.8.8-x64.exe` | 134,089,702 B (127.87 MiB) | `47d6103204d42980558f6e24fd8d2d4e9971e7ebf1688ca6703b34d50c087138` |

`SHA256SUMS.txt` carries both digests. The updater ignores a release whose
installer has no matching entry. Both EXEs are **unsigned**. The tag workflow
rebuilds the artifacts on GitHub Actions; its published digests are recorded
after the release run.

The packaged tree is about 467 MB, including 44 MB of runtime DLLs. The
installer wizard reports **Space required: 465.6 MB**.

## Install

1. Run `Kryvex-Setup-0.8.8-x64.exe`, or let an installed 0.8.7 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay.
3. The Portable EXE runs without installing. Its state still lives in
   `%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npm test`: exit 0, **547/547** tests across 52 files, including the new
  Home-widget and Spotify-rule suites.
- `npm run audit:i18n`: clean; no hardcoded UI strings in 36 renderer files.
- `git diff --check`: clean.
- `npm run build`: exit 0 before packaging.
- Local packaging produced both 0.8.8 EXEs. `release/win-unpacked/Kryvex.exe`
  reports `ProductVersion 0.8.8.0` and contains
  `resources/bin/llama-server.exe` with `runtime.json` naming `b11835`.
- The **packaged app** was launched with a disposable profile and the real
  Qwen model from `X:\KryvexData\models`. `appInfo()` returned
  `{version: "0.8.8", packaged: true, electron: "44.9.3",
  chrome: "152.0.7977.167"}`. `modelConfigure` selected
  `release\win-unpacked\resources\bin\llama-server.exe`, reported
  `bundled: true`, `runtimeVersion: "b11835"` and `binaryFound: true`.
  `modelStart` reached `running`, `/v1/models` answered, a chat request
  returned `{ok: true}`, and `modelStop` returned `{phase: "stopped"}`.
- `node scripts/verify-self-update.cjs --installer
  release/Kryvex-Setup-0.8.8-x64.exe --no-app --archive --version 0.8.8`:
  PASS. The wizard showed four pages, the install page ran for 25,923 ms, the
  installer exited 0, and the installed `C:\Kryvex\Kryvex.exe` reports
  `ProductVersion 0.8.8.0`.
- `node scripts/check-release-record.cjs`: PASS for 0.8.8.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. The capture comes from the locally built 0.8.8 installer before the
tag, and is committed with this record:
[capture.md](media/releases/0.8.8-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.8-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.8.8-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.6 MB" |
| 3 | [Installing](media/releases/0.8.8-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.8.8" |
| 4 | [Completing Kryvex Setup](media/releases/0.8.8-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The run took 36,668 ms end to end, the install page ran for 25,923 ms, and the
installer exited 0. The installed `C:\Kryvex\Kryvex.exe` now reports
`ProductVersion 0.8.8.0`.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an
  unknown publisher.
- The bundled runtime is **CPU-only** and x64. GPU acceleration needs a runtime
  the user supplies; Kryvex still prefers that choice when it is set.
- No model weights are bundled. A model download is a separate, explicit
  action and needs its own disk space and the pinned artifact's hash to match.
- Spotify ad handling is best effort and depends on the player's own labels.
  Unlabelled host-read segments and unskippable ads still play; no account,
  cookie or network request is changed or bypassed.
- Windows only; no macOS or Linux build is produced by this release.
- The Pro pilot in `PRO_PILOT_PLAN.md` is a proposal only. No account,
  payment, backup service or Cloudflare resource is created or enabled here.
