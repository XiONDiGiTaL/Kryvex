# Kryvex 0.8.5: Windows release

Published 2026-10-22 from the `v0.8.5` tag. This release adds the first two
in-house tools to **Services → Secret services** (Lexium and the media player)
and gives the emulator the same periodic-table tile as its neighbours.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.5 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.5).

## What changed

- **Lexium (Lx · x530).** A real client for engines you run instead of a chat
  wrapper: **Transcribe** decodes an imported recording, sends 16 kHz mono WAV
  to a local-whisper, whisper.cpp or OpenAI-compatible server, and returns an
  editable transcript with timed segments and `.txt`/`.srt` export;
  **Translate** posts to a LibreTranslate server with a labelled keyless
  fallback; **From image** reads text through Tesseract in the renderer, so the
  image never leaves the device. Nothing is written to disk after you leave the
  page. Setup and limits: [LEXIUM.md](LEXIUM.md).
- **Media player (Mx · x531).** Queues local audio and video or direct media
  links, with play/pause, previous/next, repeat off/all/one, shuffle, seek, mute
  and volume, plus a docked transport above the status bar. Platform pages
  (YouTube, Spotify, Twitch, SoundCloud, Vimeo) are recognised and handed to the
  browser module instead of being forced through an `<audio>` tag. Details:
  [PLAYER.md](PLAYER.md).
- **Playback survives navigation.** Chromium pauses a media element when it is
  removed from the document, so leaving the player page used to stop the track.
  The engine now lives in a permanent 1 px host that the page borrows, and a
  five-minute track kept advancing on Home while the dock stayed in its paused
  state. This is the one behavioural bug found while testing this batch.
- **One tile language for the secret services.** The three marks are now the
  same component (`ElementMark`): a number, a glyph, a symbol and a bracketed
  name. The emulator is **x532 / “8-bit”** with a gamepad glyph, and its old 3×3
  pixel screen is faded into the tile as a watermark behind the symbol. Its
  caption reads `[ Retro ]`: `[ Emulator ]` needed 55 px of the 46 px a 58 px
  card tile leaves and was cut to `[ Emulato…`, so the visible caption is the
  short word while the accessible name stays **Emulator**.
- **Five more service presets.** Twitch, TikTok, Facebook, SoundCloud and Vimeo
  join the catalogue. The three with autoplaying feeds (Twitch, TikTok,
  Facebook) default to **Start muted**, and a module can be muted from its
  header, so a feed cannot make noise until you unmute it.
- **An unset weather location stays unset.** `Number(null)` is `0`, so a
  profile without a saved location was asked for the weather at 0,0 and shown
  “local” weather for Null Island. Only a value the user actually saved can
  become a coordinate now, an inherited `0,0` with no city or place name reads
  as unset, and the same guard covers the main-process weather request.
- **New panels are translated.** Lexium, the player, the tile captions and the
  mute option carry English, Spanish, German and French strings;
  `pnpm audit:i18n` is clean over 30 renderer files.

Everything from 0.8.4 is included: Steam sessions that survive a restart, the
one-time-code relay, the Home board, the live resource monitor, VPN control,
regional search engines, Vexium, the emulator itself and the lifecycle guards.

## Artifacts

Built by the tag-triggered workflow (run
[39761506782](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/39761506782),
commit `4b382ce`) and attached to the published, stable
[v0.8.5 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.5):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.5-x64.exe` | 120,457,454 B (114.88 MiB) | `2e33e00edda119173556e890644c7e5997e468d349f5ca94a99a79baaaa337cb` |
| `Kryvex-Portable-0.8.5-x64.exe` | 120,220,324 B (114.65 MiB) | `1dbd21a5866e7cf61fc2e48feb4efc6826fb16f6c8a88ffdfa70242341557830` |

`SHA256SUMS.txt` (189 B) carries both digests: it is generated from the
published files by `scripts/release-checksums.cjs`, and the updater ignores a
release whose installer has no matching entry. The three files were downloaded
from the release page again, both EXEs report `ProductVersion 0.8.5`, and
`sha256sum -c SHA256SUMS.txt` verifies both. Both are **unsigned**.

### Build note (this machine only)

`pnpm` is not on `PATH` here, and electron-builder 26 detects the package
manager from the lock file, so a plain `pnpm run package:win` fails at
`PnpmNodeModulesCollector` (“No JSON content found”). The packaging for this
release used a temporary pnpm 10 shim on `PATH` plus
`--config.electronDist=<pre-extracted electron 44.2.0>`:

```bash
node -e "require('extract-zip')(zip,{dir:require('path').resolve('.tmp-electron-dist')})"
PATH="$PWD/.tmp-pnpm-bin:$PATH" npx electron-builder \
  --config.electronDist=.tmp-electron-dist --publish never
```

The `electronDist` route also avoids an `EPERM` rename of
`release/win-unpacked.tmp`, which failed three times on this drive. CI, which
installs pnpm, is unaffected and still runs the plain `pnpm package:win`.

## Install

1. Run `Kryvex-Setup-0.8.5-x64.exe`, or let an installed 0.8.4 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay.
3. The Portable EXE runs without installing. Its state still lives in
   `%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for renderer and `electron/` (strict).
