# Kryvex 0.7.0: Windows release

Released 2026-10-20. This release adds Rooms, the Vexium local assistant, a real
Chromium engine panel, a first-run theme gallery, an opt-in wallpaper backdrop
and a window that fits the display it opens on.

Download the installer, portable build and checksum list from the
[Kryvex 0.7.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.7.0).

## Highlights

- **Rooms:** create a room, copy one invite and everyone who opens it lands in
  the same place. Presence with a chosen name and colour, ephemeral text chat
  and screen share of a whole screen, a single window or one Kryvex app.
  Recent rooms bring a group back. There is no account and no Kryvex-owned
  server in the media path: the invite link is the whole access model. File
  drop, voice and co-watch are not built yet.
- **Vexium, a local assistant:** a first-party chat surface that talks to a
  model runtime you already run (Ollama or LM Studio) over loopback. The
  renderer never contacts the model server; the main process normalizes every
  address, rejects anything that is not loopback, streams SSE deltas and keeps
  no transcript on disk. No account, no key, no bundled weights.
- **Chromium engine panel:** Settings exposes the switches Chromium actually
  boots with (hardware acceleration, smooth scrolling) and per-page
  preferences (JavaScript, images, WebGL, PDF viewer, autoplay, background
  throttling, spellcheck, colour scheme, default zoom). A live report shows the
  engine version, GPU state, launch switches and what each open guest attached.
- **First look:** a fresh install opens a family gallery (eight bands, nine
  mock workspaces) so you compare looks before committing. Previews never
  apply; clicking a theme does. Profiles that predate the gallery are marked as
  seen, so an upgrade never interrupts.
- **Wallpaper on your terms:** the backdrop is off by default and the active
  theme paints the window. Turn it on for a **theme wash** built only from that
  theme's accent tokens, or choose your own image with a veil and fill/fit/tile.
  The image is re-encoded to a bounded WebP and stays on the machine; only the
  switch, source, fit and veil are stored in the state file.
- **Fits your screen:** the window opens at the display's work area instead of a
  fixed 1440×900, keeps a real 900×520 floor, and `verify:layout` sweeps ten
  window sizes across six views to prove no panel clips its own content.
- **Planets retuned:** Uranus is now a pale, eerie ice teal (`#8DDDE2` ground,
  `#3F8E92` accent), Turquoise a pale mint and Neptune a vivid navy: 78
  catalogue themes in eight families plus two creator plugins and the Custom
  slot.

Everything from 0.6.0 is included: kept-alive service apps with native
notifications, unread badges, sign-in popups and per-service session clearing;
the 27-service catalogue; in-app updates with mandatory checksum verification;
the browser library, find/zoom, session restore, Brave-style privacy
protections, media permission prompts, the persisted torrent queue, Chrome
extension loading and the download-location picker.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.7.0-x64.exe` |
| `Kryvex-Portable-0.7.0-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry. Exact sizes are listed on the release page.

## Install

1. Run `Kryvex-Setup-0.7.0-x64.exe`.
2. Choose the destination folder in the normal Windows wizard.
3. Add services from **Services → Add**, or start from a catalogue preset.
4. Pick a theme in **Settings → Appearance**, or let **First look** preview the
   families first.
5. Use **Settings → Updates** to confirm the updater sees this release.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

Run from the complete 0.7.0 working tree on Windows with Node 24.19.0,
Electron 44.2.0 and pnpm 12.3.4.

- `pnpm typecheck`: exit 0 for renderer and `electron/`.
- `pnpm test`: exit 0, **223/223** tests across 24 files.
- `pnpm build`: exit 0 for the renderer and main process.
- `pnpm capture`: 27 routes from the running window, including `rooms`,
  `theme-gallery`, `settings-chromium` and `settings-wallpaper`.
- `verify:layout`, PASS at 2560×1400, 1920×1080, 1440×900, 1366×768,
  1280×720, 1104×720, 1040×680, 960×640, 900×600 and 900×520, plus the
  first-run sheet at four sizes.
- `verify:rooms`, two real app instances joined one room through the invite
  hash; presence, chat and a 2560×1440 screen share decoded.
- `verify:theme-gallery`, the first-run sheet renders eight family cards,
  previews without applying, applies on click and stays dismissed after reload.
- `verify:wallpaper`, the backdrop starts off, the wash follows a changed
  theme accent, a real file import paints the shell, and off survives a reload.
- `verify:chromium`, engine switches and page preferences reach real guest
  webviews.
- `verify:updater`, the loopback release feed produced
  `available → checksum-failed → ready`, and source-mode builds refused to
  install a binary.

Per-pass details, including the bugs each harness found and the checks that
were **not** run, are in [TESTING.md](TESTING.md).

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an unknown
  publisher; no code-signing certificate is configured.
- Rooms was verified with two instances on one machine and one screen. Two
  machines across the internet, a forced-TURN peer, a three-viewer room and
  system-audio capture were not exercised. File drop, voice and co-watch are
  not implemented.
- Vexium requires a local runtime the user installs and runs; no model is
  bundled and no cloud fallback exists.
- Windows 10/11 requires the user's final confirmation in Default Apps. Kryvex
  cannot silently become the default browser.
- Torrents restore paused but there is no bandwidth scheduler, ratio limit,
  per-file selection or router port mapping.
- Windows x64 only in this build. macOS and Linux were not exercised.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
