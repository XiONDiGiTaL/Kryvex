# Kryvex 0.9.5-hotfix.11: every page gets the right-click a browser has

Prepared 2026-11-27 for the `v0.9.5-hotfix.11` tag. This is a hotfix batch, so
the version line stays at **0.9.5** and the build wears the `-hotfix.11` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.10 is
included.

The batch is 67 commits over 82 files (+10,238 / -381 lines) between 7 and 26
November 2026. Its centre is the complaint that Kryvex had no context menu worth
using: right-clicking a page offered three entries and a tab offered nothing, so
copying a link, saving a page or silencing a chat tab meant leaving for a real
browser. That is fixed across the page menu, the tab strip and the image and link
actions. Around it, the same weeks carry the palette's search, the service sign-in
return leg, the Activity Center, stylesheet theming for a service, and the phone
link's firewall scope.

> **Nothing on `main` is live until this tag runs the Release workflow.** The
> `windows` job builds the two installers and attaches them to the release; the
> web job publishes the renderer to `gh-pages`, and no push to `main` publishes
> either. [Wizard capture](#wizard-capture) covers the one artefact that records
> what the installer itself displayed, on a real Windows run.

## What changed

### A page menu built from what was clicked (`src/lib/page-menu.ts`, `src/components/PageContextMenu.tsx`)

`ca190ff` replaced the three-entry menu with one built from the click itself: a
selection gets copy and cut, an editable field gets paste and paste-and-match-style,
a link gets open, copy address and Send to…, an image gets the image entries, and
the page gets back, forward, reload, save, print, screenshot, zoom, source and
inspect. A service frame and a Kryvex browser tab differ only where they really
differ: the tab gets new-tab entries and page source, a service frame does not.
`7af37ac` fixed the half of Send to… that switched modules and then lost the
address — the navigation was sent before the new guest had settled, and a loading
guest rejects it. `f708c83` stopped the menu capping at 560px, which on a 900px
window pushed the whole Send-to-Vexium group below the fold where it read as
missing rather than scrollable.

`53c421b` gave the tab strip a menu of its own: reload, duplicate, pin, mute, and
close this tab / the others / everything to the right. Pinned and muted tabs carry
a mark, because both are states a reader has to see without opening a menu.
`bc6daab` finished the editing entries, including the paste that needed the field
focused first — the menu takes focus when it opens, so a paste with no `focus()`
went nowhere.

### Save image as… (`electron/main.ts`, `electron/downloads.ts`)

`627ffc1` added the image entry that keeps the picture rather than its address. It
rides the flow the app already had for Save page as…: the same native dialog,
defaulting to the folder Kryvex downloads to, with the image's own file name. The
bytes are fetched and written in the main process (`net.fetch` with a 20 s
timeout, inline base64 for `data:` images), so the renderer never hands over a
path; only `http(s)` and inline images are accepted, and the file is capped at
64 MB. The shell reports `Saved to <path>.`

### The palette searches what you have (`electron/search.ts`, `electron/search-rules.ts`)

`5604f38` taught Ctrl+K to search services, history, bookmarks and downloads in
one list, and `6c32498` remembers the searches that led somewhere and names what
Enter will open. `979dd27` turned the audit into the Activity Center behind it.
The harness work in `4f4b3ce`, `90243ab`, `a7fe664`, `bfee69f`, `f563a03` and the
`#3`/`#4`/`#5` pull requests made each row prove itself against a real visit, a
real download and a real bookmark, in a real window, instead of a fixture.

### A service's sign-in pop-up, and the leg back (`electron/popup-rules.ts`)

`1eef7d3` proved the provider pop-up in a real window; `a2dc0d5` let it open
before the service had an address; `3d8df56` through `7fc2347` fixed the return
leg, where the code was looked for on one channel and spent twice. The code is now
received on any channel, exchanged once per page, read back from the session
cookie, and finished in the window that carries it. `8908395` spends it in one
place and `3fec6ce` stops the callback from rewriting the state the page started
with.

### Appearance as a stylesheet (`src/lib/service-appearance.ts`)

`1d34be9` colours a service with a stylesheet instead of an injected script, and
`6ebc595` proves it in a real guest. `070cf19` ships the Discord theme a userscript
can actually carry. `src/lib/i18n-appearance.ts` carries the copy.

### The phone link on a second subnet (`electron/link-firewall.ts`)

`b5dc6fc` stops a phone on another segment of the router being dropped by the
rule's scope. `64067bf` quotes the remote list, which `netsh` was truncating;
`8584f46` writes the scope with the firewall cmdlets and `8e9fc3a` reads it back in
the form Windows stores it. `2a72c25` verifies the scope against a real Windows
Firewall, `867a242` records the four bugs that pass found, and `8b1b841` keeps it
available as an opt-in CI job because it needs a machine with the firewall.

### Copy

New strings for the page menu, the tab menu, search and activity are translated in
Spanish, German and French, plus Turkish where the line already carried it
(`src/lib/i18n-page-menu.ts`, `i18n-search.ts`, `i18n-activity.ts`,
`i18n-appearance.ts`, `src/lib/i18n-tr.ts`). The coverage ratchet does not move.

### Harness and gate repairs

Three fixes to the machinery that decides whether any of this is real:

- `7323685` identifies a wizard page by what it is rather than by the numbers in
  its readouts, so a page whose "space available" changed is not a new page;
  `b1f61e0` keeps a permanent check on that with
  `scripts/verify-wizard-signature.ps1`.
- `1f931c8` repaired `scripts/save-dialog.ps1`, which declared
  `GetWindowThreadProcessId` twice. A duplicate signature is a compile error, so
  `Add-Type` never produced the type and every caller reported `no-dialog`: the
  capture-window and rooms harnesses had not been filling a dialog at all. It also
  no longer claims `accepted` on a click Electron's dialog ignores, and waits for
  the window to close.
- `5f567f9` stops the record gate demanding two releases in the README at once.

### Legal

`4430503` revises the policies and privacy details in [LEGAL.md](LEGAL.md).

## Verification

Run on the Windows machine that prepared this record, before the tag:

| Check | Result |
| --- | --- |
| `pnpm typecheck` (renderer and electron configs) | pass |
| `pnpm test` | 1,281 tests in 108 files pass |
| `pnpm build` (inside `pnpm package:win`) | pass |
| `node scripts/audit-i18n.cjs` | no hardcoded UI strings in 62 renderer files |
| `node scripts/verify-context-menu.cjs` | 54 checks pass against the built app |
| `node scripts/verify-self-update.cjs --no-app --installer release/Kryvex-Setup-0.9.5-hotfix.11-x64.exe --version 0.9.5-hotfix.11 --archive` | 4 pages photographed, installer exit 0 |
| `node scripts/check-release-record.cjs --all` | PASS |

What the menu harness actually drives, rather than asserts from a unit test: the
page menu in a service frame and in a browser tab, the tab strip's own menu, the
Send to… hand-over, and Save image as… end to end — the native dialog filled the
way a person fills it, the 70-byte PNG the fixture served landing on disk, and the
toast naming the path.

**Not run here:** the other Electron harnesses in this batch (palette, userscripts,
rooms, capture, service appearance, sign-in pop-up). Each was proven by its own
commit on a Windows runner, and the CI batch re-runs them on pushes to `main`, not
on the tag. Nothing here was exercised on macOS or Linux.

## Artifacts

Produced by the Release workflow on the `v0.9.5-hotfix.11` tag
(`windows-latest`, Node 22, pnpm 10) and attached to the release:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.11-x64.exe` | recorded after the cut | recorded after the cut |
| `Kryvex-Portable-0.9.5-hotfix.11-x64.exe` | recorded after the cut | recorded after the cut |

`pnpm release:sync` copies both sizes and digests into this table and into
`PROJECT_STATUS.md` from the release's own asset facts, so neither is typed from a
terminal or copied by hand. `SHA256SUMS.txt` travels with the pair, and the in-app
updater verifies the download against it. Both EXEs are **unsigned**, so Windows
SmartScreen still shows its unknown-publisher prompt on first run.

## Wizard capture

The Release workflow runs `node scripts/check-release-record.cjs` before it builds,
and that gate fails a tag whose record has no installer wizard capture.

The capture for this version is committed at
`docs/media/releases/0.9.5-hotfix.11-wizard/`: `wizard.json`, `capture.md` and four
page screenshots. It was recorded on Windows from the Setup EXE this batch built,
by the command in step 3 of **Release procedure** ([UPDATES.md](UPDATES.md)), which
names the installer explicitly rather than capturing whatever `releases/latest`
serves.

The pages it recorded, in order: **Choose Installation Options → Choose Install
Location → Installing → Completing Kryvex Setup**, with the installer's own exit
code recorded as 0. The Installing page ran for 22.7 s rather than being skipped,
which is what distinguishes a real install from a wizard that was clicked through.
No screenshot of the app can stand in for this: the wizard is a native dialog
Kryvex does not render.

`node scripts/check-release-record.cjs --all` passes locally for every record,
including this one and the closed paperwork for 0.9.5-hotfix.10, so the tag's first
gate has nothing left to refuse.

## Upgrading

1. Once published, run `Kryvex-Setup-0.9.5-hotfix.11-x64.exe`, or update an
   installed 0.9.5 build from **Settings → Updates**.
2. Portable builds never self-replace: **Show downloaded file** opens Explorer so
   the new portable EXE can be run after Kryvex is closed.
3. Existing services, sessions, bookmarks, history, wallpapers, user scripts,
   pairings and settings are untouched by an upgrade. A phone that was already
   paired keeps its token; it is asked for a code again only if it was unpaired or
   its session was cleared.
