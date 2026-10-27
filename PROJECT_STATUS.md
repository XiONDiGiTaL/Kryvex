# Kryvex: Project Status

**Product:** Kryvex Desktop 0.9.4-hotfix.3, a modular Electron workspace where web apps
become isolated, themed service apps, plus Kryvex Web, an installable PWA built
from the same renderer: mounted once, kept running, with native
desktop notifications, unread badges, sandboxed sign-in popups, persistent
sessions and per-service session clearing. It also has rooms with presence,
chat and screen share, Vexium Core running a reviewed local model over loopback, a
first-run theme gallery, an opt-in wallpaper backdrop and a restorable browser
session, a persistent download history, find-in-page and page zoom,
history/bookmarks, a persisted torrent queue that restores paused, a Chromium
engine panel that exposes real launch switches and page preferences,
microphone/camera prompts for web calls, HTTPS upgrades,
tracking-parameter stripping, per-site fingerprint farbling and a shared
download location. Five in-house secret tools sit behind their own gated tab
beside the modules: Lexium, the media player, the gated 8-bit emulator, Disk
pulse, a local drive analyzer with a guarded cleaner that scans in its own
worker thread, and Kyvex Link, the paired phone companion. Fictional
element `x529`, symbol `Kx`, tagline
“Precision in Every Connection.”

**Repository:** https://github.com/XiONDiGiTaL/Kryvex (public, `main`, no
force-push). Working directory remains `X:\Veyra`.

**Naming risk (open):** an existing KRYVEX AI platform, a KRYVEX password
vault, ~38 GitHub repos, a Play developer account and an unrelated salt-mill
mark use the name. The identity is fully tokenized, so a rename is cheap. No
domain purchase, store listing or paid brand spend without counsel clearance.
See `docs/ENGINEERING_DECISIONS.md` (ED-002). Gatherium is the fallback name.

## Milestones

- [x] **M0: Environment & safety audit.** Verified storage, git, Node 24.19.0,
  gh auth as XiONDiGiTaL. `X:\REA` untouched.
- [x] **M1: Requirements and research.** Requirements and the shell decision
  are recorded in `docs/ENGINEERING_DECISIONS.md`.
- [x] **M2: Reproducible baseline.** pnpm 12.3.4 (local tool dir; corepack
  blocked by EPERM), install/typecheck/test run in the project checkout.
- [x] **M3: Identity & shell.** Periodic-table tile logo, small/tray/mono
  variants, `brand/BRAND.md`, `brand/tokens.json`, `brand/themes.json` (schema
  v3, 78 catalogue themes in eight families), PNG 16–512, 7-resolution
  `kryvex.ico`. App id `net.xiondigital.kryvex`.
- [x] **M4: Theming (core).** 80 themes applied at runtime from
  `brand/themes.json` and `src/plugins/` (78 catalogue + Donkey + XiØN), with
  reds and pinks in the spectrum band, flame-test elements, a 12-entry
  birthstone **gems** family and a 12-entry gradient **planets** family (the
  metal Mercury is now **Quicksilver** so the planet keeps the plain name), all
  arranged as a periodic table with symbols, families and palette strips; the
  **Special XiØN Edition** adds the blade mark, a near-black glass base and
  opt-in glow/liquid motion; a **Custom** theme
  is generated from five HSV/RGB pickers with derived line, raised and muted
  tones and automatic light/dark detection. Gradient, glass and mono theme
  flags drive chrome, sheen and type. Density, sidebar mode, status bar and
  start view persist. Theme Studio import/export of third-party theme files
  and a formal contrast audit remain.
- [x] **M5: Services as apps.** Registry with add/edit/remove/pin, validation,
  search and category filters, 27 presets across communication, work, AI,
  resources and media. A service frame is mounted once and kept alive; the
  partition is set before `src`; the guest reports a Chrome user agent. Native
  notifications are granted to service partitions only, unread counts come
  from the page title, auth popups share the service session, pop-unders are
  denied, and one service's session can be cleared without touching any other.
  Hibernation, a notification-per-service granularity and health checks remain.
- [x] **M6: Browser (core).** Tabs that reopen after a restart, back/forward/
  reload, address bar with host-or-search resolution, bookmarks bar and toggle,
  in-memory per-tab partitions, system-browser handoff, a persistent
  downloads/history/bookmarks library, find-in-page, page zoom, a persisted
  WebTorrent queue inside Downloads that returns paused after a restart, a
  download-location picker shared by downloads and new torrents, and an engine
  panel for hardware acceleration, smooth scrolling, JavaScript, images,
  WebGL, the PDF viewer, autoplay, hidden-page throttling, spellcheck, the
  preferred colour scheme and default zoom. A home button returns to a designed
  start page with live shield counters, a field guide, module/bookmark launch,
  and an RSS/Atom reader with OPML import; private tabs write no history and
  never enter the saved session; an options menu gathers tab, library, private
  and shield actions. Per-site zoom memory is Chromium's own map; it is
  reported read-only.
- [ ] **M7: Security (baseline shipped).** Sandboxed renderer, context
  isolation, a narrowed typed IPC bridge, hardened webviews, partition
  allowlist, http(s)-only navigation, an explicit per-origin mic/camera prompt
  with other permissions/devices denied, service-scoped notifications and auth
  popups, background pop-under denial, GPC, cross-origin
  referrer trimming, in-memory browser tab partitions, atomic capped state
  writes, sender checks on every IPC handler, HTTPS upgrades with a one-time
  HTTP fallback, tracking-parameter stripping, per-site canvas/WebGL/audio
  farbling and EasyList Cookie. Remaining: per-site privacy exceptions,
  persisted per-module scopes, Safe Browsing equivalent, `pnpm audit`,
  packaged-app integrity checks, renderer CSP, macOS/Linux validation.
- [ ] **M8: Testing (partial).** 444/444 unit tests, strict typecheck, build and
  twenty-four-capture pass; live Sohbet probe passed. Two-instance Rooms
  (`pnpm verify:rooms`) proves presence, chat and a 2560×1440 screen share
  between separate profiles. The new service-engine
  harness proves keep-alive, exact layout, restart persistence, notification
  scoping, an auth popup on the same cookie, unread badges, session clear and
  the browser user agent. Download-manager,
  default-browser, Web Store extension, loopback torrent (real peer transfer),
  torrent IPC/UI, real webview media-permission and privacy harnesses passed.
  Restart persistence, download history, the download-location row/reset
  action, torrent queue restore across a location change, the restored torrent
  row in the built UI, and find/zoom are automated through
  `pnpm verify:restart`, `pnpm verify:downloads`, `pnpm verify:location-ui`,
  `pnpm verify:torrents`, `pnpm verify:torrent-restore-ui` and
  `pnpm verify:browser`, `pnpm verify:chromium`, `pnpm verify:updater`,
  `pnpm verify:browser-start` and `pnpm verify:rooms`.
  Remaining: broader e2e UI
  coverage, backup/restore,  measured performance comparison (`docs/PERFORMANCE.md` still holds no
  numbers).
