# Kryvex 0.8.9: Windows release

Prepared 2026-10-23 for the `v0.8.9` tag. This release makes Vexium Core the
local assistant a profile actually uses: it starts with the app, the Vexium page
says what is installed and can start it, and a profile still saved on Ollama's
untouched default moves to the local stack once. It also brings Spotify and
YouTube playlists into the player, lets Google's own account pages see the
browser Kryvex really is, adds a calculator and a currency converter to the Home
board, and measures the starter model on the shipped runtime. Everything in
0.8.8 is included.

The assets are attached to the published, stable
[Kryvex 0.8.9 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.9).
This record and its wizard capture were committed before the tag, so the
release workflow had both to check (`pnpm release:check`).

## What changed

- **Vexium Core starts with Kryvex.** When the saved provider is `local`, a
  model file is already configured, and the local server is `stopped` or `idle`,
  the app starts the bundled runtime on launch and points Vexium at the loopback
  port it chose. A saved error is left alone: retrying a missing or broken file
  on every start would only hide the reason. Nothing starts with no file
  configured, with another provider selected, or before the reviewed weights
  have been downloaded. The rule is `shouldAutoStartCore` in
  `src/lib/vexium-core.ts`.
- **The Vexium page carries a Vexium Core card.** It names the installed file
  and its size, the active build with context length and loopback origin, and
  the state (RUNNING, STARTING, STOPPED, ERROR), with **Start Vexium Core** or
  **Stop server** beside it. A stopped runtime no longer reads as "no model":
  the page can start the installed model in place. Details:
  [ASSISTANT.md](ASSISTANT.md).
- **Existing profiles move off Ollama's stock default once.** A profile that
  never touched the assistant was stored as `ollama` at `127.0.0.1:11434` with
  no model, which is indistinguishable from untouched defaults. On the next
  launch it is switched to `local` at `127.0.0.1:8080` and a `migrated` flag is
  written; a user who later picks Ollama, LM Studio or their own address keeps
  that choice. A profile with a chosen model is never rewritten.
- **The player imports Spotify and YouTube playlists.** A Spotify playlist,
  album or track link becomes queue rows that play Spotify's public 30-second
  preview; a YouTube playlist, or a single watch link, becomes rows that play in
  an embedded YouTube player. The embed is served through a loopback bridge
  because it refuses to load inside a `file://` frame (Error 153). Imports stop
  at 500 tracks, skip duplicates and keep a watch link that carries a list a
  single video; failures name the platform instead of showing a silent stage.
  Details: [PLAYER.md](PLAYER.md).
- **Google's account pages see the browser Kryvex really is.** Google answers a
  Chrome user agent from an engine that is not Chrome with "This browser or app
  may not be secure". Measured in a Kryvex guest, the application's own agent
  (`Kryvex/… Electron/…`) reaches the account step where the Chrome claim is
  refused. On `accounts.google.*`, `myaccount.google.*` and
  `accounts.youtube.com` only, requests and the guest now carry that agent with
  no `Sec-CH-UA` hints, and neither the identity preload nor fingerprint
  farbling is installed. Google product pages keep the Chrome identity.
  Details: [SERVICES.md](SERVICES.md).
- **The Home board has a calculator and a currency converter.** Both are on by
  default and can be hidden or moved like the other cards. The calculator parses
  arithmetic itself and never runs the expression as code. The converter reads
  ECB reference rates from Frankfurter while its card is visible, and asks the
  `api.frankfurter.dev` host: the older `api.frankfurter.app` address answers
  301 without CORS headers, which made a browser fetch fail no matter the
  rates behind it.
- **The starter model was measured on the shipped runtime.** The fixed 13-prompt
  set in `scripts/eval-model-quality.cjs` ran against the runtime installed by
  the 0.8.8 Setup: 1.58 s to load, 18.3–21.7 tokens/s, 1.80–1.91 GB resident,
  and answers that are byte-identical across two greedy runs. It is useful for
  short replies, rewriting and extraction from supplied text; it misses strict
  formatting counts, does weak arithmetic and is not usable German. Raw answers:
  [qwen-0.8.8.json](media/evals/qwen-0.8.8.json); scoring:
  [VEXIUM_MODELS.md](VEXIUM_MODELS.md) §15.
- **Privacy rules are one auditable module.** The tracking-parameter strip list
  and the HTTPS upgrade now live in `electron/url-privacy-rules.ts`, covered by
  `tests/url-privacy-rules.test.ts`; the documentation no longer attributes
  Kryvex's own rules to another browser's source.
- **Documentation.** [ASSISTANT.md](ASSISTANT.md) gains an "On launch" section
  and the one-time move off Ollama, the download flow in
  [VEXIUM_MODELS.md](VEXIUM_MODELS.md) states that no download starts by itself
  while a configured runtime may start on launch, and
  [PLAYER.md](PLAYER.md), [SERVICES.md](SERVICES.md) and
  [TESTING.md](TESTING.md) record the playlist, sign-in and evaluation work.

## Artifacts

