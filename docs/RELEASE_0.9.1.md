# Kryvex 0.9.1: Windows release

Prepared 2026-10-25 for the `v0.9.1` tag. This release closes the tester
directive. It adds link play to the emulator, lets any service run in a movable
window over the workspace, and translates the historical backlog the coverage
audit had been counting rather than fixing. Everything in 0.9.0 is included,
including the Chromium sign-in identity and the Google module sign-in.

The assets are attached to the published, stable
[Kryvex 0.9.1 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.1).
This record and its wizard capture were committed before the tag, so the release
workflow had both to check (`pnpm release:check`).

## What changed

- **Link play in the emulator.** Two Kryvex copies play one cartridge through
  the Rooms transport that already carries chat and shares; there is no relay of
  ours. The host streams the cartridge in numbered base64 chunks, and a guest
  starts its core only once every chunk is present. Both seats exchange pad
  frames, and the host sends a save state every 1.5 s, which the guest restores
  as a checkpoint. The emulator frame patches `navigator.getGamepads` for the
  session so a machine with one controller still reports two standard-mapping
  pads, and restores the previous handler when the session ends. The panel says
  which seat you hold, and a cartridge over 16 MB is refused with the
  both-load-the-same-file option instead of failing mid-transfer. Rules:
  `src/lib/netplay.ts`; transport action: `electron/party.ts`.
- **Floating service windows.** Any open module can be detached from the stage
  with **Float this module** into a movable, resizable window that stays over
  the workspace while another view is used; **Dock this module** brings it back
  as the open view. The `<webview>` is never re-parented, so the session, media
  and scroll position survive the move. Geometry rules keep a title bar reachable
  from every corner, a minimum size, and a cascade for a second window; on a
  phone the detach button is hidden because there is only one screen. Rules:
  `src/lib/floating.ts`; UI: `src/views/ServiceStage.tsx`.
- **Translation sweep.** The historical backlog is translated in
  `src/lib/i18n-sweep-es.ts`, `-de.ts` and `-fr.ts`, merged first so a feature
  module that owns a key still wins. Untranslated counts fell from
  383/408/395 to **41/68/56**, and the remainder is a documented list of
  product names, protocol tokens, units and words already correct in the
  target language. Details: [I18N.md](I18N.md).
- **Web client republished.** `gh-pages` was rebuilt with this batch as commit
  `e5343b6` and its worker cache rotated to `kryvex-web-0.9.0-v2`, so an
  installed PWA replaces the older shell on activation.

## Artifacts

Built on this machine (Windows 11, Node 24.19.0) by
`pnpm package:win`, and verified before the tag:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.1-x64.exe` | 134,304,665 B (128.09 MiB) | `d5bfdba6818671ded985e2b8a4c4d0a3bbf551fa17f3796d5bf19abbf7b82943` |
| `Kryvex-Portable-0.9.1-x64.exe` | 134,067,445 B (127.86 MiB) | `3cb721a7c37ef89ef4f54f57f8fcd8cc47ba820c9290ce9d9c371e884fe8413b` |

The tag-triggered workflow rebuilds the same pair on `windows-latest` and
attaches it with `SHA256SUMS.txt`. The CI build differs from this local pair
only by its build environment; the published digests are the ones
`SHA256SUMS.txt` carries, and the updater checks them. Both EXEs are
**unsigned**. The updater ignores a release whose installer has no matching
entry.

The packaged tree is about 466 MB, of which 44 MB is the bundled llama.cpp
runtime, and the wizard reports **Space required: 465.8 MB**.

## Install

1. Run `Kryvex-Setup-0.9.1-x64.exe`, or let an installed 0.9.0 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; Desktop and Start Menu shortcuts stay, and the profile
   in `%APPDATA%\Kryvex` is untouched — services stay signed in.
3. The Portable EXE runs without installing.
4. Link play needs both players in the same room: create or join one under
   **Rooms**, then use **LINK PLAY** in the emulator. Player 2 needs a
   controller; the host can use the keyboard.

## Verification performed

- `npm run typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npm test`: exit 0, **679/679** tests across 66 files, including the netplay
  pad/chunk rules (`tests/netplay.test.ts`), the floating geometry
  (`tests/floating.test.ts`) and the translation ratchet
  (`tests/i18n-coverage.test.ts`).
- `npx vite build` and `pnpm package:win`: exit 0, producing the pair above;
  `ProductVersion` reads `0.9.1`.
- **Floating modules, driven in a browser** against the dev server: **Float
  this module** moved the module out of the stage (`service-stage is-idle
  has-float`), the frame was `position: fixed` with `z-index: 41`, a pointer drag
  moved it 80 px left and 40 px up, and **Dock this module** returned it to
  `#/service/…` as the active view. No console error.
- **Web client** served locally and live: new bundle and CSS named in the HTML,
  worker `activated` with `kryvex-web-0.9.0-v2` holding the shell, manifest,
  icons, JS and CSS; footer reads v0.9.0 (the web client follows the desktop
  version it was cut with). `#/emulator` renders the LINK PLAY panel.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.1-x64.exe --version 0.9.1`: PASS — four pages
  captured, install page ran for 22,310 ms, installer exited 0, capture archived
  under `docs/media/releases/0.9.1-wizard/`, and the installed
  `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.9.1.0`.
- `node scripts/check-release-record.cjs`: PASS for 0.9.1.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built 0.9.1 installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.1-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.1-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.9.1-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.8 MB" |
| 3 | [Installing](media/releases/0.9.1-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.1" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.1-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The run took 22,310 ms on the install page and exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **Link play was not driven between two machines** in this environment. Pad
  packing, chunk assembly, pad injection and the checkpoint path are covered by
  tests and the panel was exercised in the renderer, but the first real session
  is the acceptance test. Player 2 needs a controller; the host's keyboard is
  not forwarded.
- A link session needs a reachable room relay; with no peer the panel waits
  rather than falling back to a local second seat.
- Google still decides the account step, and the 0.9.0 identity work is
  unchanged: a captcha, device check or refusal can still come back. The
  service view offers **Reset session & retry** and **Open externally**.
- Remote control in Rooms covers Kryvex's own captures only, and the
  per-service pinnable secret tools remain unimplemented.
- The bundled runtime is **CPU-only** and x64, no model weights are bundled, and
  auto-start still refuses to retry a saved error.