- [x] **M9: Packaging & CI.** The **0.6.0**, **0.7.0**, **0.8.0**, **0.8.1**, **0.8.2**, **0.8.3**,
  **0.8.4**, **0.8.5**, **0.8.6**, **0.8.7** and **0.8.8** Setup and Portable EXEs are built by GitHub Actions on their `v*` tags
  (**0.8.5**, **0.8.6**, **0.8.7** and **0.8.8** were also built and installed locally before their
  tags, and their published EXEs were re-downloaded and hash-verified
  afterwards); **0.8.9** (Vexium Core auto-start, the Vexium page status card,
  the one-time move off Ollama's default, Spotify and YouTube playlist import,
  the Google account-page sign-in fix, and the Home calculator and converter)
  was tagged on 2026-10-23 and published by the workflow as the stable
  [v0.8.9 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.9)
  (run `39979410726`, 2m44s). Its local build had already replaced the 0.8.8 copy
  at `C:\Kryvex`, which reported 0.8.9 and started Vexium Core on launch, and the
  tag was gated on the commit that carries its release record and installer
  wizard capture (`docs/RELEASE_0.8.9.md`,
  `docs/media/releases/0.8.9-wizard/`); both published EXEs were then
  re-downloaded and `sha256sum -c SHA256SUMS.txt` verifies both, each reporting
  `ProductVersion 0.8.9`. **0.9.0** (the Chromium sign-in identity, the `window.chrome`
  surface, one identity per Google site family, and a Google service signing in
  inside its own module)  was tagged on 2026-10-24 (run `40094955810`, success) and gated the same way, on
  `docs/RELEASE_0.9.0.md` and `docs/media/releases/0.9.0-wizard/`; the published
  Setup was then installed over the 0.8.9 copy at `C:\Kryvex`, reported 0.9.0,
  started Vexium Core, and its Gmail module read
  `mail.google.com/mail/u/0/#inbox` inside its own frame, and both published EXEs
  were re-downloaded with `sha256sum -c SHA256SUMS.txt` verifying both. The
  workflow checks the tag against `package.json`, runs typecheck and tests, runs
  `package:win`, writes `SHA256SUMS.txt` and publishes the release, and it now
  refuses a tag whose release record carries no installer wizard capture
  (`pnpm release:check`). CI also runs `pnpm build:web`, which checks the PWA
  manifest, service worker and install icons before a web build is handed to a
  phone. The 0.7.0
  unpacked build completes all twenty-seven capture routes, including Rooms, the
  theme gallery, the Chromium engine panel and the wallpaper panel. Remaining:
  code signing and an interactive-wizard pass.
- [x] **M10: Publication.** `XiONDiGiTaL/Kryvex` created, MIT licensed,
  secret-scanned, main pushed and verified remotely; 0.3.0 through 0.9.4 plus
  0.9.4-hotfix.1, 0.9.4-hotfix.2 and 0.9.4-hotfix.3 published. Each release
  carries the Setup and Portable EXEs plus `SHA256SUMS.txt`, whose entries match
  the uploaded asset digests, so the in-app updater accepts it; the published
  pair of each of the last three was re-downloaded and re-hashed on this machine
  (`sha256sum -c SHA256SUMS.txt` reports OK). The installable PWA is published
  from the `gh-pages` branch of the same repository and serves
  `https://xiondigital.net/Kryvex/`, rebuilt by the tag job from 0.9.4 on
  (now worker cache `kryvex-web-0.9.4-hotfix.3-v1`, footer
  **v0.9.4-hotfix.3**).
- [ ] **M11: Final review.** README with real screenshots, banner,
  feature/security/limitation sections, honest testing docs and 0.3.0–0.9.0
  release records are in place. Outstanding: engineering report and
  a signed public release.

## Released (2026-10-27, 0.9.4-hotfix.3)

`v0.9.4-hotfix.3` was tagged on the commit that carries the record and the
installer wizard capture (`eeb0a0e`), and both runs on it succeeded: **CI** on
`main` and the **Release** workflow (run `40433494364`), which built the pair and
published
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.4-hotfix.3).
Both artifacts were then re-downloaded and re-hashed here:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-hotfix.3-x64.exe` | 134,397,450 B | `5c016cf47d0c26934d8d7da6ecb04d70d9305f1eb08f89ed1d670109d3d3f16a` |
| `Kryvex-Portable-0.9.4-hotfix.3-x64.exe` | 134,160,199 B | `e43826b0d664325b0d249c8e2cfd8e9745f5732358f3dda7706c9e128e290ea6` |

`sha256sum -c SHA256SUMS.txt` reports **OK** for both, and the installer was run
locally during the capture: the per-user installation in `C:\Kryvex` now reports
0.9.4-hotfix.3. The same tag force-pushed `gh-pages`, the Pages deployment that
followed succeeded, and the published worker at
`https://xiondigital.net/Kryvex/sw.js` names
`kryvex-web-0.9.4-hotfix.3-v1`. Full record:
`docs/RELEASE_0.9.4-hotfix.3.md`.

## Added (2026-10-26, one-click Whisper for Lexium)

A Turkish voice note of a song came back from **Use this PC** as recognisable
English that was nowhere in the recording, because the in-box engine is a
dictation recogniser and not a Whisper model. The fix is not another warning: it
is the shortest possible path to a real speech model.

- Lexium's setup panel now opens on **Whisper on this machine**. One button,
  **Download and start**, fetches the pinned `whisper-server` build
  (`ggml-org/whisper.cpp` release `b5454`, 8,928,640 bytes,
  `6ba69e34…d816ccb`) and one pinned multilingual model (default `ggml-base.bin`,
  147,951,465 bytes, `60ed5bc3…5fba2efe`; `tiny` and `small` are also offered),
  verifies both against their SHA-256, unpacks the archive with the app's own
  hardened ZIP reader, starts the server on `127.0.0.1:8129` and points Lexium at
  it. Nothing is uploaded, nothing is bundled, and the same panel keeps the
  three manual server options for anyone who already runs one.
- New main-process modules: `electron/speech-catalogue.ts` (the pins),
  `electron/speech-runtime-rules.ts` (pure layout, validation, archive and argv
  rules), `electron/artifact-download.ts` (one verified download, reusing the
  host/redirect/hash policy in `model-rules.ts`),
  `electron/speech-runtime.ts` (install, start, stop, remove, cleanup around a
  child process). IPC is six narrow handlers, each validated with
  `isShellSender`; the renderer names a catalogue id and nothing else. The runtime
  imports no Electron, so it runs — and is tested — from a plain Node script.
- The panel names its own failures (unreachable, disk space, checksum, archive,
  server) and can show the server's last output lines. Downloads are cancellable,
  a model in use cannot be deleted, a removed model cannot be started, and the
  partial, archive and staging files are removed on both success and failure.
- Copy was written for es/de/fr/tr in `src/lib/i18n-speech.ts` and `i18n-tr.ts`,
  and the i18n ratchet stayed green (every new string translated in all three
  required locales, Turkish backlog unchanged).
- Verified: `pnpm verify:speech` — **PASS** on the real network and CPU (pinned
  download verified, the model on disk re-hashed against the pin, a synthesised
  phrase transcribed through the renderer's proxy with timed segments, `auto`
  and `tr` accepted, listener gone after stop, model removed, restart refused).
  `pnpm verify:speech-bridge` — **PASS** driving the built app: bridge exposed,
  catalogue intact, an id outside it refused, the card rendered with its button,
  and opening the panel installing nothing. Also green: `pnpm typecheck`,
  `pnpm test` (913 tests), `pnpm audit:i18n`. Documented in `docs/LEXIUM.md`,
  `docs/ATTRIBUTION.md` (whisper.cpp and Whisper are MIT and are not
  redistributed) and `docs/TESTING.md` (including what is *not* covered).
- Not covered: the button is not clicked inside the UI harness (that would
  download 148 MB as a side effect of a UI test) and no platform other than
  Windows x64 was run; both are recorded in `docs/TESTING.md`.

## Fixed (2026-10-24, services stay alive when you look away)

Two testers reported the same class of bug in different services: switching to
another tab closed the emulator, discarded a Disk pulse scan and dropped a room.
Each screen had grown its own answer.

`src/lib/lifecycle.ts` is now the shared model — `active`, `background`,
`paused`, `stopped` — with five policies (keep running, keep muted, pause on
leave, pause when idle, stop when leaving), a global default and per-service
overrides. `src/components/ServiceLifecycle.tsx` keeps a visited view mounted
and parks it at zero opacity instead of unmounting it, because a display-none
frame is a hidden page and Chromium throttles it. Each service declares what it
can do; the resolver reports the closest safe behaviour when a request cannot be
honoured, so Disk pulse says it cannot suspend rather than pretending, and Rooms
stays connected instead of dropping the call.

