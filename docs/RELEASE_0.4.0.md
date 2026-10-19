# Kryvex 0.4.0 — Windows release

Released 2026-10-19. This release turns the browser into a full workspace
library and adds the privacy, calling and torrent features built after 0.3.0.

Download the installer, portable build and checksum list from the
[Kryvex 0.4.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.4.0).

## Highlights

- **Browser library:** Downloads, History and Bookmarks tabs beside the page.
- **Download manager:** live progress, pause/resume, cancel, open file, show in
  folder, remove, clear finished, and delete-file for files saved in Downloads.
  Finished history is persisted in `userData/kryvex-downloads.json`, so the
  library survives a restart; anything interrupted by quitting is marked
  interrupted rather than shown as still running.
- **Restored sessions:** open browser tabs and the active tab are saved with the
  workspace and reopen by URL after a restart. Browser tab partitions remain
  in-memory, so sign-in state is not carried over.
- **Find and zoom:** `Ctrl F` opens find-in-page with match count and
  next/previous; `Ctrl +`, `Ctrl -` and `Ctrl 0` step or reset page zoom, with
  the current percentage visible in the toolbar.
- **History:** searchable, persisted, capped at 500 entries, with per-entry
  removal and clear-all confirmation.
- **Bookmarks:** the existing bar plus a full library list with open/remove.
- **Default browser:** installed Windows builds register per-user Default Apps
  capabilities for `http` and `https`, open Windows Default Apps for
  confirmation, and accept links passed on the command line.
- **Privacy protections:** top-level HTTP navigations try HTTPS first and fall
  back once; tracking and campaign parameters are stripped; canvas, WebGL and
  audio readbacks receive stable per-site noise; EasyList Cookie joins the
  shield lists. HTTPS upgrades, tracking stripping and fingerprint farbling
  have independent switches and session counters in **Settings → Shield**.
- **Calls:** sites can request the microphone and camera through a visible,
  origin-scoped Kryvex prompt; other permissions remain denied.
- **Torrents:** magnet links and `.torrent` files open in the Downloads hub with
  live peers, speeds, ratio, protocols, trackers and file lists. A persisted
  queue now returns after a restart as **paused** rows; no client, discovery or
  transfer starts until **Resume**, which rehydrates the saved `.torrent` or
  magnet and rechecks local pieces.
- **Extensions:** install Chrome-compatible extensions from a Web Store page,
  `.zip`, `.crx` or folder, then enable, disable or remove them.
- **Cleaner docs:** obsolete reference-analysis documents were removed; Kryvex
  is documented as an independent application.

## Artifacts

Built with `pnpm run package:win` under `release/` (ignored by Git) and
attached to the GitHub release:

| File | Size | SHA-256 |
| --- | ---: | --- |
| `Kryvex-Setup-0.4.0-x64.exe` | 114.6 MiB | `e2df87d084518c2cb1106989acb814d2c08357e2bff38d13352448c6ce480735` |
| `Kryvex-Portable-0.4.0-x64.exe` | 114.3 MiB | `6534a06fc9d9dc1fc42dc428bb416a1b730b626b84a5e9d940048876dbf15165` |

The release checksum list is `SHA256SUMS.txt`.

## Install

1. Run `Kryvex-Setup-0.4.0-x64.exe`.
2. Choose the destination folder in the normal Windows wizard.
3. Launch Kryvex and use **Browser → Downloads / History / Bookmarks**.
4. Open **Settings → Browser → Default browser** or the browser start page to
   register Kryvex and confirm it in Windows Default Apps.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

This release was rebuilt from the complete 0.4.0 working tree, including the
paused torrent-queue restore, then checked against the packaged EXEs.

- `pnpm typecheck` — exit 0 for renderer and main.
- `pnpm test` — exit 0, **103/103** tests.
- `pnpm build` — exit 0; 461.03 kB JS, 53.87 kB CSS.
- `pnpm run package:win` — exit 0; produced the two artifacts and checksums
  above.
- **Packaged app smoke:** the unpacked build, Portable EXE and installed app
  each launched as version `0.4.0`. With a seeded isolated queue, all three
  rendered the restored torrent as **Paused** with a **Resume** action, no
  active speed and no transfer. The queue row was hydrated only after an
  explicit Resume in the source harness.
- **Installed and portable capture:** the installed app and the Portable EXE
  each completed all sixteen 1440×900 capture routes.
- **Setup EXE:** silent custom-directory install exited 0; Desktop and Start
  Menu shortcuts and the `Kryvex 0.4.0` uninstall entry were present.
- **Uninstaller:** silent uninstall exited 0 and removed the custom install
  directory, both shortcuts and the uninstall entry, and left no running
  process.
- **Checksums:** `sha256sum -c release/SHA256SUMS.txt` reports OK for both
  0.4.0 artifacts.
- **Authenticode:** both EXEs report `NotSigned`.

The 0.4.0 source tree also passed the restart, download-history, torrent,
find/zoom, default-browser, Web Store extension, media-permission and privacy
harnesses recorded in `docs/TESTING.md`, including a real loopback torrent
transfer and a fresh-manager paused restore.

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an
  unknown publisher; no code-signing certificate is configured.
- Windows 10/11 requires the user's final confirmation in Default Apps. Kryvex
  cannot silently become the default browser.
- Downloads are saved to the Windows Downloads folder; there is no
  download-location picker yet.
- Torrents restore paused but there is no bandwidth scheduler, ratio limit,
  per-file selection or router port mapping.
- The interactive NSIS wizard was configured but the silent custom-folder path
  was the one exercised.
- Windows x64 only in this build. macOS and Linux were not exercised.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
- No auto-update or CI workflow is configured.
