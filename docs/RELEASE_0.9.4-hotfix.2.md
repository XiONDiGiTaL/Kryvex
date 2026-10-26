# Kryvex 0.9.4-hotfix.2: window motion, clock looks, phone addresses and canvas placement

Prepared 2026-10-26 for the `v0.9.4-hotfix.2` tag. This is a fix and polish batch,
so the version line stays at **0.9.4** and the build wears the `-hotfix.2` suffix
([UPDATES.md](UPDATES.md)). 0.9.5 is still not cut. Everything in 0.9.4,
0.9.4-hotfix.1 and 0.9.4-hotfix.2 is included.

Four things reported from the installed build are addressed, plus the clock and
how a service gets onto the Workspace canvas.

- **The phone link was advertising addresses a phone cannot reach.** The address
  list was bare URLs, so the only way to learn that `10.147.19.81` belongs to a
  ZeroTier tunnel was to try it and watch the browser hang and then abort. Every
  address is now labelled with the adapter it belongs to, the reachable one is
  ranked first and marked **Likely your network**, and the card explains the two
  conditions that actually block a phone: the same Wi-Fi or Ethernet network, and
  a firewall rule for Kryvex on private networks.
- **The capture tool is one click from anywhere.** The tool existed but only
  behind the Home card, which is one of the opt-in widgets, so a fresh profile
  had no way to take a screenshot at all. There is now a **Capture** button in
  the header beside Activity; it reveals the card, goes Home, brings the card into
  view and focuses its target picker.
- **Windows arrive and leave instead of snapping.** Opening, closing and
  minimising a service window on the Workspace is animated, with the animation
  chosen on the Workspace itself: **Subtle**, **Bouncy** or **None**, at 0.5×–2×
  speed. `prefers-reduced-motion` turns it off regardless.
- **The clock is no longer trapped in a box.** The greeting clock and the world
  clock card shared one class name, and the card rule came last, which is why the
  board clock drew a border and padding it never asked for. They are separate
  now, and the board clock has its own look: **Bare** (the new default, no
  frame), **Card** (the bordered tile) or **Clock radio** (tracked monospace),
  with the digits in the theme colour, the accent or a muted tone, and five
  curated families. It can also be switched off the board, and it is reachable
  from the board's **Widgets** panel rather than existing on its own.
- **A service you already have opens as a window.** Dragging a pinned row, a
  Services card or a chip in the dialog onto the canvas now frames it there. The
  drop also works on a module that is already floating over the app or parked in
  the tray: it moves onto the canvas, restores and comes to the front instead of
  being ignored because it already had a window record.
- **Placing a window no longer leaves a second copy in the sidebar.** Adding from
  the Workspace lists what the profile already has first, and a site that is
  already installed opens the existing record with nothing added. A second copy
  is now a switch on the form — *Allow more than one instance of this site* —
  because every record keeps its own partition, so two copies are two separate
  sign-ins rather than the same one listed twice.

## What changed

- **The address list carries its adapters (`electron/link-rules.ts`,
  `electron/link.ts`, `src/views/Link.tsx`, `electron/types.ts`,
  `src/types.ts`).** `describeLinkAddresses` takes `{ address, name }` rows, drops
  duplicates under the first name, ranks a private address on a physical adapter
  above one on a virtual adapter (VMware, VirtualBox, Hyper-V, WSL, Docker,
  WireGuard/Tailscale and ZeroTier names, TAP/TUN, Bluetooth), and builds the URL.
  The status keeps `urls` for compatibility and adds `links` with the name and a
  `likely` flag; the view tags the first and marks the rest, and a disclosure
  spells out the network and firewall conditions. `scripts/verify-link.cjs`
  asserts both, so the labelling cannot silently regress.
- **The header capture button (`src/components/shell.tsx`, `src/App.tsx`,
  `src/views/Home.tsx`, `src/components/HomeBoard.tsx`,
  `src/components/ScreenCaptureWidget.tsx`).** The button bumps a pulse, and the
  card answers by scrolling into view, ringing once and focusing the picker; if
  the profile hides the card, it is switched on and the board is shown. The target
  list also gained one short retry, because the first `desktopCapturer` call can
  land before the window is painted and answer with nothing.
