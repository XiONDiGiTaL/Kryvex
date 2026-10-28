# Kryvex 0.8.6: Windows release

Published 2026-10-22 from the `v0.8.6` tag. This release turns the browser's
blank tab into a designed start page, adds private tabs and an RSS/Atom reader,
and gives the service surface the desktop behaviour it was missing.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.6 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.6).

## What changed

- **A real start page, with a home button.** The leftmost toolbar control returns
  the active tab to `BrowserStart`: a Shield card with live session counters
  (blocked requests, compiled filters, HTTPS upgrades, stripped tracking
  parameters, list count and update date), a five-step field guide, quick launch
  for modules and bookmarks, and a local reading list. It is a renderer view,
  not a blank `about:blank`, and it scrolls inside the browser canvas.
- **Private tabs.** The browser options menu and `Ctrl+Shift+N` open a tab with
  the mask in the tab strip and a private start-page variant. Private tabs write
  no Kryvex history, are excluded from `browser.tabs` on disk, and can be closed
  together from the menu. Downloads still reach disk, as in Chromium. Every
  browser tab already uses an in-memory partition; private mode adds the
  no-history and no-restore guarantees rather than a second isolation model.
- **RSS and Atom on the start page.** Paste a feed URL or import an OPML export.
  Up to 12 feeds are kept in `PersistedState.feeds`; stories merge newest-first
  and duplicate links are shown once. The main process fetches feeds (so the
  renderer is not blocked by CORS) with a 10-second timeout, a generic user
  agent, http(s)-only URL checks and a 2 MB cap. `src/lib/rss.ts` handles CDATA,
  entities, Atom alternate links, relative URLs, permalink GUIDs and missing
  channel titles, and strips all feed markup to text.
- **Browser options menu.** New tab, new private tab, home, downloads, history,
  bookmarks, close private tabs and Shield settings in one keyboard-accessible
  menu. The tab strip marks private tabs and the address bar changes its
  placeholder.
- **Service surface pass.** Activity now reports only Kryvex's own CPU and
  memory against installed RAM; its panel closes on Escape, its close button or
  an outside click. Right-clicking a pinned service opens a themed menu for
  editing, removing, muting, notifications, background behaviour and unpinning.
  Parked services use opacity instead of `display: none`, so YouTube, Spotify and
  Discord keep playing and connected, and their audio raises a transport dock
  above the status bar. Details: [SERVICE_UX.md](SERVICE_UX.md).
- **Shield.** A versioned YouTube bundle prunes stitched ads, and extra filter
  sources are covered by the same session listener. The packaged window sets the
  Kx icon explicitly.
- **Windows notifications.** The installed app keeps
  `net.xiondigital.kryvex`; a source run uses `net.xiondigital.kryvex.dev`.
  A toast click now restores and focuses the window through the activation hook.
- **Vexium starter model.** Settings → Vexium → Download models can fetch one
  reviewed starter model. Publisher, pinned revision, exact byte size, SHA-256,
  licence, quantisation and estimated memory are shown before the download
  starts; the file is streamed to a `.part` and only renamed after size and
  checksum match.
- **Translations.** The start page, private tabs, feed reader and options menu
  carry English, Spanish, German and French strings. `pnpm audit:i18n` is clean
  over 34 renderer files.

Everything from 0.8.5 is included: Lexium, the media player, the emulator tile
language, the 0.8.4 Home board/resource/VPN work and the 0.8.3 browser and
session fixes.

## Artifacts