- `npx vitest run`: exit 0, **390/390** tests across 40 files.
- `npm run build`: exit 0; renderer and main rebuilt before packaging.
- `npm run audit:i18n`, clean, no hardcoded UI strings in 30 renderer files.
- `npx electron-builder --publish never`: produced both 0.8.5 EXEs; the asar
  reports `0.8.5` and both EXEs report `ProductVersion 0.8.5`.
- `pnpm verify:self-update --installer release/Kryvex-Setup-0.8.5-x64.exe
  --no-app --wizard --archive --version 0.8.5`, PASS: five pages captured, the
  install page ran for 21,668 ms, the installer exited 0, and the capture was
  archived under `docs/media/releases/0.8.5-wizard/`.
- The installed `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.8.5.0`, and the
  uninstall entry reads **Kryvex 0.8.5**.
- A CDP harness launched that installed binary with an isolated profile:
  `window.kryvex.appInfo()` returned
  `{version: "0.8.5", electron: "44.2.0", chrome: "152.0.7977.76", node:
  "24.20.0", packaged: true}`. The Services page rendered all three marks
  (`x530 Lx`, `x531 Mx`, `x532 8-bit`), and `#/lexium` and `#/player` rendered
  their real pages.
- Measured in the built renderer through a CDP harness, not in source: the
  emulator caption is `[ Retro ]`, its box is 46.16 px inside a 58 px tile, and
  `scrollWidth === clientWidth === 46`, so nothing is cut. The accessible name
  is still `Emulator · element x532 · 8-bit`. The earlier `[ Emulator ]` caption
  overflowed that box and rendered as `[ Emulato…` in a 3× capture, which is why
  the caption changed.
- `node scripts/check-release-record.cjs`: PASS for 0.8.5.
- **Published artifacts.** The release workflow passed every step (tag/version
  check, release record, install, typecheck, 390 tests, the one-time-code relay,
  packaging, checksums) and published a stable, non-draft release with the
  Setup, Portable and `SHA256SUMS.txt` assets. The files were downloaded from
  `releases/download/v0.8.5/`, hashed locally and matched the published sizes
  and the checksum file.
- **Published build exercised, not just hashed.** The published Portable EXE was
  launched with `--remote-debugging-port` and an isolated profile:
  `window.kryvex.appInfo()` returned `{version: "0.8.5", electron: "44.2.0",
  chrome: "152.0.7977.76", node: "24.20.0", packaged: true}`, and the Services
  row reported `[ Retro ]` / `x532` / `8-bit` with
  `scrollWidth === clientWidth === 46` (nothing clipped). Capture:
  [screenshots/release-0.8.5-published-tile.png](../screenshots/release-0.8.5-published-tile.png).

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. The capture came from the locally built 0.8.5 installer before any
tag, and is committed with this record:
[capture.md](media/releases/0.8.5-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.5-wizard/pages/01-Choose%20Installation%20Options.png) | “Who should this application be installed for?”; “There is already a per-user installation.(C:\\Kryvex) Will reinstall/upgrade.” |
| 2 | [Choose Install Location](media/releases/0.8.5-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\\Kryvex`; “Space required: 421.8 MB” |
| 3 | [Installing](media/releases/0.8.5-wizard/pages/03-Installing.png) | “Please wait while Kryvex is being installed.”; “Kryvex 0.8.5” |
| 4 | [Installation Complete](media/releases/0.8.5-wizard/pages/04-Installation%20Complete.png) | “Setup was completed successfully.”; “Kryvex 0.8.5” |
| 5 | [Completing Kryvex Setup](media/releases/0.8.5-wizard/pages/05-Completing%20Kryvex%20Setup.png) | “Kryvex has been installed on your computer. Click Finish to close Setup.” |

The run took 31,907 ms end to end and the installer exited 0. Scripts that the
installer relaunched were closed by the harness afterwards, so the capture left
no stray instance.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The pilot install in `C:\Kryvex` came from the locally built installer, so it
  reports the same `0.8.5` and the updater rightly offers nothing. The published
  Setup was installed over it with `/S`, which replaced the files: the binary
  still reports `0.8.5.0`, Windows still lists **Kryvex 0.8.5**, and the tile
  now reads `[ Retro ]`.
- Lexium bundles no speech weights and no translation service. A transcript
  needs a Whisper-compatible server you run, and translation needs a
  LibreTranslate server or the keyless fallback. OCR is the only tab that works
  with nothing else installed.
- In the web client, an HTTPS page cannot call a plain `http://` engine on the
  LAN; only `localhost` is exempt. The desktop build is not affected.
- The emulator still depends on the EmulatorJS assets loading in its canvas and
  runs local ROM files only. Kryvex ships no ROMs and links to none.
- The player's queue is session-only by design: a reload cannot reopen a local
  file without asking again. Volume, repeat and shuffle are persisted.
- The CDP harness recorded one Electron console message while driving the
  installed build: `sandboxed_renderer.bundle.js script failed to run` /
  `Cannot destructure property 'preloadScripts' of 'binding.startupData'`. It
  appears with the harness attached, no view fails to render, `window.kryvex`
  works, and this batch touches no preload, webview or sandbox code. It is
  reported here rather than claimed clean.
- No real Google, Steam or Discord sign-in was performed for this build, and the
  emulator, Rooms screen share, torrents and VPN were not re-exercised beyond
  the 0.8.4 passes; this batch changed no code in those paths.
- macOS and Linux were not exercised.