The emulator's save model was rebuilt on the same pass. Its sandbox is what
keeps the third-party core away from the bridge, and it also meant EmulatorJS's
"save to browser" wrote into a shim that discarded everything: the left-hand
Save State button downloaded a file, and Load State could never find it.
`EJS_onSaveState`/`EJS_onLoadState` now hand the bytes to the shell, and
`src/lib/emulator-saves.ts` keeps them in IndexedDB — quick slot, named states
with captured frames, twelve per cartridge, in-game `.srm` files kept
separately, an optional save folder chosen once through the File System Access
API, and explicit export/import. No save path touches Downloads unless the user
asks to export.

Settings gains **Service lifecycle** (default, idle interval, per-service row
with a live "Now: …" line), translated in all four locales. Details and the
capability table are in `docs/LIFECYCLE.md`.

Still open from the same report: emulator netplay, the emulator HUD's theming
pass, Lexium MP3 diagnostics, YouTube sizing, Spotify playlist import, room
message history, Yandex and the calculator widget.

## Fixed (2026-10-24, a service signs in inside its own module)

With the browser check passed, a real Gmail sign-in went through — mobile
verification included — but it happened in its own window, and that window ended
up showing the inbox while the Gmail module behind it still showed the
signed-out page. The module never reloaded, and the user's session existed
somewhere they were not looking.

`electron/service-signin.ts` (new) handles both halves:

- a Google product page that opens Google's account pages now navigates the
  module's own frame (`signsInWithin`), because the sign-in is cookie-based and
  needs no `window.opener`;
- a service popup that reaches the opener's own site closes and its page loads in
  the module (`returnsToOpener`), and a popup that visited a sign-in host
  refreshes the module when it closes.

Third-party "Sign in with Google" is untouched: those flows answer through the
opener and keep their real popup. Wired in the window-open handler and the
`did-create-window` hook of `electron/main.ts`; rules covered by
`tests/service-signin.test.ts`.