Built by the tag-triggered workflow (run
[39979410726](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/39979410726),
commit `5d1d948`) on `windows-latest` and attached to the published release:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.9-x64.exe` | 134,257,313 B (128.04 MiB) | `81059d4dd90ae33b807af46984925437652d354cd8e7b4400bdef482f0259f9d` |
| `Kryvex-Portable-0.8.9-x64.exe` | 134,020,092 B (127.81 MiB) | `1f3ec163b80e02b4b868155b858296ad6071b46f1304c01cdc0226801bdbc0ad` |

`SHA256SUMS.txt` (189 B) carries both digests. The updater ignores a release
whose installer has no matching entry. Both EXEs are **unsigned**. Both
published EXEs were downloaded from `releases/download/v0.8.9/` and
`sha256sum -c SHA256SUMS.txt` verifies both; each reports `ProductVersion
0.8.9`.

The packaged tree is about 467 MB, of which 44 MB is the bundled llama.cpp
runtime, and the wizard reports **Space required: 465.7 MB**.

## Install

1. Run `Kryvex-Setup-0.8.9-x64.exe`, or let an installed 0.8.8 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay.
3. The Portable EXE runs without installing. Its state still lives in
   `%APPDATA%\Kryvex`.
4. On the first launch after upgrading, Vexium Core starts by itself if a model
   is already configured; otherwise the Vexium card offers **Start Vexium Core**
   and **Download Vexium Core** stays an explicit click.

## Verification performed

- `npm run typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npm test`: exit 0, **583/583** tests across 58 files, including
  `tests/vexium-core.test.ts` for the migration, the auto-start rule and the
  installed-model lookup.
- `npm run audit:i18n`: clean; no hardcoded UI strings in 38 renderer files.
- `npm run build`: exit 0 before packaging.
- `pnpm package:win`: exit 0 locally before the tag, which is the pair the
  wizard capture above was taken from.
- The **packaged app** (`release/win-unpacked/Kryvex.exe`, bundled runtime
  `b11835`, real 1,117,320,736-byte `qwen2.5-1.5b-instruct.gguf`) was driven
  over `--remote-debugging-port` with a copied profile: the chip reached
  **RUNTIME ONLINE** with no click, the card read **RUNNING** with the installed
  file and its loopback origin, **Stop server** took it to **STOPPED** with
  **Start Vexium Core** in its place, and that button returned it to **RUNNING**
  and **RUNTIME ONLINE**. A prompt streamed a reply from the real weights.
- **Installed over 0.8.8.** `Kryvex-Setup-0.8.9-x64.exe /S /D=C:\Kryvex`
  returned 0; `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.8.9.0` and
  `FileVersion 0.8.9`, `resources\app.asar` is this build, `resources\bin`
  carries the runtime, and the uninstall entry reads `DisplayVersion 0.8.9`.
  Launched with the existing profile, the installed app showed `0.8.9` in
  Settings, reached **RUNTIME ONLINE** on its own, and answered a streamed
  prompt; quitting it stopped the runtime.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.8.9-x64.exe --version 0.8.9`: PASS. Four pages were
  captured, the install page ran for 23,012 ms, the installer exited 0, and the
  capture was archived under `docs/media/releases/0.8.9-wizard/`.
- `node scripts/check-release-record.cjs`: PASS for 0.8.9.
- **The tag-triggered workflow** (run
  [39979410726](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/39979410726))
  passed every step in 2m44s: the tag/`package.json` check, `release:check`,
  `audit:deps`, typecheck, tests, the one-time-code relay, `package:win`,
  checksums and the publish step.
- **Playlists and the YouTube bridge**: a live Spotify embed page parsed to 50
  tracks with preview URLs, a YouTube playlist page plus one continuation gave
  100 + 82 rows, the built app imported both, the bridge served the selected
  video from `127.0.0.1` and the transport advanced. A full video was not
  watched to its end. Details: [TESTING.md](TESTING.md).
- **Google sign-in**: the refusal was reproduced without credentials and
  bisected by user agent; the application agent reached the account step. A real
  account sign-in and a captcha were not attempted. Details:
  [TESTING.md](TESTING.md).
- **The published web build** was checked at `https://xiondigital.net/Kryvex/`:
  Settings reads **v0.8.9**, the calculator evaluates `7×8` to `56`, and the
  converter shows `$100.00 = R$504.65` at `1 USD = 5.0465 BRL` (23 Oct). That
  check is what exposed the Frankfurter host change fixed above; the web bundle
  was rebuilt and republished with it.

The packaged and installed runs used temporary CDP scripts that are not in the
tree; their steps are reproducible from this record. `pnpm audit:deps` did not
run here because `pnpm` was not on the shell's `PATH`, so it is not evidence
about the dependency tree either way.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. The capture comes from the locally built 0.8.9 installer before the
tag, and is committed with this record:
[capture.md](media/releases/0.8.9-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.9-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.8.9-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.7 MB" |
| 3 | [Installing](media/releases/0.8.9-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.8.9" |
| 4 | [Completing Kryvex Setup](media/releases/0.8.9-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The run took 33,366 ms end to end, the install page ran for 23,012 ms, and the
installer exited 0. The installed `C:\Kryvex\Kryvex.exe` reports
`ProductVersion 0.8.9.0`. The first attempt lost its manifest when the harness
read a window handle after the dialog had closed (`scripts/verify-wizard.ps1`
now treats a missing main window as `IntPtr.Zero`); the capture above is the
complete rerun.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The bundled runtime is **CPU-only** and x64. GPU acceleration needs a runtime
  the user supplies; Kryvex still prefers that choice when it is set.
- No model weights are bundled. Until the reviewed Qwen2.5-1.5B file has been
  downloaded, there is nothing to start and the card offers the download
  instead of a start button.
- Auto-start never retries a saved error. A runtime that fails for a new reason
  reports it on the card and the Settings row rather than looping on launch.
- Playlist import reads public page markup. A Spotify item without a public
  preview plays nothing and says so, and a YouTube video whose owner forbids
  embedding offers the full video in YouTube instead.
- The currency converter needs Frankfurter to be reachable; it shows
  "Rates are unavailable right now" rather than a stale or invented rate.
- Google still decides the account step: a captcha, a device check or a refusal
  can come back even with the application agent, and the service view then
  offers the session reset and the external-browser handoff.
- Windows only; no macOS or Linux build is produced by this release.
