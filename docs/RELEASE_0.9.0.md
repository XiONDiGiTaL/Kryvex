# Kryvex 0.9.0: Windows release

Prepared 2026-10-24 for the `v0.9.0` tag. This release is about being served as
the browser Kryvex actually is. Google's account pages were measuring two things
and accepting neither: a Chrome claim from an engine that is not Chrome is
refused, and a guest with an empty `window.chrome` is read as an embedded view.
Google hosts now report the bare Chromium agent with Chromium's own client
hints, every guest carries the `chrome` surface a Chromium browser has, and
Google answers with its regular sign-in flow instead of the reduced one. A Google
service also finishes that sign-in inside its own module instead of in a stray
window. Everything in 0.8.9 is included.

The assets are attached to the published, stable
[Kryvex 0.9.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.0).
This record and its wizard capture were committed before the tag, so the
release workflow had both to check (`pnpm release:check`).

## What changed

- **Google gets the browser Kryvex is, not a claim.** `chromiumUserAgent` in
  `electron/user-agent.ts` removes the shell's own product tokens (`Kryvex/…`,
  `Electron/…`) from Electron's agent and leaves the plain Chromium agent;
  `withChromiumClientHints` in `electron/privacy.ts` sends the engine's own brand
  list (`Not?A_Brand`, `Chromium`), which is exactly what Electron's native
  `navigator.userAgentData` reports. Nothing claims to be Google Chrome and
  nothing announces Electron. Details: [SERVICES.md](SERVICES.md).
- **Every guest carries `window.chrome`.** The identity preload installs
  `chrome.app`, `chrome.csi`, `chrome.loadTimes` and `chrome.runtime`, plus a
  prototype-level `navigator.webdriver === false`. Electron ships an empty
  `chrome` object, and that absence is what Google's account pages read: with the
  surface present, the same engine is served `GlifWebSignIn` instead of
  `WebLiteSignIn`.
- **One identity per site family.** `isGoogleSite` in
  `electron/sign-in-hosts.ts` covers `google.com` and its country domains,
  `youtube.com` and Google's CDNs, and the header rewrite, the guest user agent
  and the identity preload all ask that one question. 0.8.9 changed identity per
  host, so a Gmail sign-in claimed Chrome on the product, Kryvex on the account
  host and Chrome again on the way back — a browser swap in the middle of
  Google's own flow.
- **Google services sign in inside their own module.** `electron/service-signin.ts`
  routes a Google product's account pages into the module's frame instead of a
  window, folds a service popup back into the module when it reaches the opener's
  site, and refreshes the module when a popup that visited a sign-in host closes.
  A third-party "Sign in with Google" keeps its real popup, because those flows
  answer through `window.opener`.
- **The shield stands aside for the account surface.** A blocked subresource on
  `accounts.google.*` fails a sign-in with no message, so `web-privacy.ts` passes
  those requests through; HTTPS upgrade and tracking-parameter stripping still
  apply.
- **Two release-time probes.** `scripts/verify-google-signin.cjs`
  (`pnpm verify:google`) drives the live sign-in surface and the return leg;
  `scripts/verify-identity-matrix.cjs` (`pnpm verify:identity-matrix`) re-measures
  five identities side by side, so the next change to Google's gate is a
  measurement rather than a guess.
- **Documentation.** [SERVICES.md](SERVICES.md) replaces the 0.8.9 identity section
  with the measured matrix, [TESTING.md](TESTING.md) records every run, and
  [PROJECT_STATUS.md](../PROJECT_STATUS.md) lists the two fixes in order.

## Artifacts