- **Window motion (`src/views/ServiceStage.tsx`, `src/lib/store.ts`,
  `src/lib/defaults.ts`, `src/types.ts`, `src/styles.css`,
  `src/views/Workspace.tsx`).** `settings.workspace = { motion, motionSpeed }`,
  edited from a panel in the Workspace bar. The frame carries `data-motion` and a
  `--window-motion` duration; the stylesheet keys two open keyframes and one exit
  keyframe on them. Close waits out the exit animation before the record is
  dropped, and the guest is never remounted for any of it.
- **The clock's look (`src/lib/clock-style.ts`, `src/components/HomeBoard.tsx`,
  `src/components/WorldClockWidget.tsx`, `src/styles-board.css`,
  `src/lib/store.ts`, `src/lib/defaults.ts`, `src/types.ts`).**
  `home.clockStyle`, `home.clockAccent`, `home.clockFont` and
  `home.showBoardClock` are new, sanitised on load and defaulted to `bare`,
  `theme`, `default` and on. The world clock widget keeps its own
  `.home-world-clock` card class so the two clocks can no longer share styling.
- **Placing on the canvas (`src/lib/workspace.ts`, `src/App.tsx`).**
  `placeOnCanvas` frames a module at the drop point whether or not it already has
  a record: it clears the minimize and the maximize restore, re-frames the box
  and brings it to the front, so a drop is never a no-op.
- **One record per site (`src/lib/services.ts`, `src/components/ServiceDialog.tsx`,
  `src/App.tsx`, `src/styles.css`).** `serviceHost`/`installedForUrl` match on
  host rather than on the whole URL, `resolveServicePlacement` decides between
  adding and reusing, and the dialog and the shell both read that one function —
  so the note under the form cannot promise something different from what the
  button does. The clash note is painted in the warning colour.
- **The instance switch (`src/types.ts`, `src/lib/store.ts`).** `Service` gained
  `multipleInstances`, sanitised on load and off by default; either the incoming
  card or the installed record can allow the copy. `src/components/shell.tsx`
  adds `data-service` to a pinned row, which is what the canvas harness reads.
- **New strings, four languages.** Eleven strings for the phone card and the
  motion panel, nine for the clock, in `src/lib/i18n-extras.ts` en/es/de/fr, with
  the ratchet in `tests/i18n-coverage.test.ts` raised to cover them. Family names
  stay untranslated, as in the typography block. Seven strings for placing on the
  canvas live in `src/lib/i18n-placement.ts` (es/de/fr) with Turkish added to the
  one catalogue, `src/lib/i18n-tr.ts`.
- **Version 0.9.4-hotfix.2.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.4-hotfix.2-v1`) move together. The installed
  `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.9.4.0` /
  `FileVersion 0.9.4-hotfix.2`.

## Artifacts

The published pair, built by the Release workflow on the `v0.9.4-hotfix.2` tag
(`windows-latest`, Node 22, pnpm 10) and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.4-hotfix.2):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.4-hotfix.2-x64.exe` | 134,377,675 B (128.15 MiB) | `d1fd0de16a199e893064a2203024f75bc5bf84aa40a151a0093905ebc89c5bb2` |
| `Kryvex-Portable-0.9.4-hotfix.2-x64.exe` | 134,140,530 B (127.92 MiB) | `3844352a7ff4e16773b4b0ae4c64537eeec6a051392473c776fa11782fc4b69e` |

`SHA256SUMS.txt` carries both and matches the uploaded binaries. No model weights
are bundled. Both EXEs are **unsigned**.

The wizard capture below was taken from a local `pnpm package:win` build of this
working tree at the cut, before the canvas-placement fixes landed, because that
local rebuild then failed on an Electron extract rename (`EPERM` renaming
`release\win-unpacked.tmp`), so those figures are the pre-batch local pair
(`1b5bf53f…` Setup at 134,370,541 B, `3df21898…` Portable at 134,133,393 B) and
the table above is the one to check a download against.

**Web client.** The same tag rebuilt and force-pushed `gh-pages`, and the Pages
deployment that followed it succeeded: the published worker is the shell,
companion and worker trio naming `kryvex-web-0.9.4-hotfix.2-v1`, so the site
reports the version of this release.

## Install

