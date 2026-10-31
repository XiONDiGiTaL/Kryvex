# Kryvex 0.9.5-hotfix.8: user scripts, a replaceable address bar, and travel

Prepared 2026-10-31 for the `v0.9.5-hotfix.8` tag. This is a hotfix batch, so
the version line stays at **0.9.5** and the build wears the `-hotfix.8` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.7 is
included.

Three things land here: the browser learns to run userscripts, the address bar
stops fighting the page it is showing, and the catalogue gains the travel
family it was missing.

- **Userscripts.** Greasemonkey/Tampermonkey `.user.js` files install from a
  file, from pasted source or from a URL, get a switch each, and run in browser
  tabs. There is a toolbar icon with a count of what matches the page in front,
  and a Settings block beside the other browser settings with links to where
  scripts are published.
- **The address bar.** A click used to leave a caret at the end of the URL
  instead of selecting it, so typing spliced the new address into the old one
  and Enter loaded a broken URL. It now selects the whole address, and a site
  calling `pushState` can no longer overwrite the field while it is focused.
- **A travel family.** 38 presets for flights, stays, cruises, rail, coaches and
  car hire, as a sixteenth category. The catalogue is now **179 presets across
  sixteen categories**.

## What changed

### Userscripts

- **Parsing and matching (`electron/userscript-rules.ts`).** The
  `==UserScript==` block is read for `@name`, `@match`, `@include`, `@exclude`
  and `@run-at`. Matching understands Chrome patterns — `*.example.com` covers
  the bare domain, path globs include the query string, `<all_urls>` — plus
  Tampermonkey `/regex/` includes. A file with no header, no name or no target
  page is refused instead of being run everywhere.
- **Storage and injection (`electron/userscripts.ts`).** Each script is kept
  verbatim in `userData/userscripts/<key>.user.js` beside a small index. The
  main process injects on each browser guest's `dom-ready`, one evaluation per
  script, wrapped in its own scope with `try`/`catch` and a `sourceURL`, so one
  broken file cannot stop the next. A re-install with the same `@name` and
  `@namespace` updates in place rather than duplicating.
- **Install paths.** From a file picker, pasted source, or fetched from an
  http(s) address; a Greasy Fork *page* is rejected with an explanation, while
  its `code.user.js` installs. Six IPC handlers, all refused for a non-shell
  sender. Limits: 60 scripts, 512 KB each.
- **Where it lives.** A script icon in the browser toolbar whose panel lists
  every script with a switch, marks the ones running on the page in front and
  links to Settings; a collapsible **User scripts** block in Settings
  (`#/settings?section=userscripts`) holding the same list, the three install
  paths and **Where to find scripts** — Greasy Fork, OpenUserJS, GitHub's
  `userscript` topic and the Tampermonkey documentation.
- **Limits, stated plainly.** Every script runs at `dom-ready`, so
  `@run-at document-start` behaves like `document-end`; `@grant`, `@require` and
  `@resource` are ignored. Scripts apply to **browser tabs only**: a service
  module keeps a persistent signed-in profile, so it never receives third-party
  code. Details: [USERSCRIPTS.md](USERSCRIPTS.md).

### The address bar

- **Clicking selects the address (`src/views/Browser.tsx`).** A click on the
  field now selects the whole URL, while a second click still places a caret
  where it lands. The defect was reproduced rather than assumed: probing
  google.com in the built app showed the caret at the end after a real click —
  `selection 54-54 of 54` — so typing appended to `https://www.google.com/?zx=…`
  and Enter loaded that broken address. After the fix the same click reports
  `0-31 of 31`.
- **A page cannot edit what you are typing (`src/components/Webview.tsx`).**
  `did-navigate-in-page` used to be treated as a page change, so a site calling
  `pushState` could overwrite the field mid-edit. The webview now reports
  `document` and `in-page` navigations separately; an in-page change never
  rewrites a focused address field, while a real page load still updates it and
  switching tabs still resets it.

### The catalogue

- **`travel` (38 presets, `src/lib/catalog.ts`).** Skyscanner and Google Flights
  move out of `other` rather than being duplicated, and 36 new presets join them:
  fare search (Kayak, Momondo, Expedia, Hopper, Priceline), stays (Booking.com,
  Agoda, Hotels.com, Trip.com, trivago, Airbnb, Vrbo, Hostelworld), planning and
  tours (Tripadvisor, Viator, Rome2Rio), rail, coaches and cars (Trainline,
  Omio, FlixBus, Turo, Rentalcars), cruises (Royal Caribbean, Carnival,
  Norwegian, MSC, Princess, Celebrity, Cruise Critic) and airlines (Turkish
  Airlines, Emirates, Lufthansa, Ryanair, Delta, easyJet, United, American
  Airlines). Each note says who actually sells the booking, because a preset
  here is a booking desk, never a ticket.
- **Marks for every new preset.** Fifteen come from Simple Icons; nineteen are
  the sites' own icons saved under `public/brand-icons/`. MSC's dark glyph sits
  on the light plate, and the build gate measures every one against the tile.
  GetYourGuide and Amtrak are absent because both refuse every scripted request,
  including their own favicon, and shipping a preset the catalogue cannot draw a
  mark for would break the one-mark-per-preset rule.
