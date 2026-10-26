# Kryvex 0.9.4: Windows release

Prepared 2026-10-26 for the `v0.9.4` tag. This one adds features, so the version
line moves rather than wearing a `-hotfix.N` ([UPDATES.md](UPDATES.md)). The
headline is **Kyvex Link**: the desktop serves one small page on the local
network, a phone pairs with a six-digit code, and from then on the phone has the
clipboard in both directions, file transfer in both directions, a link that
opens a Kryvex tab, and a remote for the player. The batch also gives Lexium a
transcription engine that needs no server, puts the secret tools behind a gate,
records the emulator's GPL-3.0 notice, and finishes the widget and window-control
fixes reported after 0.9.3. Everything in 0.9.3 is included.

The assets are built on this machine by `pnpm package:win` and are attached to
the published
[Kryvex 0.9.4 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.4)
by the tag-triggered workflow. This record and its wizard capture were committed
before the tag, so the workflow had both to check (`pnpm release:check`).

## What changed

- **Kyvex Link, a fifth secret tool (`#/link`, element x534).** The main process
  serves the phone page and one JSON API on the first free port in
  43110–43129 (`electron/link-server.ts`, whose every decision about who may
  pair, what a file is called and what a command may do lives in
  `electron/link-rules.ts`; IPC in `electron/link.ts`). A phone opens the
  address, types a six-digit code, and receives a token; the code retires
  immediately, so the next phone needs the next code. Paired phones can read and
  write the desktop clipboard, upload files to `Downloads\Kryvex Link` (multiple
  at once, collisions numbered rather than overwritten), download a file the
  desktop offers, send a link that opens as a Kryvex browser tab, and drive the
  player. The listener refuses any source that is not a private address,
  rate-limits pairing to five attempts per address per minute, caps uploads and
  clipboard text, and rewrites every incoming filename. The link is off until its
  switch is turned on. UI: `src/views/Link.tsx`; companion page:
  `companion.html`, `src/companion/`. Details:
  [LINK.md](LINK.md). Tests: `tests/link-rules.test.ts`,
  `scripts/verify-link.cjs`.
- **Lexium transcribes with nothing installed.** Every engine it had was a
  server the user had to start, so the first transcription on a fresh machine
  ended on *"Nothing answered"*. The default engine is now **This PC**: the main
  process runs the speech recogniser Windows already ships through
  `System.Speech` (`electron/lexium-speech.ts`), on the 16 kHz mono WAV the
  renderer already produces. No download, no account, no port. It is a dictation
  recogniser, not Whisper, and the interface says so; the external engines
  (local Whisper, whisper.cpp, OpenAI) are still there and unchanged, and a new
  **How to run a transcription server** panel explains how to stand one up —
  which the service never did before. `tests/lexium.test.ts`,
  `scripts/verify-lexium-speech.cjs`.
- **Secret services are behind a gate.** The four in-box tools plus Link now sit
  in a collapsed **Secret services** section that is closed by default and asks
  once — *Enable secret services* — before any of them is listed; the answer is
  stored as `settings.secretServices`. Each card carries the same pin control a
  service does, so a tool can be moved onto the pinned rail from either place.
  UI: `src/views/Services.tsx`, `src/styles-tools.css`.
- **The emulator's licence is recorded and shown.** Kryvex loads EmulatorJS
  (GPL-3.0) from the project's own CDN inside a sandboxed frame and ships no copy
  of it, so no GPL-3.0 code is conveyed; the Emulator view now says so beside the
  canvas, and [ATTRIBUTION.md](ATTRIBUTION.md) and [LEGAL.md](LEGAL.md) carry the
  full notice, including why the emulator is not forked into a "Kryvex variant".
- **The Home calculator is board-card sized.** It is capped at the same
  `--home-card` width the Board Guide uses instead of stretching across the wide
  column, and it starts collapsed.
- **A floating service window has a normal control cluster.** Minimize, maximize
  and close sit together at the right end of the title bar, close furthest right,
  and the workspace keeps Kryvex menus, dialogs and toasts above every window.
- **Sign-in and pinning fixes from the same batch.** A service sign-in that
  finishes in a popup folds back into its own module instead of leaving a stray
  window on the product page, and the pinned rail accepts a service dragged in
  from the Services page.
- **Version 0.9.4.** `package.json`, the packaged `ProductVersion` and the web
  worker's cache name (`kryvex-web-0.9.4-v1`) all move together, and `gh-pages`
  is republished by the tag job rather than by hand.

The pre-existing part of this batch is committed as `05cd741` (options panel,
board capture box, countdowns, clock) and `722e6c2` (sign-in fold, pinnable
tools); the Link, Lexium, gate and widget work rides in the release commit.

## Artifacts

Built locally by `pnpm package:win` from this working tree (no EPERM on
`release/win-unpacked`), then installed in place by the wizard capture below:

| File | Local size | Local SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-x64.exe` | 134,356,457 B (128.13 MiB) | `aaff68ecab63046c5effdf0811b3fc7355f7835431dc4344a63f75358bb68c24` |
| `Kryvex-Portable-0.9.4-x64.exe` | 134,119,323 B (127.90 MiB) | `089c0a07f67d8682db90368e19b983a575d871ad42264b442e00c593994966ac` |

`release/SHA256SUMS.txt` carries both, `release/win-unpacked/Kryvex.exe` reports
`ProductVersion 0.9.4.0` and `FileVersion 0.9.4`. No model weights are bundled.

The tag-triggered workflow (run
[40321535192](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40321535192),
commit `758f485`) built the published pair on `windows-latest` from the same
sources and attached it to the published, stable release:

| File | Published size | Published SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-x64.exe` | 134,356,680 B (128.13 MiB) | `ef7b19df84aa468d95617b56fb4802ceaecdd098d81cf57fad794806b81794fc` |
| `Kryvex-Portable-0.9.4-x64.exe` | 134,119,446 B (127.90 MiB) | `02b76d0c7616fe1f031719367ff403daa667446ddb0b581e392cd50b6a5f05b5` |

Both digests are the ones the release API reports for the uploaded assets, and
`SHA256SUMS.txt` (189 B) from the same release lists both names. They differ from
the local pair only by the build environment. Both EXEs are **unsigned**.

## Install

1. Run `Kryvex-Setup-0.9.4-x64.exe`, or let an installed 0.9.3 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in.
3. Open **Services → Secret services → Kyvex Link** on the desktop, turn it on,
   and open the address it shows on the phone. Type the six-digit code once.
4. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npx vitest run`: exit 0, **818/818** tests across 76 files.
- `pnpm verify:lexium-speech`: **PASS** — the harness synthesised speech with the
  Windows stack, converted it to the 16 kHz mono PCM the renderer sends, and the
  in-box engine recognised *"The quick brown fox jumps over the lazy dog"*; the
  same words came back through the proxy path the view calls, the probe reported
  `en-US`, and an empty upload was refused.
- `pnpm verify:link`: **PASS**, 30/30 — the listener started from the saved
  switch with the page never opened, served the companion page and its bundle,
  refused a raw `../package.json` path, refused a wrong code, throttled repeated
  guesses, paired a device from the live code, relayed a clipboard post back on
  the event stream, stored an upload named `../escape me.txt` as `escape me.txt`
  inside `Downloads\Kryvex Link` and numbered a collision, ran `focus` and
  refused `shutdown`, landed a phone link in a persisted browser tab, served a
  seeded offer, and retired the token on unpair.
- The phone page was driven in a real browser against the built app: pairing, the
  phone → desktop clipboard (confirmed independently on the Windows clipboard),
  the desktop → phone clipboard, an upload through the page's own XHR path, and
  the **Open Rooms** remote command. See [TESTING.md](TESTING.md).
- `pnpm build:web`: PASS (1.7 MiB), `scripts/check-web-build.cjs` PASS, bundle
  `assets/main-DW2l--5U.js` with the companion page as
  `assets/companion-CTBsK4FZ.js`, stylesheet `assets/main-B0cWfq0H.css`, worker
  cache `kryvex-web-0.9.4-v1`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.4-x64.exe`: PASS — four pages captured, the install
  page ran for 27,751 ms, the installer exited 0, the capture was archived under
  `docs/media/releases/0.9.4-wizard/`, and the installed `C:\Kryvex\Kryvex.exe`
  now reports `ProductVersion 0.9.4.0`.
- `pnpm release:check`: PASS for 0.9.4, 11/11.
- **The tag-triggered workflow** (run
  [40321535192](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40321535192))
  finished **success** in both jobs: the tag/`package.json` check,
  `release:check`, `audit:deps`, typecheck, tests, the one-time-code relay,
  `package:win`, checksums and publish, then the `web` job's build and push to
  `gh-pages`.
- **The live web client**: `https://xiondigital.net/Kryvex/` serves
  `assets/main-DW2l--5U.js` and `assets/main-B0cWfq0H.css` — the same names this
  machine's `pnpm build:web` produced — with the footer reading **v0.9.4**, and
  `caches.keys()` reports `kryvex-web-0.9.4-v1` under the site's own worker
  scope. No console error on the page.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built 0.9.4 installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.4-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.4-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.9.4-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 466.0 MB" |
| 3 | [Installing](media/releases/0.9.4-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.4" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.4-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 27,751 ms between **Installing** and **Completing Kryvex
Setup**, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **Lexium's default engine is a dictation recogniser, not Whisper.** It is
  accurate for clear speech in a language Windows has installed, and it will do
  poorly on music, heavy accents, noise or a language with no recogniser pack. It
  is chosen because it needs nothing installed; anyone who wants Whisper's
  accuracy can point Lexium at a server as before.
- **Link was verified against a browser, not a phone.** No Android or iOS device
  was on the network during the run, so the touch layout and *Add to home screen*
  are unverified. The public-source refusal is covered by unit tests only.
- **Link notifications need a secure origin.** On a plain `http://` LAN address
  browsers only deliver notifications while the page is open; the page says so
  instead of pretending otherwise.
- Kryvex Web is republished by the tag job; an already-installed PWA keeps
  `kryvex-web-0.9.3-v1` until its browser picks up the new `sw.js`, though the
  page itself is network-first and reads **v0.9.4** immediately.
- Google still decides the account step, unchanged from 0.9.0; the service view
  offers **Reset session & retry** and **Open externally**.
- The desktop app does not need a code to reach its own Link server, but the
  phone page is served over the LAN **without TLS**. Treat it as a home-network
  tool: the token travels in clear text over the local network.