1. Run `Kryvex-Setup-0.9.4-hotfix.2-x64.exe`, or update an installed 0.9.4
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. If Kryvex is running, setup asks to close it first;
   shortcuts stay and the profile in `%APPDATA%\Kryvex` is untouched, so services
   stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `npx tsc -b`: exit 0 for the renderer and `electron/`.
- `npx vitest run`: **877/877** across 80 files, including the new
  `tests/clock-style.test.ts`, `tests/services.test.ts` and the extended
  `tests/workspace.test.ts`, `tests/store.test.ts` and `tests/link-rules.test.ts`.
- `pnpm verify:canvas`: **24/24 PASS** on the built app, reading the saved profile
  back from `kryvex-state.json` rather than the DOM — see
  [TESTING.md](TESTING.md).
- `pnpm build`: exit 0. `pnpm build:web`: PASS (1.7 MiB) with
  `scripts/check-web-build.cjs` reporting the shell, companion and worker, and
  the worker naming `kryvex-web-0.9.4-hotfix.2-v1`.
- `pnpm verify:link`: **32/32 PASS**, including the two new address checks. On
  this machine the live list was `192.168.50.250 Ethernet 1 (likely)`,
  `192.168.56.1 Ethernet 3 (likely)`, `10.147.19.81 ZeroTier One`,
  `10.124.101.81 ZeroTier One` — the diagnosis behind the reported failure.
- A disposable CDP harness over the built app, 13/13: the header reads
  `Activity, Capture, Add, Settings, Help`; the click lands on `#/home`, reveals
  the card, rings it, focuses the picker and persists `showCapture`; the motion
  panel persists `{ motion: 'bouncy', motionSpeed: 1 }`; a pinned service dropped
  on the canvas opens a window with `data-motion="bouncy"`,
  `--window-motion: 260ms`, a running animation and controls ordered
  `Minimize, Maximize, Close`. That harness found and fixed one defect: the open
  animation's effect was keyed on the window record, so raising a window during
  the animation left the frame marked as opening.
- A second disposable CDP harness over the built app, 12/12: the board clock
  starts `is-bare accent-theme` with no border and no padding at 62 px / weight
  200; the world clock widget keeps its own 1 px card; the Widgets panel shows
  four clock rows; **Card** boxes the clock (1 px, 12 px padding, 44 px);
  **Clock radio** switches to the Cascadia Mono stack; **Accent** paints the
  digits `#38BDF8`; the family picker reaches Georgia; the three choices are
  written to the state file; switching the clock off removes it from the board.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.4-hotfix.2-x64.exe`: **PASS** — four pages captured,
  the install page ran for 26,684 ms, the installer exited 0, and the capture was
  archived under `docs/media/releases/0.9.4-hotfix.2-wizard/`.
- `pnpm release:check`: PASS for 0.9.4-hotfix.2.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record: [capture.md](media/releases/0.9.4-hotfix.2-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.4-hotfix.2-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.4-hotfix.2" |
| 2 | [Choose Install Location](media/releases/0.9.4-hotfix.2-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 466.1 MB" |
| 3 | [Installing](media/releases/0.9.4-hotfix.2-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed." |
| 4 | [Completing Kryvex Setup](media/releases/0.9.4-hotfix.2-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 26,684 ms between **Installing** and **Completing Kryvex
Setup**, and the installer exited 0. The first attempt stalled on the "Kryvex is
running. Click OK to close it." prompt from an open copy of the app; the app was
closed and the capture re-run, which is why this record has four pages rather than
the five a previously stopped install produced.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **A phone has not been tested against this build.** The address list and its
  labels are verified; whether the Windows firewall lets the phone in is not, and
  the installer does not add a rule.
- The capture target list is the system source list. A service that is not open as
  a module is not offered, and a window minimised to the tray may capture black.
- Recording is capped at three minutes and produces WebM; there is no trimming,
  annotation or audio-only mode.
- The capture card's gallery is the four most recent entries. There is no
  full-screen gallery window yet.
- Window geometry is still session state: a window reopens where the surface puts
  it rather than where it was left.
- Two instances of one site are isolated because each record carries its own
  partition id; that was proved at the record level, not by signing two accounts
  in side by side.
- The browser/PWA build has no main process, so the phone link, the save dialog
  and the preview window do not exist there.