Built by the tag-triggered workflow (run
[39790930314](https://github.com/XiONDiGiTaL/Kryvex/actions/runs/39790930314),
commit `f363745`) and attached to the published, stable
[v0.8.6 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.6):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.6-x64.exe` | 120,482,947 B (114.90 MiB) | `5eb83690fb88b32efdaaa241b5c07f6716a63083b832b85de1331a41276726ad` |
| `Kryvex-Portable-0.8.6-x64.exe` | 120,245,815 B (114.67 MiB) | `23cb563e7589d2ecdb96064fd435f12a270fa9db392cdace2d56d6d7641bdf03` |

`SHA256SUMS.txt` (189 B) carries both digests. The updater ignores a release
whose installer has no matching entry. Both EXEs are **unsigned**.

## Install

1. Run `Kryvex-Setup-0.8.6-x64.exe`, or let an installed 0.8.5 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay.
3. The Portable EXE runs without installing. Its state still lives in
   `%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck`: exit 0 for the renderer and `electron/` (strict).
- `npx vitest run`: exit 0, **444/444** tests across 45 files.
- `npm run build`: exit 0; renderer and main rebuilt before packaging.
- `npm run audit:i18n`, clean, no hardcoded UI strings in 34 renderer files.
- `node scripts/verify-browser-start.cjs`: PASS against the built Electron app
  with an isolated profile and a local fixture server: four start-page cards,
  home button as the first toolbar control, RSS through the visible form, OPML
  through the real file input, options menu, private marking, no private history,
  no private tab in `kryvex-state.json`, ordinary history recorded, private tabs
  closed together, no feed errors. Electron `Page.captureScreenshot` produced
  `screenshots/browser-start.png` and `screenshots/browser-private.png` without
  any overlay.
- Local `electron-builder --publish never` with the pnpm 10 shim and
  `--config.electronDist=node_modules/electron/dist`: produced both 0.8.6
  EXEs. The Setup reports `ProductVersion 0.8.6`; the installed pilot binary
  now reports `0.8.6.0` after the wizard run.
- **Published artifacts.** The release workflow passed every step (tag/version
  check, release record, install, typecheck, 444 tests, the one-time-code relay,
  packaging, checksums) and published a stable, non-draft release with the
  Setup, Portable and `SHA256SUMS.txt` assets. Both EXEs were downloaded from
  `releases/download/v0.8.6/`, and their sizes and SHA-256 digests match the
  published checksum file.
- **Published build exercised, not just hashed.** The published Portable EXE
  was launched with `--remote-debugging-port` and an isolated profile:
  `window.kryvex.appInfo()` returned `{version: "0.8.6", electron: "44.2.0",
  chrome: "152.0.7977.76", node: "24.20.0", packaged: true}`, and `#/browser`
  rendered the start page with its four cards.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.8.6-x64.exe --version 0.8.6`, PASS: four pages
  captured, the install page ran for 18,427 ms, the installer exited 0, and the
  capture was archived under `docs/media/releases/0.8.6-wizard/`.
- The installed `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.8.6.0`. It was
  launched with an isolated profile: `window.kryvex.appInfo()` returned
  `{version: "0.8.6", electron: "44.2.0", chrome: "152.0.7977.76", node:
  "24.20.0", packaged: true}`; the browser start page reported the Home button
  first, all four cards and the options menu. Capture:
  [screenshots/release-0.8.6-installed-start.png](../screenshots/release-0.8.6-installed-start.png).
- `node scripts/check-release-record.cjs`: PASS for 0.8.6.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. The capture comes from the locally built 0.8.6 installer before any
tag, and is committed with this record:
[capture.md](media/releases/0.8.6-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.6-wizard/pages/01-Choose%20Installation%20Options.png) | “Who should this application be installed for?”; “There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade.” |
| 2 | [Choose Install Location](media/releases/0.8.6-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; “Space required: 421.9 MB” |
| 3 | [Installing](media/releases/0.8.6-wizard/pages/03-Installing.png) | “Please wait while Kryvex is being installed.”; “Kryvex 0.8.6” |
| 4 | [Completing Kryvex Setup](media/releases/0.8.6-wizard/pages/04-Completing%20Kryvex%20Setup.png) | “Kryvex has been installed on your computer. Click Finish to close Setup.” |

The run took 32,912 ms end to end and the installer exited 0. Scripts that the
installer relaunched were closed by the harness afterwards, so the capture left
no stray instance.

The capture was re-recorded on 2026-10-27 with two corrections to how it is
taken: a page is no longer filed under a picture of the page that replaced it,
so the installer's transient **Installation Complete** page is not listed, and a
picture is kept only once the page has stopped painting.

## Mobile / APK

Kryvex is an Electron desktop application; Electron does not produce an Android
APK. The same React renderer has a separate PWA build (`pnpm build:web`) that
installs from Chrome on Android through **Add to Home screen**, documented in
[WEB.md](WEB.md). No APK is attached to this release because building one would
mean shipping a second, WebView-only client rather than this application. The
web client deliberately reports which desktop-only surfaces (Shield network
filtering, embedded sessions, torrents, VPN, local models, screen sharing) are
unavailable.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The start page's feed fetcher is desktop-only. In the web preview it falls
  back to the browser's `fetch`, so a feed that does not send CORS headers is
  reported as unavailable.
- Private tabs share the existing in-memory per-tab session model. They are not
  a separate process or a Tor-style anonymity claim, and downloads remain on
  disk.
- Reading a feed is not a subscription service: there is no unread counter,
  background polling or notification when a feed changes. The list refreshes
  when the start page mounts or when Refresh is pressed.
- The service surface, notifications and model manager were exercised by their
  own harnesses in earlier batches; this release's live run covered the browser
  start page, private tabs, feed import and options menu end to end.
- macOS and Linux were not exercised.