Built by the tag-triggered workflow (run
[40094955810](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40094955810),
commit `93e3c10`) on `windows-latest` and attached to the published release:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.0-x64.exe` | 134,259,751 B (128.04 MiB) | `28f3da2a3e51b65113c557b639998d0ce470ebb32451d5603ae87211b9e7d8bb` |
| `Kryvex-Portable-0.9.0-x64.exe` | 134,022,614 B (127.82 MiB) | `db90684966530c020b449499fa443b691b94f5359b415389d2fbb91c85f76d26` |

`SHA256SUMS.txt` (189 B) carries both digests. Both published EXEs were
downloaded from `releases/download/v0.9.0/`, `sha256sum -c SHA256SUMS.txt`
verifies both, and each reports `ProductVersion 0.9.0`. The locally built pair
the wizard capture was taken from differs from the CI pair only by the build
environment. Both EXEs are **unsigned**. The updater ignores a release whose
installer has no matching entry.

The packaged tree is about 465 MB, of which 44 MB is the bundled llama.cpp
runtime, and the wizard reports **Space required: 465.6 MB**.

## Install

1. Run `Kryvex-Setup-0.9.0-x64.exe`, or let an installed 0.8.9 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay, and the profile
   in `%APPDATA%\Kryvex` is untouched — services stay signed in.
3. The Portable EXE runs without installing.
4. If Google asked for a session reset during the 0.8.9 sign-in attempts, sign in
   once more: the account pages now open in the module's own frame and finish
   there.

## Verification performed

- `npm run typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npm test`: exit 0, **596/596** tests across 59 files, including
  `tests/service-signin.test.ts`, the `chromiumUserAgent` cases and the Chromium
  client-hint set.
- `npm run build` and `npx electron-builder --publish never`: exit 0, producing
  the pair above.
- `pnpm verify:identity`: PASS — a loopback guest keeps Chrome brands, matching
  hints and native-looking farbling wrappers, `window.chrome.app/csi/loadTimes/
  runtime` are callable, `navigator.webdriver` is false, and Google's hosts and
  its products share one identity while lookalikes do not.
- `pnpm verify:google`: PASS, 10/10 against the live site —
  `/v3/signin/identifier?…flowName=GlifWebSignIn` (not `/signin/rejected`), agent
  `Chrome/152.0.7977.167 Safari/537.36` with no shell token, `userAgentData`
  `Not?A_Brand / Chromium`, the identifier accepted, one unchanged agent across
  `mail.google.com → accounts.google.com → workspace.google.com`, and YouTube
  serving its normal page.
- `pnpm verify:identity-matrix`: PASS — `application` accepted (`WebLiteSignIn`),
  `chrome-bare` and `chromium-bare` refused, `chrome-surface` and
  `chromium-surface` accepted (`GlifWebSignIn`).
- **Sign-in inside the module**: with a disposable profile and a seeded Gmail
  module, the module itself loaded
  `https://accounts.google.com/v3/signin/identifier?continue=https://mail.google.com/…&flowName=GlifWebSignIn`
  and rendered the identifier field inside `.service-frame.is-active webview`,
  with no stray window.
- **The real account, in the installed build**: after the user completed a
  sign-in with mobile verification, the Gmail module in the installed 0.9.0 build
  reads `https://mail.google.com/mail/u/0/#inbox`, titled
  `Inbox - <account> - Gmail`, with the compose control present and no refusal.
  No credentials or tokens were read, logged or written by these checks.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.0-x64.exe --version 0.9.0`: PASS — four pages
  captured, install page ran for 24,501 ms, installer exited 0, capture archived
  under `docs/media/releases/0.9.0-wizard/`, and the installed
  `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.9.0`.
- `node scripts/check-release-record.cjs`: PASS for 0.9.0.
- **The tag-triggered workflow** (run
  [40094955810](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40094955810))
  finished **success**: tag/`package.json` check, `release:check`, `audit:deps`,
  typecheck, tests, `package:win`, checksums and publish. `v0.9.0` is published,
  stable, with the Setup, Portable and `SHA256SUMS.txt` assets.
- **The published installer over the 0.8.9 copy**: installed silently at
  `C:\Kryvex`, `ProductVersion 0.9.0`, launched, Vexium Core started with it, and
  the Gmail module read `https://mail.google.com/mail/u/0/#inbox`
  (`Inbox - <account> - Gmail`, compose control present, no refusal) inside its
  own frame.
- **The web client** was rebuilt with `pnpm build:web` (`check-web-build`: PASS,
  1.3 MiB, `assets/index-HSssHscJ.js`), published to `gh-pages` as commit
  `56398b1`, and served from `https://xiondigital.net/Kryvex/`. Its worker cache
  is now `kryvex-web-0.9.0-v1`, so a browser holding the 0.8.9 cache drops it on
  activation. Live, the page reports **v0.9.0**, the service worker is active on
  `/Kryvex/sw.js` with the new cache holding the shell, both hashed assets and
  the icons, and no console error was logged. Details: [TESTING.md](TESTING.md).

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built 0.9.0 installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.0-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.0-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.9.0-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.6 MB" |
| 3 | [Installing](media/releases/0.9.0-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.0" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.0-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The run took 35,508 ms end to end, the install page ran for 24,501 ms, and the
installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- Google still decides the account step: a captcha, a device check or a refusal
  can come back even with a coherent Chromium identity. The service view then
  offers **Reset session & retry** and **Open externally**.
- The identity is measured at the identifier step. The password and post-password
  checks are Google's, and the acceptance recorded here is one account on one
  network on 2026-10-24.
- The popup-fold path for providers other than Google is unit-tested but was not
  driven against a live provider; a YouTube module sign-in was not exercised
  separately from Gmail.
- A Google sign-in that needs a second device or a passkey still expects the
  first device to be present; nothing here works around that.
- The bundled runtime is **CPU-only** and x64, no model weights are bundled, and
  auto-start still refuses to retry a saved error.
- Playlist import reads public page markup; a Spotify item without a public
  preview plays nothing and says so.
- Windows only; no macOS or Linux build is produced by this release.
