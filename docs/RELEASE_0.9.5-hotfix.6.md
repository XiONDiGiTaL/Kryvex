# Kryvex 0.9.5-hotfix.6: modules stop evicting each other, and page storage reaches the disk

Prepared 2026-10-28 for the `v0.9.5-hotfix.6` tag. This is a fix batch, so the
version line stays at **0.9.5** and the build wears the `-hotfix.6` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.5 is
included.

This batch answers the one report that has been open longest: a signed-in
module — Discord in particular — coming back as *Choose an account → Please log
in again* after the user simply moved to another part of Kryvex. Both causes were
Kryvex's, and both are gone.

- **No module closes another.** The live set no longer has a cap. Opening,
  re-opening or dropping a module brings it to the front and leaves everything
  already running alone.
- **A guest's page storage is written before it is closed.** `localStorage` is
  flushed alongside cookies, at teardown and at quit, so a token the page saved
  seconds earlier is not lost with its renderer.

## What changed

- **One rule for what stays open (`src/lib/services.ts`, `src/App.tsx`,
  `tests/services.test.ts`).** `openModuleIds()` replaces the three separate
  `[...open, id].slice(0, 8)` expressions that lived in `openService`,
  `openInWorkspace` and the deep-link path. Because the stage renders one frame
  per id, dropping an id from that list unmounted the frame and destroyed the
  guest behind it — silently, with no toast and nothing in the page to explain
  it. A module now leaves the set only when the user closes it or a lifecycle
  policy stops it (the same verdict that already stopped and unmounted it
  visibly). A unit test opens nine ids and asserts all eight earlier ones
  survive, and a second asserts re-opening de-duplicates and re-orders rather
  than appending twice.
- **Storage is flushed with cookies (`electron/service-sessions.ts`).**
  `flushPartition()` runs `session.flushStorageData()` and then the cookie store,
  and is the only path both `stop()` and the quit flush take, so closing a module
  and quitting Kryvex write the same things. Previously only cookies were
  written, and only at quit; page storage followed Chromium's own schedule,
  which is not something a teardown can wait for.
- **Docs.** [SERVICES.md](SERVICES.md) records both causes under *Discord
  specifically*, and [TESTING.md](TESTING.md) documents the new assertions and
  the harness steps that prove them.
- **Version 0.9.5-hotfix.6.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.5-hotfix.6-v1`) move together.

Nothing about Discord is bypassed, patched or impersonated: the module still
runs the real client in its own Chromium session with the same user agent and the
same partition it has been signing in to all along.

## Artifacts

Built by the Release workflow on the `v0.9.5-hotfix.6` tag (`windows-latest`,
Node 22, pnpm 10), published stable at 2026-10-28T16:04:24Z, and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.5-hotfix.6):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.6-x64.exe` | 137,368,424 B (131.00 MiB) | `e46a2ab56d1ac74f63a51d9514e36243b25b9dfecf3f81d679afba541d79bf02` |
| `Kryvex-Portable-0.9.5-hotfix.6-x64.exe` | 137,124,552 B (130.77 MiB) | `28e52580f31a244e66ff00d6695d1ab0dd4c87d0c7597a85e77ab192225044b2` |

`SHA256SUMS.txt` (207 B) travels with them, and the digests above are GitHub's
own asset digests, so the in-app updater accepts this release. It is not a draft
and not a prerelease, and `releases/latest` answers `v0.9.5-hotfix.6`. The
workflow builds what it publishes, so these files — not the locally built pair
used for the wizard capture below — are the ones to check a download against.
Both EXEs are **unsigned**.

The locally built pair from this working tree (`pnpm package:win`, Electron
44.9.3, x64), used for the wizard capture and **not** one of the published files:

| File | Size |
| --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.6-x64.exe` | 137,368,311 B (131.00 MiB) |
| `Kryvex-Portable-0.9.5-hotfix.6-x64.exe` | 137,124,409 B (130.77 MiB) |

**Web client.** The same tag rebuilt and force-pushed `gh-pages`: the published
worker at `https://xiondigital.net/Kryvex/sw.js` names
`kryvex-web-0.9.5-hotfix.6-v1` and `https://xiondigital.net/Kryvex/` answers HTTP
200, so the site reports this version.

## Install

1. Run `Kryvex-Setup-0.9.5-hotfix.6-x64.exe`, or update an installed 0.9.5
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. Shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/`.
- `pnpm test`: **1053/1053** across 92 files, including the two new cases in
  `tests/services.test.ts` (a ninth open id keeps all eight earlier ones; a
  re-opened id is moved, not appended twice).
- `pnpm audit:i18n`: no hardcoded UI strings in 57 renderer files.
- `pnpm package:win`: exit 0, producing the two installers sized above.
- `node scripts/verify-service-engine.cjs` against the built app: **PASS**, with
  `open modules: 9` and the first module still the same guest
  (`marker`/`token` `6wh8xe3hvnq`) after eight more were opened, plus
  `page storage after view change: "6wh8xe3hvnq"` and
  `page storage after restart: "6wh8xe3hvnq"` — neither of which the harness
  checked before. Cookies, keep-alive ticks, unread badge, the auth popup and
  session clearing all still pass in the same run.
- **The harness was proved non-vacuous.** With the old cap restored in
  `src/App.tsx`, the same run reports `the stage held 8 frames after nine modules
  were opened, not 9` and fails; the fix was then restored and re-measured. A
  check that cannot fail is not evidence.
- The version bump is covered by the release-record guard below: `release:check`
  reads `package.json` and the committed capture.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record:
[capture.md](media/releases/0.9.5-hotfix.6-wizard/capture.md).

Recorded 2026-10-28T15:58:18Z from the local installer of this working tree. The
wizard found the existing per-user installation in `C:\Kryvex` and upgraded it in
place.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.5-hotfix.6-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.9.5-hotfix.6-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 486.3 MB" |
| 3 | [Installing](media/releases/0.9.5-hotfix.6-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.5-hotfix.6" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.5-hotfix.6-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 22,787 ms between **Installing** and **Completing Kryvex
Setup**, all four pages were photographed, and the installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **No real Discord account was signed in** to produce this fix. What was
  measured is the mechanism Kryvex controlled: the stage keeps every open module
  and the guest behind it, and page storage survives a view change and a
  restart. Whether a given account's token is also invalidated server-side is not
  something this repository can test, so a remaining sign-out would point at
  Discord rather than at the live set or the teardown.
- **Memory now follows what is open.** Without the cap, keeping a dozen heavy
  modules open keeps a dozen Chromium guests resident. That is the point — the
  alternative was silently killing one — but Settings → Lifecycle is where a
  profile can make *leave* mean *stop*.
- **Virtual LAN remains unshipped.** Room membership is still not an operating
  system tunnel; the address that travels with a room is displayed, never
  dialled.