- **Version 0.9.5-hotfix.8.** `package.json` moves to the new suffix. The web
  worker's cache name is part of the same rule, but the tag was cut with the old
  value still in `public/sw.js`; it is corrected on `main`
  (`kryvex-web-0.9.5-hotfix.8-v1`) and the next web publish carries it. The
  deployed PWA built from this tag therefore still names the
  `kryvex-web-0.9.5-hotfix.7-v1` cache while serving this build's hashed bundles;
  see [Known gaps](#known-gaps).

## Verification

- `pnpm typecheck` clean; `pnpm test` **1,153 passing in 97 files**; `pnpm
  check:icons` PASS; `pnpm audit:i18n` clean; `pnpm build:web` PASS (5.5 MiB).
- `scripts/verify-userscripts.cjs` drives the built app end to end: install →
  listed in Settings and the toolbar panel → runs in the tab and never in the
  shell → the address bar selects, typing replaces, survives 1.6 s of
  `pushState` churn and navigates where it was told → the script follows an
  in-tab navigation → disabled stops it → removal clears it. The harness is part
  of the CI browser batch, and it is the reason the select-all moved from
  `mouseup` to `click`: the first CI run of this batch caught a caret landing on
  top of the selection (`31-31 of 31`), which the earlier handler could not
  prevent. The click handler runs last and reports `0-31 of 31`.
- `tests/services.test.ts` pins all 38 travel endpoints, their category and the
  exact size of the family.
- The Release workflow runs typecheck, the full test suite, the advisories, the
  one-time-code relay and the wizard record before it packages anything.

## Artifacts

Built by the Release workflow on the `v0.9.5-hotfix.8` tag (`windows-latest`,
Node 22, pnpm 10) and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.5-hotfix.8):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.8-x64.exe` | 138,291,522 B (131.89 MiB) | `8927a33868ff49ebc9064fbe98d0e019acc0e2eef6a406353c42657b03295403` |
| `Kryvex-Portable-0.9.5-hotfix.8-x64.exe` | 138,047,637 B (131.65 MiB) | `e99a5fdd67ed20e83af3ad88f7930bd04dbd8f2af5aa7c4311eeb8ad7e00111e` |

`SHA256SUMS.txt` (207 B) travels with them, and the digests above are GitHub's
own asset digests, so the in-app updater accepts this release. It is not a draft
and not a prerelease, `releases/latest` answers `v0.9.5-hotfix.8`, and it was
published stable at 2026-10-31T01:01:01Z. The workflow builds what it publishes,
so these files — not the locally built pair — are the ones to check a download
against. Both EXEs are **unsigned**, so Windows SmartScreen still shows its
unknown-publisher prompt on first run.

The web job published the same renderer to `gh-pages`; `https://xiondigital.net/Kryvex/`
answers HTTP 200 and the served `assets/main-BgwYxP3Z.js` reports
`0.9.5-hotfix.8`.

## Wizard capture

The local installer was run through its own wizard and every page recorded:
[the capture](media/releases/0.9.5-hotfix.8-wizard/capture.md), with the raw
manifest at
[`wizard.json`](media/releases/0.9.5-hotfix.8-wizard/wizard.json).

| # | Page | What it showed |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.5-hotfix.8-wizard/pages/01-Choose%20Installation%20Options.png) | “Who should this application be installed for?”; the existing `C:\Kryvex` per-user install will be upgraded |
| 2 | [Choose Install Location](media/releases/0.9.5-hotfix.8-wizard/pages/02-Choose%20Install%20Location.png) | `C:\Kryvex`, 489.5 MB required |
| 3 | [Installing](media/releases/0.9.5-hotfix.8-wizard/pages/03-Installing.png) | “Please wait while Kryvex is being installed.”; `Kryvex 0.9.5-hotfix.8`; 19.3 s of real work between the two pages |
| 4 | [Completing Kryvex Setup](media/releases/0.9.5-hotfix.8-wizard/pages/04-Completing%20Kryvex%20Setup.png) | “Kryvex has been installed on your computer. Click Finish to close Setup.” |

The wizard is a native Windows dialog, so these pages cannot appear in a CDP
screenshot of the shell. They are read from the dialog's own controls in visual
order, and the installer's exit code comes from a process handle opened while it
was alive.

`pnpm release:check` reads this record: the doc must name the capture, the
manifest must match the version, the installer must have exited 0, and more than
one page must have been captured. It reports **PASS for 0.9.5-hotfix.8**.

## Known gaps

- **The PWA cache name lagged at cut time, and was corrected after.**
  `public/sw.js` was still named `kryvex-web-0.9.5-hotfix.7-v1` when the tag was
  cut, so the worker the web job deployed from the tag named the old cache. The
  web client was republished from `main` on 2026-10-30 (gh-pages `8cd1aff`): the
  live `sw.js` now declares `kryvex-web-0.9.5-hotfix.8-v1`, and the index serves
  the same bundle hash (`main-BFCFgqNb.js`) as this build. The desktop installers
  are unaffected either way: they do not run a service worker.
- **Two unsigned EXEs.** Signing was considered and dropped for this line, so
  SmartScreen still warns on first run.
- **Two travel presets are still absent.** GetYourGuide and Amtrak refuse every
  scripted request, including their own favicon, and the catalogue's icon gate
  requires a bundled mark for each preset.

## Upgrading

1. Run `Kryvex-Setup-0.9.5-hotfix.8-x64.exe`, or update an installed 0.9.5 build
   from **Settings → Updates** — the checker reads `releases/latest` and accepts
   the Setup asset for the tag it finds.
2. Portable builds never self-replace: **Show downloaded file** opens Explorer so
   the new portable EXE can be run after Kryvex is closed.
3. Existing services, sessions, bookmarks, history, wallpapers and settings are
   untouched by an upgrade; user scripts live in their own folder under the
   profile and survive it.