Verified in the built app with a disposable profile and a seeded Gmail module:
the guest sits at `accounts.google.com/v3/signin/identifier?…
flowName=GlifWebSignIn`, the identifier input renders inside
`.service-frame.is-active webview`, and no stray window exists. Not run: a
completed in-frame sign-in (it needs the account's phone verification), a
YouTube module sign-in, or the popup-fold path end to end.

## Fixed (2026-10-24, one identity per Google site family)

0.8.9 fixed Google's *account* pages and left the products alone, so a Gmail
sign-in claimed Chrome on `mail.google.com`, reported Kryvex on
`accounts.google.com`, and claimed Chrome again on the way back. Google's
post-password risk check sits across that round trip: a browser that changes
product between the password and the return is easy to read as a different
browser than the one that authenticated. A second, smaller gap: the shield
processed every request on the session with no exemption for the account hosts,
so a list rule catching one of Google's own scripts could fail a sign-in with no
message.

`isGoogleSite` (`electron/sign-in-hosts.ts`) now answers for the whole family —
`google.com` and its country domains, `youtube.com`, `youtu.be` and Google's
CDNs — and `hardening.ts`, `identity.ts` and the identity preload all ask that
one question, so every hop of a sign-in carries the same agent.
`web-privacy.ts` hands requests to `accounts.google.*`, `myaccount.google.*` and
`accounts.youtube.com` straight through; HTTPS upgrade and tracking-parameter
stripping still apply. The IPC gate the preload asks was renamed
`kryvex:identity:chrome` to match what it now decides.

The identity itself was then measured instead of guessed: five variants, one
partition each, one throwaway identifier submitted per variant. The Chrome claim
and a plain Chromium agent were both refused while they were missing the
`window.chrome` surface, and both were accepted — with Google's *full*
`GlifWebSignIn` flow instead of the reduced `WebLiteSignIn` one — once
`chrome.app`, `chrome.csi` and `chrome.loadTimes` existed. Electron ships an
empty `chrome` object, and that is what Google reads as an embedded view.

So Google hosts now report the bare Chromium agent (`chromiumUserAgent` strips
the `Kryvex/…` and `Electron/…` tokens; nothing claims to be Google Chrome),
with Chromium's own brand list on the wire (`withChromiumClientHints`), while the
preload installs the `chrome` surface and `navigator.webdriver === false` in
every guest. No `userAgentData` patch on Google, where the engine's own brands
already agree.

`scripts/verify-google-signin.cjs` (`npm run verify:google`) is the release
check. Against the live site on 2026-10-24: `/v3/signin/identifier?…
flowName=GlifWebSignIn` loaded (not `/v3/signin/rejected`), the agent was
`Chrome/152.0.7977.167 Safari/537.36` with no shell token, `userAgentData` was
`Not?A_Brand / Chromium`, `chrome.app/csi/loadTimes` were callable, `webdriver`
was false, the identifier was accepted, and every hop of the `mail.google.com` →
`accounts.google.com` → `workspace.google.com` return leg kept the same agent.
10/10. Also: `npm run typecheck` exit 0, `npm test` 591/591,
`npm run verify:identity` PASS. Not run: a real account sign-in or a captcha.

## Fixed (2026-10-23, Google sign-in browser check) — superseded above

Google's account pages refuse a browser that claims to be Chrome from an engine
they can tell is not Chrome: the identifier step lands on
`/v3/signin/rejected` with "This browser or app may not be secure". The refusal
was reproduced without credentials and bisected in a real guest (fresh profile,
`persist:svc-*` partition, trusted key events through
`webContents.sendInputEvent`):

- a Chrome user agent, with or without client hints and the identity preload,
  was refused every time;
- the application's own agent (`Kryvex/... Electron/44.9.3`) reached Google's
  account step: a captcha, then "Couldn't find this account" for the fake
  identifier.

Kryvex now stands aside on `accounts.google.*`, `myaccount.google.*` and
`accounts.youtube.com`: requests carry the application's own user agent with no
`Sec-CH-UA` hints, the guest switches its agent per navigation
(`electron/identity.ts`), and neither the identity preload nor the fingerprint
farbling is installed there. Every other page keeps the Chrome identity.

Checks: `npm run typecheck` exit 0; `npm test` exit 0, **571/571** in 57 files
(adds `tests/sign-in-hosts.test.ts` and two `withApplicationUserAgent` cases);
`npm run build` exit 0; `npm run verify:identity` PASS with the new shape
assertions; an end-to-end guest reached the account step. Not run: a real
account sign-in, a captcha solve, or another provider.

## Fixed (2026-10-21, error dialog on close)

- **Reported:** closing the installed build showed **“A JavaScript error occurred
  in the main process, TypeError: Object has been destroyed”**, at
  `dist-electron/party.js` inside a `BrowserWindow` `closed` listener.
- **Cause:** `partyAttachWindow` compared `shell === win.webContents` inside the
  `closed` handler. The window is already destroyed by then, so that getter
  throws and the exception becomes Electron's blocking dialog. A standalone
  probe with a real `BrowserWindow` reproduced the throw from both `win.close()`
  and `app.quit()`; instrumenting the handler in the app logged the same message.
- **Fix:** capture `webContents` at attach time and compare against that
  reference, so the handler reads nothing off the closed window.
- **Guard:** `node scripts/verify-party-close.cjs` (`pnpm verify:party-close`)
  fails against the old handler with `Object has been destroyed` and passes
  against the new one, checked in both directions.
- **Shipped:** 0.8.1 was tagged at `374f25e`, the Release workflow passed, and
  the published `Kryvex-Setup-0.8.1-x64.exe` (120,286,681 B,
  `880b1804…634f`) and `Kryvex-Portable-0.8.1-x64.exe` (120,049,554 B,
  `df96bf96…b93e`) match `SHA256SUMS.txt` and report `ProductVersion 0.8.1`.
  The downloaded Portable build's extracted `resources/app.asar` contains
  `shell === attached` and no `shell === win.webContents`, and closing it exited
  with code 0 and no exception text.

## Fixed (2026-10-21, window lifecycle audit)

- Electron's semantics were measured before changing anything: inside a
  `closed` handler `win.isDestroyed()` and `win.id` still answer, while
  `win.webContents`, `win.getTitle()`, `win.isVisible()` and
  `contents.getURL()` throw `Object has been destroyed`.
- Fixed: `main.ts` (IPC sender check reads a captured `shellContents`),
  `permissions.ts` (shell contents captured at attach; `isShellCapture` and
  `send` no longer read `window.webContents`), `party.ts` (display handler checks
  the shell is alive before `mainFrame`, `listSources` asks `isDestroyed()` before
  `getType()`), and the folder pickers in `extensions.ts`, `torrents.ts` and
  `storage.ts` now require a live parent window.
- New `electron/lifecycle.ts` (`isAliveWindow`, `isAliveContents`) is pure and
  unit-tested; `scripts/audit-lifecycle.cjs` (`pnpm audit:lifecycle`) scans
  close/destroy handlers, and `tests/lifecycle.test.ts` runs it against both the
  tree and a fixture holding the old crashing line.
- Evidence: `npm run typecheck` exit 0; `npx vitest run` **268/268** in 28 files;
  `verify:party-close`, `verify:updater`, `verify:service-engine` and
  `verify:rooms` (screen share 2560×1440) all PASS; `audit:i18n` clean.
- **Folder pickers checked directly:** the new `pnpm verify:guards` drives the
  compiled download, extension and torrent pickers with a window that throws on
  every property except `isDestroyed()` and an Electron stub that counts dialog
  requests. It passes on this tree and fails with `1 call(s)` / “Selection
  cancelled” when the compiled download-picker guard is removed.
- **Shipped:** 0.8.2 was tagged at `31cfe5d`; the Release workflow (run
  39559900423) passed and published `Kryvex-Setup-0.8.2-x64.exe` (120,287,904 B,
  `41a009f8…e036`) and `Kryvex-Portable-0.8.2-x64.exe` (120,050,696 B,
  `5dca57aa…68b6`), whose downloaded copies match `SHA256SUMS.txt` and report
  `ProductVersion 0.8.2`. The Portable build's extracted `app.asar` contains
  `isAliveWindow` in the three picker modules, `shellContents` in
  `isShellSender` and `isAliveContents` in `permissions.js`, and no
  `shell === win.webContents`. Launched against a disposable profile it opened
  the shell, wrote its profile and closed with no process or dialog left behind.

## Added (2026-10-21, in-app popup tabs)

- A browser tab's `window.open` now becomes a popup tab instead of a hand-off to
  the system browser, so a sign-in window keeps `window.opener` and the session
  and hands its result back to the page that opened it.
- Measured constraint first: Electron refuses `new WebContentsView({ webContents })`
  with “options.webContents is already attached to a window”, and moving the page
  between contents is what would drop the opener. The popup therefore stays a
  real window (frameless, taskbar-hidden, parented to the shell) and
  `electron/popup-tabs.ts` places it over the browser canvas while the tab strip
  mirrors it.
- `electron/popup-rules.ts` holds the pure policy: browser tabs and popups they
  spawn qualify, service partitions keep their child window, `background-tab`
  pop-unders and non-http(s) URLs are refused, and placement clamps the reported
  canvas to the content area. `tests/popup-rules.test.ts` covers 19 cases.
- Browser webviews gained `allowpopups`; without it Electron refuses the popup
  before the main-process policy is consulted, which the harness caught first.
- Evidence: `npm run typecheck` exit 0; `npx vitest run` **287/287** in 29 files;
  `npm run build` exit 0; `audit:lifecycle` clean over 40 files; `audit:i18n`
  clean; `verify:popups` PASS with a popup tab titled by its page, `kx-popup-ok`
  received by the opener, **0 px** drift between the popup client rectangle and
  the canvas, hide/show on tab switch, and a clean return to the opener on close.
- **Shipped:** 0.8.3 was tagged at `fc64024`; the Release workflow (run
  39582848868) passed and published `Kryvex-Setup-0.8.3-x64.exe` (120,292,667 B,
  `ed91ad07…8787`) and `Kryvex-Portable-0.8.3-x64.exe` (120,055,522 B,
  `850fe2c6…8ec4`), whose downloaded copies match `SHA256SUMS.txt` and report
  `ProductVersion 0.8.3`. The Portable build's extracted `app.asar` carries
  `popup-tabs.js` and `popup-rules.js` and registers every `kryvex:popups:*`
  channel.
- **Update path checked end to end:** the installed 0.8.2 at `C:\Kryvex` showed
  `Kryvex 0.8.3 is available.` after **Check for updates**, downloaded a file
  hashing to the published digest, reported `Kryvex 0.8.3 is ready to install.`
  after verification, exited with code 0 on **Install and restart**, and left
  `Kryvex.exe` at `ProductVersion 0.8.3.0`. Relaunched, Settings → Updates read
  `v0.8.3 · BUILD INSTALLED` with a green **UP TO DATE** verdict.

## Added (2026-10-21, repeatable self-update check)

- The release checks had been one-off drivers per release, and the installer
  wizard was never captured: NSIS draws its pages as native controls, so a CDP
  screenshot of the shell cannot include them. `scripts/verify-self-update.cjs`
  (`pnpm verify:self-update`) and `scripts/verify-wizard.ps1` make the whole
  chain repeatable: installed binary from `InstallLocation`, isolated profile,
  the real Updates panel, the downloaded installer's hash against the live
  `SHA256SUMS.txt`, the hand-off to the installer, every wizard page as text and
  a PNG, the installer's exit code, and the version afterwards.
- Three corrections came from running it rather than reasoning about it: `Enter`
  never advanced the wizard because focus sat on a radio button, so the forward
  button is now clicked through `WM_COMMAND`; the same command posted to the
  disabled **Next >** on the install page skipped the file copy entirely, so the
  script checks `IsWindowEnabled`; and NSIS restores the archive timestamps of
  copied files, so an unchanged `Kryvex.exe` mtime is not evidence of a skipped
  install and progress is judged from the wizard instead.
- The capture is part of the cut, not an afterthought: `pnpm release:wizard`
  archives it under `docs/media/releases/<version>-wizard/`, `pnpm release:check`
  refuses a record without it, and the release workflow runs that check before
  building. 0.8.3's capture is committed there retroactively, and its record
  says plainly that it is a same-version reinstall.
- Evidence on this machine (installed 0.8.3, latest 0.8.3): the live check
  reported `current`; the wizard capture recorded 4 pages with a PNG each
  (`Choose Installation Options → Choose Install Location → Installing →
  Completing Kryvex Setup`), the install page ran 20,560 ms, the installer exited
  0, and the attach path against a detached installer recorded 5 pages and exit
  0. Details and the limits of the run are in `docs/TESTING.md`.

## Verified evidence (2026-10-21, published 0.8.0 artifacts)

- The `v0.8.0` tag was pushed at `be02c4d`; the tag-triggered Release workflow
  (run 39523097023) passed every step: tag/version check, install, typecheck,
  tests, `package:win`, checksums and publish, and published the release
  without a draft.
- The published assets report `Kryvex-Setup-0.8.0-x64.exe` at 120,286,633 bytes
  and `Kryvex-Portable-0.8.0-x64.exe` at 120,049,414 bytes. Downloaded copies
  hash to `352fb5c8…33b3` and `d62b44bc…f5ff`, byte-identical to the digests
  GitHub reports and to both lines of the published `SHA256SUMS.txt`, which is
  what the updater verifies before offering an install.
- Both EXEs report `ProductVersion 0.8.0`, `FileVersion 0.8.0`, company `XiØN`.
- **The live feed is accepted by the app's own rules.** Fetching
  `api.github.com/repos/XiONDiGiTaL/Kryvex/releases/latest` and running the
  compiled `update-rules` over it yields release `0.8.0`, a trusted Setup URL, a
  Portable asset and matching checksum entries; the comparison returns
  `available` for a 0.7.0 build and `current` for both 0.8.0 and 0.8.1.
- **The published Portable build passes end to end.** Launched from the
  downloaded EXE in a disposable profile with no feed override: it reported
  `mode: portable`, `currentVersion 0.8.0`, and the live check returned
  `phase: current`; Settings → Updates rendered `v0.8.0 · BUILD PORTABLE`,
  `Kryvex 0.8.0 is the latest release.` and `UP TO DATE` with an SVG check,
  `.update-status.is-current` and `rgb(74, 222, 128)`: equal to the probe
  painted with `var(--success)`. Clicking **Check for updates** raised the
  `toast toast-success` reading `Kryvex 0.8.0 is up to date.`
- The same build exposes the model runner at Settings → Vexium: `RUN A MODEL
  FILE`, state `IDLE`, the empty-model copy, and Choose model… / Get models /
  Download llama.cpp / Find runtime… / Start server. Get models and Download
  llama.cpp only open external pages; nothing is fetched by Kryvex.
- Its renderer user agent is `Chrome/152.0.0.0` with no Electron token, so the
  identity change is present in the shipped binary rather than only in source.
- **Limit:** the installed 0.7.x build on this machine was left running and was
  not driven through the in-app install; the upgrade path is proven by the live
  feed comparison (`available` for 0.7.0) and the workflow's artifacts, not by a
  completed self-update.

## Verified evidence (2026-10-20, layout clipping)

- `pnpm typecheck` → exit 0 for renderer and main.
- `pnpm test` → exit 0, **219/219** in 24 files, including
  `tests/window-rules.test.ts`: 1440p, 1366×768, a 150%-scaled 1366×768 work
  area, the 900×520 floor and a custom margin.
- `pnpm build` → exit 0.
- **`node scripts/verify-layout.cjs` → PASS.** No element clips its own content
  and neither the document nor `.app-main` overflows horizontally across ten
  window sizes (2560×1400 down to 900×520) and six views, and the first-run
  sheet fits with a reachable footer at four sizes.
- **`node scripts/verify-theme-gallery.cjs` → PASS**, now asserting that every
  theme preview shows its full mock content.
- **Fixed:** the gallery mocks were clipped by 46 px (fixed frame, stacked
  cards); the large preview clipped by 12 px at 860 px wide (media override);
  the first-run sheet pushed its footer out of reach at 900×600. The initial
  window now fits the display work area instead of assuming 1440×900, and the
  minimum window dropped from 1040×680 to the verified 900×520.

## Verified evidence (2026-10-20, theme gallery)

- `pnpm typecheck` → exit 0 for renderer and main.
- `pnpm test` → exit 0, **214/214** in 23 files. `tests/theme-gallery.test.ts`
  covers family grouping and order, hero selection with fallback, active-family
  resolution, and the upgrade rule that a state file without
  `themeGallerySeen` counts as already seen.
- `pnpm build` → exit 0.
- **`node scripts/verify-theme-gallery.cjs` → PASS.** Fresh profile opened the
  first-run sheet with eight family cards; previewing GEMS showed Sapphire
  without changing the active theme; the Ruby chip applied it and closed the
  sheet; a reload kept both the theme and the dismissal; Settings still
  rendered all 81 periodic tiles with the gallery below them.
- **Bug found and fixed during the build:** the first CSS insertion truncated
  `.theme-gallery-sheet` mid-declaration, which made lightningcss reject the
  following `@keyframes` block. The block was completed and the sheet, head,
  lede, footer and narrow-window rules now compile.

## Verified evidence (2026-10-20, Rooms)

- `pnpm typecheck` → exit 0 for renderer and main.
- `pnpm test` → exit 0, **206/206** in 22 files, including
  `tests/party-rules.test.ts`: id generation and validation, invite parsing,
  display-name and chat limits, and presence reduction.
- `pnpm build` → exit 0.
- **`node scripts/verify-rooms.cjs` → PASS** on Windows, Electron 44.2.0, with
  two isolated profiles and the default three public WebTorrent trackers.
  Instance A created a room through the button (26-char code), listed the
  fixture service as a shareable Kryvex app, and B joined through the invite
  hash; both presence lists reached two entries, a chat line typed in A arrived
  in B, and A's screen pick produced a video tile in B decoding 2560×1440.
- **Bug found and fixed:** the hardened permission policy refused `media` for
  the shell, so `getDisplayMedia` never reached the capture broker. The shell
  now receives `media` only while `partyHasPendingPick()` holds an armed,
  unexpired source choice; unarmed requests are still denied and a webview can
  never arm one.

## Verified evidence (2026-10-20, Chromium engine settings)

- `pnpm typecheck` → exit 0 for renderer and main.
- `pnpm test` → exit 0, **187/187** in 21 files. `tests/chromium.test.ts` covers
  the shared profile contract: defaults, unknown/wrong-typed field rejection,
  zoom snapping to the browser's steps, state-file reading, the
  web-preference mapping, launch switches, renderer/main parity for defaults
  and zoom steps, and save-time repair of a tampered profile.
- `pnpm build` → exit 0; `dist-electron/chromium.js` and `chromium-rules.js`
  emitted alongside the existing main-process modules.
- **`pnpm verify:chromium` → PASS.** A disposable profile seeded with every
  field at a non-default value launched Chromium 152.0.7977.76 with
  `accelerated: false`, `gpu_compositing: disabled_software`,
  `--disable-smooth-scrolling`, and a service guest whose recorded preferences
  matched the seed exactly (JavaScript, images, WebGL, PDF, spellcheck and
  autoplay off, zoom 1.25). Its inline script never ran. Switching JavaScript,
  images and autoplay on, the colour scheme to light and zoom to 100% in the
  panel, then using **Rebuild open pages**, produced a guest with the new
  preferences: scripts ran, the image loaded, `prefers-color-scheme: light` was
  true, the silent `<audio>` element reported `played`, and a fresh-origin
  browser tab attached the default zoom `1`.
- **Limits:** launch switches were proven by the switch list for one launch, not
  by restarting twice; PDF rendering, spellcheck suggestions and hidden-page
  throttling were verified as attached preferences rather than by inspecting
  output or CPU; per-origin zoom memory means a rebuilt page on an already
  zoomed site keeps its level, which the panel copy states.
- `pnpm capture` → exit 0; twenty-five 1440×900 PNGs from the running app,
  including the new `screenshots/settings-chromium.png`.

## Verified evidence (2026-10-20, Vexium assistant)

- `pnpm test` → exit 0, 172/172 passed, including `tests/assistant.test.ts`:
  the loopback address rule (and parity between the renderer copy and the
  main-process gate), message sanitizing limits, SSE delta parsing, model-list
  parsing and assistant settings defaults.
- `pnpm typecheck` → exit 0 for renderer and main.
- **Stand-in runtime harness.** A local HTTP server speaking the same
  OpenAI-compatible API as Ollama/LM Studio (`/v1/models`,
  `/v1/chat/completions` with `stream: true`) was started on
  `127.0.0.1:11434`; the built app probed it, listed `llama3.2` and `qwen3`,
  streamed a 22-delta reply into the view and sent
  `{ model: 'llama3.2', messages, stream: true }`. `assistantProbe` refused
  `http://192.168.1.9:11434` and `https://127.0.0.1:11434` with
  `invalid-url`.
- **Limit:** no real Ollama or LM Studio install was present on this machine,
  so model quality, latency and long-context behaviour were not measured. The
  screenshots in `screenshots/assistant.png` and
  `screenshots/settings-assistant.png` were taken against that stand-in.

## Verified evidence (2026-10-20, browser identity and translations)

- `pnpm typecheck` → exit 0; `pnpm test` → exit 0, **258/258** in 27 files.
- `pnpm verify:identity` → **PASS**: a real guest reported
  `Google Chrome / Chromium / Not(A:Brand`, platform `Windows`, a full version
  list through `getHighEntropyValues`, and `Sec-CH-UA` headers on the wire with
  no Electron token. Fingerprint farbling was provably active (2 of 256 pixels
  perturbed) while `Function.prototype.toString` still reported native code for
  every wrapper: a closure that previously leaked its JavaScript source.
- **Google sign-in probe (not a pass/fail).** With that identity, a guest
  navigated to `accounts.google.com/ServiceLogin` and Google served the sign-in
  form (`input[type=email]` present, no refusal card). A full sign-in was not
  attempted: that needs real credentials, and the refusal some users hit appears
  at a later step or on a stale stored session.
- Translations: the shield filter editor, model-file runner and sign-in notice
  are localized in es/de/fr through `src/lib/i18n-extras.ts`; `tests/i18n.test.ts`
  covers one key per feature per language and the English fallback.
- **Limits:** no Google account was signed in, so a completed sign-in inside a
  module is still unverified; Google can change this gate at any time.

## Fixed (2026-10-20, service sessions across restarts)

- `verify-service-engine` failed at HEAD, not at the new code: the window closed,
  the app quit with code 0, and the service partition still came back signed out
  on relaunch. Inspecting `.tmp-service-engine-profile/Kryvex/Partitions/
  svc-s-verify/Network/Cookies` after that quit showed no cookie row at all, so
  Chromium was never writing the store: a session cookie set minutes before a
  quit is exactly the case a real sign-in hits.
- Fix: `serviceSessions.flush()` flushes the default session and every tracked
  `persist:svc-*` partition's cookie store; `before-quit` defers the quit until
  that finishes, capped at 1.5 s so a wedged store cannot trap the app.
- Evidence: `node scripts/verify-service-engine.cjs` → **PASS**, including
  `cookie after restart: "kx=session-ok"` and the per-service clear; `npm run
  typecheck` exit 0; `npx vitest run` 260/260 in 27 files.
- Renderer copy audit: `scripts/audit-i18n.cjs` (`npm run audit:i18n`) scans JSX
  text and human-facing attributes for strings that bypass `t()`. It found one
  pair of untranslated `aria-label`s on the developer credit links (now
  `{name} on GitHub` in es/de/fr); the edition marks are brand names and stay as
  written. `tests/i18n.test.ts` runs the audit so a hardcoded sentence fails CI.

## Verified evidence (2026-10-20, up-to-date verdict)

- `npm run typecheck` → exit 0; `npx vitest run` → exit 0, **261/261** in 27
  files; `npm run build` → exit 0.
- `node scripts/verify-updater.cjs` → **PASS**. The harness gained a feed that
  serves the running version: the status became `current`, the panel rendered
  `.update-verdict` with the text `UP TO DATE`, an SVG check, and
  `.update-status.is-current`, and the verdict's computed colour equalled a
  probe painted with `var(--success)` (`rgb(74, 222, 128)` in Kryvex Dark)
  rather than a hardcoded hex.
- `npx electron scripts/verify-local-model.cjs` → **PASS**: `.gguf` accepted,
  non-GGUF refused, stand-in runtime started on loopback, `/v1/models`
  reported it, a reply streamed, `stop()` ended the process.
- **Limit:** the toast raised by a manual check was exercised through the code
  path and types, not by clicking it in a packaged build; the panel screenshot
  came from the source checkout (`BUILD SOURCE`).

## Verified evidence (2026-10-20, shield filters and local model)

- `pnpm test` → exit 0, **255/255** in 27 files, including
  `tests/shield-rules.test.ts`, `tests/local-model-rules.test.ts` and
  `tests/signin.test.ts`.
- `pnpm typecheck` → exit 0; `pnpm build` → exit 0.
- `pnpm verify:shield-filters` → **PASS** against the real engine: 122,097
  network filters downloaded, a custom list compiled from the cached copy
  without the network, the scriptlet gate held back exactly one rule while
  trust was off, a custom cosmetic rule hid an element inside a live
  `<webview>`, a custom scriptlet ran in the page's main world, a custom
  network rule blocked the request before the test server saw it, the YouTube
  bundle produced scriptlets for youtube.com only, and clearing the editor
  rebuilt the engine.
- `pnpm verify:model` → **PASS**: a placeholder `.gguf` plus
  `scripts/fake-llama-server.mjs`; a non-GGUF path was refused, the runtime
  started on loopback, `/v1/models` reported the file name, a streamed chat
  reply arrived, and `stop()` ended the process.
- Capture of the two new panels (`settings-my-filters`, `settings-local-model`)
  from the running app confirmed the layout and live shield state.
- **Limits:** no real GGUF or GPU was available, so inference speed was not
  measured; no Discord session was signed in, so the parked-heartbeat change
  is verified only as configuration (guest throttling off) rather than by
  watching a gateway stay connected; Google's sign-in refusal was not waived:
  Kryvex detects and explains it.

## Verified evidence (2026-10-20, service engine)

- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0, **151/151** in 18 files.
- `pnpm build` → exit 0; 533.68 kB JS (159.67 kB gzip), 61.77 kB CSS.
- `pnpm capture` → exit 0; all twenty-four routes from the running app, including
  `settings-custom` (the Custom colour studio, opened by clicking the tile).
- `pnpm verify:updater` → **PASS**; an available update was detected from a
  loopback feed, a wrong SHA-256 was rejected as `checksum-failed`, the corrected
  download reached `ready` with the Install action, and a source-mode build
  reported the release without offering an install.
- Packaged capture → exit 0; `release/win-unpacked/Kryvex.exe` (version 0.6.0,
  `NotSigned`) completed all twenty-four routes in a disposable profile.
- XiØN theme probe → pass; the built app applied `data-theme="special-xion"`,
  the progress fill reported the `xion-liquid` gradient animation (2.8s, accent
  blue → soft blue → ink), the blade mark reported `xion-glow`, and the plugin
  card kept its own `#33B5E5` mark colour while the rest of the UI inherited the
  theme accent.
- `node scripts/verify-service-engine.cjs` → **PASS**. One fixture service in an
  isolated profile stayed mounted with the same `window.__marker` and cookie
  across a switch to Services; its timer advanced from 1 to 16 ticks while
  hidden; the partition kept its cookie after a full relaunch; the guest gained
  notification permission while a browser tab was denied; an auth popup shared
  the service cookie; `(7) Fixture` produced 7 in the toolbar, 7 on the sidebar
  pin and `(7) Kryvex`; the toolbar lock button cleared the session to an empty
  cookie; the guest reported a Chrome UA with no Electron token; and the stage
  measured 1192×824 with a 1192×770 guest, `overflow: hidden`.
- Real Discord/WhatsApp/Telegram sign-in was not performed; server-side token
  invalidation cannot be overridden by a client.

## Verified evidence (2026-10-19)

- `pnpm typecheck` → exit 0 (renderer and main, strict TypeScript).
- `pnpm test` → exit 0, 110/110 passed.
- `pnpm build` → exit 0; `dist/assets/index-*.js` 468.11 kB,
  `index-*.css` 54.02 kB; `dist-electron/` main + preload emitted.
- `pnpm capture` → exit 0; seventeen 1440×900 PNGs regenerated from the
  running Electron window in a disposable profile (`home`, `help`, `services`,
  `add-service`, `service`, `browser`, `browser-downloads`, `browser-history`,
  `settings`, `settings-data`, `settings-shield`, `settings-browser`,
  `settings-wallpaper`, `settings-about`, `donkey-theme`, `command-palette`,
  `light-theme`).
- `pnpm verify:restart` → pass; theme, start view and an open tab survived a
  real close/relaunch, including a change made immediately before close. A URL
  passed on the command line opened beside the restored tab.
- `pnpm verify:downloads` → pass; a completed download was written under a
  chosen folder, the location was changed again, the record reloaded in a
  fresh manager, deleted with its file, and stayed gone after another reload.
  The location reset back to Downloads and the torrent root followed it.
- `pnpm verify:torrents` → pass; a real `.torrent` and magnet were persisted
  across a download-location change, restored as two paused rows in a fresh
  manager with no WebTorrent client, hydrated on Resume, downloaded again, and
  removed with their folders and saved metadata. The old row remained valid
  after the root moved.
- `pnpm verify:location-ui` → pass; the built app showed the seeded custom
  folder in **Settings → Data**, offered Change folder and reset, and reset the
  live path and bridge value to the real Downloads folder. The same harness
  passed against `release/win-unpacked/Kryvex.exe` after
  `electron-builder --dir` rebuilt the unpacked app.
- `pnpm verify:torrent-restore-ui` → pass; the built app opened with a seeded
  queue and the Downloads hub rendered the restored row as `Paused` with a
  `Resume` action, no active speed and zero peers.
- `pnpm verify:browser` → pass; find-in-page reported `1 of 3`, zoom reached
  110% on the live webview and reset to 100%.
- Setup build → exit 0; produced `release/Kryvex-Setup-0.5.0-x64.exe`
  (`991be75a…3206`, 114.5 MiB) and `release/Kryvex-Portable-0.5.0-x64.exe`
  (`42cc1530…89c8`, 114.3 MiB). Both report version 0.5.0 and `NotSigned`.
  The setup installed silently to a custom temporary folder, and the installed,
  portable and unpacked builds each completed all seventeen capture routes;
  the packaged app also passed the download-location UI harness. A seeded
  queue rendered the restored torrent as paused with a Resume action in the
  unpacked, portable and installed builds. Silent uninstall removed the
  folder, both shortcuts and the uninstall entry.
- Download-manager harness → exit 0; completed file path, exact bytes,
  collision-safe second filename, remove-record and delete-file all verified.
- Torrent harness → exit 0; loaded the built main-process manager and
  WebTorrent in Node with a path shim, added a real `.torrent` and magnet,
  transferred bytes from a loopback seeder, reported live seeder counts,
  paused/resumed, and deleted the managed folder. A fresh manager then restored
  both rows as paused with zero live counters and no client, hydrated each only
  on Resume, verified the local pieces, transferred again, and removed both
  folders and saved metadata.
- Torrent IPC/UI harness → pass; `window.kryvex.torrentsAddMagnet` rendered one
  row in the Downloads hub with protocols and stats, and removal cleared it.
- Media-permission harness → pass; a real webview `getUserMedia({audio,video})`
  reached the shell prompt, Allow produced two tracks, Block stayed denied, and
  an untrusted origin inherited nothing.
- Privacy harness → pass; `https://example.com/?utm_source=kryvex&keep=1`
  became `https://example.com/?keep=1`, a local HTTP-only host served through
  `127.0.0.1.nip.io` settled on HTTP after the HTTPS attempt was refused,
  EasyList Cookie appeared in the roughly 121,700-filter engine, and canvas and
  WebGL readbacks were farbled, stable and restored to native output when the
  fingerprint toggle was turned off.
- Default-browser harness → pass; status, http(s)-only argv filtering, queued
  URL drain; dev run did not change the system default.
- Live module probe: `https://sohbet.xiondigital.net/` loaded with
  `loading: false` inside a `persist:svc-*` webview.
- Repository scan: no tracked `node_modules`, build output, temporary checkout,
  env files or credential patterns; README image references all resolve.
- Dev-only Vite defect found and fixed: brand JSON cannot be imported while
  `brand/` is configured as `publicDir`; `publicDir` is now disabled, the logo
  is imported through `src/assets.ts`, and the window icon path is resolved
  relative to the compiled main entry. Dev host pinned to IPv4.
- Non-capture `pnpm dev:electron` was started repeatedly; Electron ran and
  printed its DevTools endpoint. Renderer content in dev was **not** captured
  visually (production captures are the visual evidence).

## Known gaps

- Windows only; no macOS/Linux run or platform icon sets.
- No code-signed installer. Updates verify SHA-256 against the release's own
  checksum list; that does not prove publisher identity. Portable and git
  builds never self-replace, and there is no delta, beta or rollback channel.
- No module hibernation. The browser keeps per-tab zoom for the current
  session; the engine panel's default zoom only seeds origins without a stored
  zoom level, and there is no UI to clear a single site's zoom yet.
- Torrent rows restore paused, but there is no bandwidth scheduler, ratio
  limit, per-file selection or router port mapping.
- Microphone/camera grants are per origin for the current app session only.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
- HTTPS upgrades cover top-level GET navigations only; no interstitial warning
  or full mixed-content policy. Safe Browsing is not implemented because
  Electron does not expose Chromium's protocol.
- State persistence now has a real close/relaunch harness, but it covers
  settings, start view and browser tabs rather than every view's transient UI.
- Some third-party services resist embedding (strict SSO, user-agent checks,
  or a server-side session reset); “Open externally” is the supported escape
  hatch. Discord's own token invalidation is outside the app's control.
- Client-mod injection is deliberately not shipped; compounds and a gated
  emulator are designed but not built (see
  `docs/PLATFORM_PLAN.md`). Local models ship as the GGUF runner above; the
  installer now includes the llama.cpp CPU runtime, while weights remain a
  separate, reviewed download.
- Notifications are all-or-nothing for service modules; there is no per-service
  mute or notification history in the shell yet.
- “Kryvex” clearance unresolved (above).

## Next concrete action

0.9.4-hotfix.1 is the first hotfix of 0.9.4, cut from the `v0.9.4-hotfix.1` tag:
the version line stays at 0.9.4, the build wears `-hotfix.1`, and the packaged
`ProductVersion` is still `0.9.4.0` with the suffix in `FileVersion`. It carries
two Home-board corrections. The world clock lists looked-up cities rather than
zones — a user in İzmir reads **İzmir**, not Istanbul — each row can be removed,
and a 12/24-hour switch drives both the card and the board header. The "quick
capture" inbox, which stored typed lines and never removed them, is replaced by a
screen capture and recorder that targets an open service, a window or a screen,
takes a still or a clip, and writes the file through a native save dialog in the
main process. See `docs/RELEASE_0.9.4-hotfix.1.md`.

0.9.4-hotfix.1 is published from the `v0.9.4-hotfix.1` tag (workflow run
[40338277766](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40338277766),
commit `c2cb7cc`): stable and marked **Latest**, so an installed 0.9.4 is offered
it, with the Setup (134,363,017 B, `c8ff3374…7982e5`), the Portable (134,125,865
B, `3df2e0b5…3876856`) and `SHA256SUMS.txt` (207 B). The `web` job republished
the client, so `https://xiondigital.net/Kryvex/` serves this machine's bundle
(`assets/main-DEX2m-Ju.js`, `assets/main-BKKSMrRQ.css`), reports
**v0.9.4-hotfix.1** and caches `kryvex-web-0.9.4-hotfix.1-v1`. Next: a real
capture and a recorded clip saved through the dialog on an installed hotfix
build, and the phone pass Kyvex Link still owes.

0.9.4 is a feature release, so it moves the version line rather than wearing a
`-hotfix.N`. It is cut from the `v0.9.4` tag with the Setup, Portable and
checksum assets, and it carries **Kyvex Link**: the desktop serves one small page
on the local network, a phone pairs with a six-digit code, and from then on it
has the clipboard in both directions, file transfer in both directions, a link
that opens a Kryvex tab, and a remote for the player. The link is off until its
switch is turned on, it binds private addresses only, and nothing leaves the two
devices. The batch also gives Lexium an in-house engine: transcription runs
through Vexium Core on this machine with no server to install, the external
Whisper path is kept for anyone who has one, and the service now explains how to
set that up instead of failing at a new user. Secret services moved behind a
collapsed tab that asks once before the tools appear, the emulator's EmulatorJS
GPL-3.0 notice is recorded and shown in its view, the Home calculator is sized to
the Board Guide card it sits beside, and a floating service window carries a
standard right-hand minimize / maximize / close cluster. See
`docs/RELEASE_0.9.4.md` and `docs/LINK.md`.

0.9.4 is published from the `v0.9.4` tag (workflow run
[40321535192](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/40321535192),
commit `758f485`): stable, with the Setup (134,356,680 B,
`ef7b19df…b81794fc`), the Portable (134,119,446 B, `02b76d0c…6a5f05b5`) and
`SHA256SUMS.txt`. The tag also rebuilt and republished the web client, so
`https://xiondigital.net/Kryvex/` serves the same bundle this machine built
(`assets/main-DW2l--5U.js`), reports **v0.9.4** and caches
`kryvex-web-0.9.4-v1`. Next: a real phone on the same network for the Link
pairing and touch layout, and a companion app if the web page is not enough.

0.9.3 was cut from the `v0.9.3` tag with the Setup, Portable and checksum assets:
a correction release for the Vexium Core button, which on a machine that already
held the 3B read "Downloading 0%" while it was only starting the server. The busy
label now comes from the press (`coreBusyState()` in `src/lib/vexium-core.ts`), so
the switch path reads **Vexium Core is starting…**; the docs now describe both
upgrade paths as measured, with **Install Vexium Core 3B · 1.96 GiB** before the
file is on disk and **Switch to Vexium Core 3B** after. Nothing else changed, and
the web bundle was rebuilt and republished at 0.9.3 (`gh-pages` commit `b471451`,
footer **v0.9.3**, cache `kryvex-web-0.9.3-v1`). From here the version line is
held: a small fix ships as a `-hotfix.N` of the release it patches
(`0.9.3-hotfix.1`), the tag itself now rebuilds and publishes the web client, and
1.0 is reserved for a major whose features all work out of the box. Policy:
`docs/UPDATES.md`.

0.9.2 is published from the `v0.9.2` tag with the Setup, Portable and checksum
assets, carrying Vexium Core as the assistant the app installs from a first run
(reviewed 3B weights, one identity prompt, deterministic maths/units/distance/
date tools) and the pinned-service drag that now works upward as well as down.
The core is fetched once from `XiONDiGiTaL/Vexium-Core` with its byte count and
checksum pinned in the app, so no weights are bundled and no other local runtime
is advertised on a fresh install. 0.9.1 was published from the `v0.9.1` tag with
emulator link play, floating service windows and the completed translation
sweep; installed 0.9.0 builds pick it up through **Settings → Updates**.
0.9.0 was published from the `v0.9.0` tag: Google hosts report the bare Chromium
agent with Chromium's own client hints and the `window.chrome` surface, which is
what moved Google from its reduced `WebLiteSignIn` flow to the regular
`GlifWebSignIn` one, and a Google service now finishes its sign-in inside its own
module instead of in a stray window. Verified against the live site (10/10 on
`pnpm verify:google`, five variants on `pnpm verify:identity-matrix`) and on the
installed build, where the Gmail module read `mail.google.com/mail/u/0/#inbox`
after a real sign-in with mobile verification. Next: confirm a fresh sign-in
end to end in the frame, then code signing.

0.8.8 is published from the `v0.8.8` tag with the Setup, Portable and checksum
assets, so installed 0.8.7 builds pick up the bundled llama.cpp runtime, the
rearrangeable Home widgets, the service-dock volume and repeat controls, and the
opt-in Spotify ad guard through **Settings → Updates**. 0.8.9 is published from
the `v0.8.9` tag, so installed 0.8.8 builds also pick up
Vexium Core as the local stack the app starts and names on its own page, Spotify
and YouTube playlist import in the player, the Google account-page sign-in fix,
and the Home calculator and ECB converter. That converter's endpoint moved to
`api.frankfurter.dev` after the published web build exposed the old host's CORS
failure; the web bundle was rebuilt and republished with the fix. The local EXEs
were exercised from `release/win-unpacked` against a copied profile — Vexium Core
started itself, the card went RUNNING → STOPPED → RUNNING, and a streamed reply
arrived — and the installed copy at `C:\Kryvex` showed 0.8.9 and started the
runtime on launch (`docs/TESTING.md`). The published assets match
`SHA256SUMS.txt`, and `gh-pages` serves 0.9.3 with the cache name
`kryvex-web-0.9.3-v1` (republished at 0.9.3 on 2026-10-25). Next:
code signing, the PWA client on Android (no APK),
and the compound manifest and permission sheet described in
`docs/PLATFORM_PLAN.md` before adding any branded add-on.
## Directive batch: services, player, rooms, currency, type, Lexium

The consolidated tester directive landed its foundational and Phase 1/2 work.
Service lifecycle, emulator saves and the HUD audit shipped earlier in this
branch; this batch adds the rest of what the report listed and stops short of
what needs a second machine or a native helper.

- **Currency**: the picker now offers the whole ECB set, TRY included, with a
  searchable menu; the card states the source (ECB reference via Frankfurter),
  the quotation date, the fetch time and a staleness warning, and distinguishes
  "the source does not quote this currency" (HTTP 404) from being offline.
- **YouTube**: the stage is a real 16:9 box, the embed overlay follows a
  ResizeObserver plus a slow reposition while it plays, and embed errors are
  reported by cause (owner disabled embedding, removed, referer, live).
- **Spotify**: a playlist row without an `audioPreview` is kept and labelled, so
  a modern playlist no longer imports as "no playable tracks"; a 403/429 from
  the provider reads as a refusal instead of a connection problem. Full tracks
  remain impossible in this shell: Spotify's Web Playback SDK needs Premium
  plus Widevine EME, and Electron ships no Widevine CDM.
- **Rooms**: one application-wide session, so switching service keeps the
  membership and the chat, with day separators, deduplicated messages on
  reconnect, an explicit Reconnect, late-join stream renegotiation, share audio
  mute, stream volume, size, fullscreen, pop-out fallback, local audio monitor,
  a draggable and resizable translucent chat overlay, and opt-in remote control
  that injects real input into a shared Kryvex app (screen captures need a
  native helper and say so).
- **Visualizer**: five modes, a level control, album art and a YouTube thumbnail
  fallback, drawn from a cached Web Audio graph for the audio Kryvex decodes.
- **Typography**: one scale and one curated family in Settings, applied by
  rewriting the six size tokens so nothing is downloaded and layouts reflow.
- **Pinned order**: drag with an insertion rule, plus Alt+Arrow for the keyboard,
  persisted by reordering the service list itself.
- **Lexium**: transcription and the health check run in the main process, which
  is what fixes "the server cannot be reached" — a `file://` renderer sends
  `Origin: null` and a local Whisper server need not answer a CORS preflight.
  Failures now name the address, the HTTP status and the server's own message.
- **Translation**: a coverage test measures every `t()` literal in three
  languages; the new copy is translated and the historical backlog is recorded
  in `docs/I18N.md` with a ratchet so it cannot grow.

Still open from the directive: emulator netplay (needs a deterministic two-client
transport and a second machine to prove it), movably resizable Workspace
windows, per-service pinnable secret tools, and a translation sweep of the ~380
pre-existing strings. Remote control is limited to Kryvex app captures, and the
rooms evidence is code plus single-client checks only.

## Directive close-out: link play, floating modules, translation sweep

The last three items the tester directive left open are in, and the batch that
preceded them was verified again rather than assumed.

- **Emulator link play.** Two copies of Kryvex play one cartridge through the
  Rooms transport, with no relay of ours. The host sends the cartridge once
  (base64 chunks, reassembled only when every chunk arrived), streams its own
  pad, and hands the guest a save state every 1.5 s; the guest restores those
  checkpoints and streams its pad back. Both cores see two standard-mapping
  pads even when the machine has one controller, because the frame's
  `navigator.getGamepads` is patched for the session and restored afterwards.
  Seats, chunk assembly and the pad packing are pure functions in
  `src/lib/netplay.ts` with tests; `electron/party.ts` carries the action.
- **Floating modules.** Any open service can be detached from the stage into a
  movable, resizable window that stays over the workspace while another view is
  used. The `<webview>` is never re-parented, so the session, media and scroll
  position survive the move. Geometry rules (minimum size, title-bar
  reachability, cascade, resize) are in `src/lib/floating.ts` with tests.
- **Translation sweep.** The historical backlog is translated: the counts fell
  from 383/408/395 to 41/68/56, and the remainder is a documented list of
  product names, protocol tokens, units and words that are already the same in
  the target language. See `docs/I18N.md`.
- **Verification.** `npm run typecheck` is clean for both projects, `npm test`
  is 679/679 across 66 files, and the production renderer build succeeds.

Still open, unchanged: code signing, a real two-machine link-play session and a
second account for the Google sign-in path, remote control beyond Kryvex's own
captures, and the per-service pinnable secret tools.
