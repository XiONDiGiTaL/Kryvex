# Kryvex 0.9.5-hotfix.10: the link that can say why it is blocked

Prepared 2026-11-06 for the `v0.9.5-hotfix.10` tag. This is a hotfix batch, so
the version line stays at **0.9.5** and the build wears the `-hotfix.10` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.9 is
included.

This batch is about one complaint: **the phone will not connect to Kryvex Link.**
The listener was already bound to `0.0.0.0` on ports 43110–43129, so the socket
was never the whole story. Three things were wrong or missing, and each one is
fixed rather than papered over:

1. A pairing code could expire while the desktop was still displaying it, so the
   digits on screen were refused by the phone with no explanation.
2. Nothing ever checked Windows Firewall, which is the usual reason an inbound
   connection from a phone is dropped — especially on a Wi-Fi network Windows
   classifies as **Public**.
3. The view offered no way to tell "Kryvex is not serving" from "the network is
   the problem".

> **Nothing on `main` is live until this tag runs the Release workflow.** The
> `windows` job builds the two installers and attaches them to the release; the
> web job publishes the renderer to `gh-pages`, and no push to `main` publishes
> either. [Wizard capture](#wizard-capture) covers the one artefact only the
> Windows machine that cuts the tag can produce.

## What changed

### A code that cannot be stale (`electron/link.ts`)

`status()` now rolls the pairing code when it has expired instead of returning
the old digits. The view polls status every four seconds while it is open, so the
code on screen is always a code the phone can pair with. Previously the view
showed a five-minute countdown but kept the dead code afterwards, and the only
recovery was pressing **New code** — which nothing told the user to do.

### Windows Firewall, read and repaired (`electron/link-firewall.ts`)

New module, Windows-only, no privilege needed to read:

- `Get-NetFirewallRule -DisplayName 'Kryvex Link'` and
  `Get-NetFirewallProfile -Name Private` are read through `powershell.exe` and
  reduced to a verdict by two pure functions in `link-rules.ts`
  (`parseFirewallReading`, `firewallVerdict`): `open`, `rule-disabled`,
  `no-rule`, or `unknown`. Missing output is `unknown`, never "fine".
- **Allow through the firewall** adds one inbound TCP rule for ports
  43110–43129 with `remoteip=LocalSubnet profile=any` through
  `Start-Process -Verb RunAs`, so Windows shows its own consent dialog. The
  rule is scoped to the local subnet rather than to the private profile: a
  private-only rule leaves the many home networks Windows calls **Public**
  blocked, which is the common case this button exists for. A dismissed dialog
  is answered as "still not open".

### A connection check the user can read (`src/views/Link.tsx`)

A new card runs the diagnosis and prints both halves:

- the firewall verdict in plain language, with the fix button only when a rule
  is missing or disabled;
- a per-address probe: `electron/link-firewall.ts` fetches `/api/hello` on up to
  four advertised addresses with a 1.5 s timeout, so a listener that is not
  serving on an adapter is visible as *Nothing answered* instead of being
  blamed on the phone.

The copy is explicit that a probe passing does not prove the phone is on the
same network — Windows treats traffic from this machine to its own address as
local. A reading that cannot distinguish the two would be worse than none.

### Device status from the phone (`/api/status`)

The companion page reports `navigator.getBattery()` once, then on `levelchange`
and `chargingchange`, through a new `POST /api/status` route. The payload is
validated and clamped by `phoneStatus` in `link-rules.ts`; the desktop shows
`82% ⚡` beside the device. It is held in memory only, and dropped when the phone
is unpaired, revoked, or Kryvex exits — a stale reading is worse than none.

### Catalogue: Google Messages (`src/lib/catalog.ts`)

`messages.google.com/web` joins the catalogue as a preset in `communication`,
taking it to **180 presets across 16 categories**. It pairs through Google's own
QR flow, keeps its own persistent session, and carries SMS, MMS and RCS, so
texting works without Kryvex touching the phone's message store.

### Phone Link (`electron/link.ts`)

A launcher for Microsoft's app via
`ms-settings:mobile-devices-addphone-direct`. Phone Link is a packaged Windows
app with no web surface, so it cannot be embedded the way a service module is;
the card says that plainly and keeps Kryvex Link's own clipboard, file and remote
features separate from it.

### Copy

Eighteen new strings in the link view are translated in Spanish, German and
French (`src/lib/i18n-link.ts`), so the coverage ratchet does not move.

## Verification

**No suite was run for this record.** The change was prepared on a Linux runner
without pnpm and without registry access, so `pnpm install`, `pnpm typecheck`,
`pnpm test`, `pnpm build` and `pnpm verify:link` could not be executed here and
are recorded as **not run**, not as passing. The tag's workflow runs typecheck,
the unit suite and the one-time-code relay before it packages anything; the
Electron harnesses run in CI on pushes to `main`, not on the tag.

What was checked statically, and how:

| Check | Result |
| --- | --- |
| Every `t('…')` literal in `src/views/Link.tsx` present in `es`, `de`, `fr` | all 18 new keys in all three; the four remaining gaps are pre-existing keys already carried by the coverage test's exception list |
| IPC wired end to end | `kryvex:link:diagnose`, `:allow-firewall`, `:open-phone-link` present in `electron/main.ts`, `electron/preload.ts`, `src/types.ts` and the view |
| New preset is unique | one `googlemessages` id, one `messages.google.com` entry, catalogue count updated to 180 in `README.md` and `docs/SERVICES.md` |
| Bracket balance of both edited TSX files | balanced |
| Firewall argument | one rule, `remoteip=LocalSubnet profile=any`, no `profile=private` left |

The honest gap: none of this has been run against a Windows machine or a phone.
The connection check exists so that the next failure is readable rather than
guessed at.

## Artifacts

Produced by the Release workflow on the `v0.9.5-hotfix.10` tag
(`windows-latest`, Node 22, pnpm 10) and attached to the release:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.10-x64.exe` | recorded after the cut | recorded after the cut |
| `Kryvex-Portable-0.9.5-hotfix.10-x64.exe` | recorded after the cut | recorded after the cut |

`pnpm release:sync` copies both sizes and digests into this table and into
`PROJECT_STATUS.md` from the release's own asset facts, so neither is typed from
a terminal or copied by hand. `SHA256SUMS.txt` travels with the pair, and the
in-app updater verifies the download against it. Both EXEs are **unsigned**, so
Windows SmartScreen still shows its unknown-publisher prompt on first run.

## Wizard capture

The Release workflow runs `node scripts/check-release-record.cjs` before it
builds, and that gate fails a tag whose record has no installer wizard capture.

**No capture is committed for 0.9.5-hotfix.10, so `pnpm release:check` fails for
this version as the repository stands.** That is deliberate and stated here
rather than discovered by a green-looking tag: the first `v0.9.5-hotfix.9` push
published nothing because it went out before its capture existed, and the run
stopped at this gate. The capture cannot be produced anywhere but the Windows
machine that cuts the tag — it is a native installer dialog, not a page Kryvex
renders, so no screenshot of the app can stand in for it.

The cut, in order. `scripts/cut-release.ps1` (`pnpm release:cut`) runs all of
it on Windows and stops at the first failure:

1. `pnpm package:win` builds the Setup and Portable EXEs into `release/`.
2. `node scripts/verify-self-update.cjs --no-app --installer release/Kryvex-Setup-0.9.5-hotfix.10-x64.exe --version 0.9.5-hotfix.10 --archive`
   runs that EXE through its own wizard, records each page's controls in visual
   order, and writes `wizard.json` plus `pages/*.png` and `capture.md` under
   `0.9.5-hotfix.10-wizard/`. The installer and the version are named because
   bare `pnpm release:wizard` captures whatever `releases/latest` serves — the
   previous release — and a hotfix shares the numeric version of the release it
   patches, so an implicit run would archive over `0.9.5-wizard` instead.
3. `pnpm release:check` reports PASS for 0.9.5-hotfix.10.
4. Commit the capture, push `main`, then push the `v0.9.5-hotfix.10` tag.
5. After the tag publishes, make the doc pass in [UPDATES.md](UPDATES.md),
   step 7 of **Release procedure**: the README's install table and
   release-history row, the published sizes and digests in **Artifacts** below,
   and `PROJECT_STATUS.md` moving from `## Prepared` to `## Released`.
   `node scripts/sync-published-release.cjs` (`pnpm release:sync`) makes those
   four edits from the published assets and files anything it cannot settle as
   an issue, so no sentence here waits on somebody re-reading the log.

Until step 4, `releases/latest` answers `v0.9.5-hotfix.9` and
`https://xiondigital.net/Kryvex/` serves the hotfix.9 renderer. The web job
publishes from the tag, so the PWA cache name was already moved to
`kryvex-web-0.9.5-hotfix.10-v1` in `public/sw.js`.

## Upgrading

1. Once published, run `Kryvex-Setup-0.9.5-hotfix.10-x64.exe`, or update an
   installed 0.9.5 build from **Settings → Updates**.
2. Portable builds never self-replace: **Show downloaded file** opens Explorer so
   the new portable EXE can be run after Kryvex is closed.
3. Existing services, sessions, bookmarks, history, wallpapers, user scripts,
   pairings and settings are untouched by an upgrade. A phone that was already
   paired keeps its token; it is asked for a code again only if it was unpaired
   or its session was cleared.
