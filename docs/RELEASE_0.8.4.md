# Kryvex 0.8.4: Windows release

Published 2026-10-22 from the `v0.8.4` tag. This is the largest feature batch
since the shell: services become a working platform, with Steam sessions that
survive a restart, a one-time-code relay, a live resource board, a VPN panel,
weather and search engines, an assistant that can fall back to search, and a
local 8-bit emulator.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.4 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.4).

## What changed

- **Steam stays signed in.** Steam writes part of its web login as session
  cookies, which a persistent Chromium partition still drops at exit. The Steam
  service partition now promotes only Steam-hosted auth cookies to a one-year
  expiry; every other service keeps Chromium's default session behaviour. The
  rule is pure and unit-tested in `electron/steam-session-rules.ts`.
- **Sign-in codes can be relayed.** Kryvex recognises the code prompt on Steam
  Guard and other sign-in pages, shows a strip above the service canvas, and
  submits the code into either a single field or a row of one-character boxes.
  It can also focus the page's own field. Detection and submission are pure
  helpers, tested without a browser, and a real Electron harness drives the
  relay in CI and in release cuts.
- **A Home board.** Home now carries a greeting and clock, a weather card, a
  sticky task list and a short guide. Weather is opt-in: a city is looked up
  through Open-Meteo, the reading is cached for ten minutes, and the card can
  switch between °C and °F. Every widget can be hidden independently.
- **A live resource monitor.** A sidebar panel and a full view show CPU, system
  memory, the Chromium GPU process, and per-service and per-process usage. Only
  Kryvex's own processes are sampled, and nothing polls while the monitor is
  closed.
- **VPN control.** Settings → Network can point at an existing OpenVPN binary
  and `.ovpn` profile, start and stop the tunnel, pass DNS and proxy options,
  and connect on launch. Flags that hand control to another executable are
  rejected, so an imported profile cannot turn into arbitrary command
  execution. Kryvex does not bundle a VPN or its drivers.
- **Search engines by region.** The address bar, Settings and the assistant
  share one catalogue of engines across worldwide, Chinese, Korean, Czech,
  Vietnamese and international groups. Queries stay ordinary searches; no
  engine is contacted until a search is submitted.
- **Vexium, with an honest fallback.** The assistant answers app questions
  offline from a small set of true statements, hands anything else to the
  chosen search engine, and points at Settings → Vexium when a local model is
  needed. A loaded Ollama, LM Studio or GGUF model still streams answers
  locally over loopback, with Stop and cancellation.
- **The secret 8-bit emulator.** Services → Secret emulator loads ROMs you
  already own through EmulatorJS: NES, SNES, Game Boy/Color, GBA, Master
  System, Game Gear, Genesis, 32X, SG-1000, WonderSwan, Atari 2600/7800/Lynx,
  PC Engine, Neo Geo Pocket and Virtual Boy. Gamepad input, scale and a CRT
  filter are settings. Kryvex ships no ROMs and links to none.
- **Settings reorganized.** Workspace, Home board, Network, Shield, Vexium,
  Data, Updates and the engine panel are separate blocks with jump links, so a
  long settings page no longer hides the panel you came for.
- **More of the interface is translated.** Every new panel (Steam sessions,
  the code relay, Home board, resources, VPN, search regions and the emulator)
  has English, Spanish, German and French strings; `pnpm audit:i18n` is clean.
- **The release pipeline checks the relay.** CI and the release workflow run
  `pnpm verify:otp`, sharing one composite action. On failure the action keeps
  cookies, storage and state but trims disposable Chromium caches before
  uploading the profile.

Everything from 0.8.3 is included: pop-up sign-ins that stay in the tab strip,
the lifecycle guards that stopped the close-time error dialog, the checksum
verifier and the up-to-date verdict.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.4-x64.exe` |
| `Kryvex-Portable-0.8.4-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry.

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.8.4-x64.exe` | 120,323,288 B (114.8 MiB) | `6e0ab02f8705989735f4160aa2017caed69d2d34f882c61b23f15c8b9d4ca5d4` |
| `Kryvex-Portable-0.8.4-x64.exe` | 120,086,161 B (114.5 MiB) | `84ec9344f2c5f7474b6215e50625ddc7538fd017224147cf17994b3965340642` |

Both downloaded copies hash to those values, have matching entries in
`SHA256SUMS.txt`, and report `ProductVersion 0.8.4`. Both artifacts are
unsigned; Windows SmartScreen may warn about an unknown publisher.

## Install

1. Run `Kryvex-Setup-0.8.4-x64.exe`, or let an installed 0.8.3 update itself
   through **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. Use **Settings → Updates** to confirm the release is seen.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

- `pnpm typecheck`: exit 0 for renderer and `electron/`.
- `pnpm test`: 354/354 tests across 38 files.
- `pnpm build`: exit 0.
- `pnpm verify:otp`, PASS.
- `node scripts/audit-i18n.cjs`: clean.
- `node scripts/check-release-record.cjs`: PASS for 0.8.4.
- `pnpm package:win`, produced the Setup and Portable EXEs, both reporting
  `ProductVersion 0.8.4`.
- The wizard harness captured 5 pages from the 0.8.4 installer and the
  installer exited 0.
- The tag workflow (run 39735862979, commit `caa16a0`) passed every step and
  published a stable, non-draft release with the Setup, Portable and
  `SHA256SUMS.txt` assets. The downloaded files verify with `sha256sum -c`.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot
of the app. `pnpm verify:self-update --installer <setup.exe> --no-app --wizard
--archive --version 0.8.4` reads them from the dialog's own controls and commits
them with this record:
[capture.md](media/releases/0.8.4-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.8.4-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\\Kryvex) Will reinstall/upgrade." |
| 2 | [Choose Install Location](media/releases/0.8.4-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\\Kryvex`; "Space required: 367.7 MB" |
| 3 | [Installing](media/releases/0.8.4-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed." |
| 4 | [Installation Complete](media/releases/0.8.4-wizard/pages/04-Installation%20Complete.png) | "Setup was completed successfully." |
| 5 | [Completing Kryvex Setup](media/releases/0.8.4-wizard/pages/05-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup."; **Run Kryvex** checked |

The capture was made from the locally built 0.8.4 installer before the tag, so
it records the real wizard the published build is made from. The install page
ran for 19,836 ms between "Installing" and "Installation Complete", and the
installer exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- Steam's cookie promotion applies only to the Steam service partition. A Steam
  page opened in the general browser still gets an in-memory tab session.
- The one-time-code relay submits a code into the page that is showing the
  prompt. A site that renders its prompt in a cross-origin frame that refuses
  script injection still needs the page's own field, which the **Use page
  field** button focuses.
- Weather needs a network call to Open-Meteo and is off until a city is saved.
  Kryvex sends the chosen city or coordinates and nothing else.
- The VPN panel drives an OpenVPN installation you provide. It does not create
  profiles, bundle drivers or verify that a tunnel carries all traffic.
- The emulator runs local ROM files only and depends on the EmulatorJS assets
  loading in the service canvas. Save states are the core's own, not a Kryvex
  backup format.
- A real Google or Microsoft sign-in was not completed for this release; no
  test accounts are available here. The relay harness exercises the transport
  and field handling, not a provider's risk checks.
