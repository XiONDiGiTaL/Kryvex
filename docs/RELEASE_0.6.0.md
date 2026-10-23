# Kryvex 0.6.0: Windows release

Released 2026-10-20. This release turns services into kept-alive apps, adds
in-app updates and expands the theme system to 38 built-in themes plus a custom
colour studio.

Download the installer, portable build and checksum list from the
[Kryvex 0.6.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.6.0).

## Highlights

- **Service apps that stay running:** a service is mounted once, its partition
  is applied before the page loads, and it keeps its session while you work
  elsewhere. The guest reports a Chrome-shaped user agent instead of Electron's.
- **Native notifications and unread badges:** service partitions can raise
  native notifications and taskbar alerts; `(3) Discord`-style titles produce
  counts in the toolbar, sidebar pins and window title. Throwaway browser tabs
  stay blocked.
- **Sign-in popups and session clearing:** OAuth and passkey windows share the
  service session; the toolbar lock clears only that service's cookies,
  storage and cache after confirmation.
- **27-service catalogue:** communication, work, AI and resource presets with
  brand marks and honest embedding notes.
- **A real theme studio:** 37 catalogue themes in six families plus the
  **Special Donkey Edition** plugin, arranged as a periodic table with
  two-letter symbols, family bands, mode labels and palette strips. The
  **Custom** tile builds a theme from five HSV/RGB colour pickers (hue/
  saturation field, rainbow slider, HEX field and editable R/G/B) and derives
  the line, raised and muted tones automatically.

  | Family | Themes |
  | --- | --- |
  | Core | Kryvex Dark, Kryvex Light, Midnight, Graphite, OLED Black, High Contrast |
  | Spectrum | Sunburst, Violet, Lapis Lazuli, Turquoise, Rose Quartz, Ember, Emerald, Amethyst, Obsidian |
  | Elements | Carbon, Neon, Argon, Krypton, Xenon, Radon, Sulfur, Iodine, Chlorine, Nitrogen, Silicon |
  | Metals | Platinum, Titanium, Copper, Gold, Silver, Iron, Mercury |
  | Lights | Helium, Lithium, Oxygen |
  | Terminal | Terminal (near-black, phosphor green, mono face) |

- **Gradient, glass and mono themes:** gradient themes paint buttons, marks and
  active outlines with an accent-to-accent gradient; Platinum and Mercury add
  an aero-style reflected sheen; Terminal switches the interface to the mono
  face.
- **In-app updates:** **Settings → Updates** checks the public GitHub releases,
  requires a version-matched asset and a matching `SHA256SUMS.txt` entry, and
  can install and restart. Portable builds reveal the verified file instead;
  git checkouts open the release page.
- **Everything from 0.5.0 included:** download-location picker, WebTorrent queue
  that restores paused, the browser library, session restore, find-in-page,
  zoom, microphone/camera prompts, Brave-style privacy protections, Chrome
  extension loading and Windows default-browser setup.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File | Size |
| --- | ---: |
| `Kryvex-Setup-0.6.0-x64.exe` | ~114.6 MiB |
| `Kryvex-Portable-0.6.0-x64.exe` | ~114.3 MiB |

`SHA256SUMS.txt` in the release is authoritative: it is generated from the
published files by `scripts/release-checksums.cjs`, and the updater ignores any
release whose installer has no matching entry. The sizes above come from the
local build of the same source tree.

## Install

1. Run `Kryvex-Setup-0.6.0-x64.exe`.
2. Choose the destination folder in the normal Windows wizard.
3. Add services from **Services → Add**, or start from a catalogue preset.
4. Pick a theme in **Settings → Appearance**, or open **Custom** and build one.
5. Use **Settings → Updates** to confirm the updater sees this release.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

Built from the complete 0.6.0 working tree, then checked against the packaged
build.

- `pnpm typecheck`: exit 0 for renderer and main.
- `pnpm test`: exit 0, **149/149** tests across 18 files.
- `pnpm build`: exit 0; 533.68 kB JS (159.67 kB gzip), 61.77 kB CSS.
- `pnpm capture`: exit 0; **nineteen** 1440×900 PNGs from the running window,
  including the new `settings-custom` colour-studio route.
- `pnpm verify:updater`, pass; a loopback release feed produced an available
  update, a wrong SHA-256 was rejected (`checksum-failed`), the corrected
  download reached `ready` with the Install action, and a source-mode build
  reported the release without offering an install.
- `pnpm run package:win`, exit 0; produced the two artifacts and checksums
  above. The packaged EXE reports version `0.6.0`.
- **Packaged capture:** `release/win-unpacked/Kryvex.exe` completed all
  nineteen capture routes, including the periodic-table picker and the custom
  theme panel.
- **Checksums:** both artifacts were hashed after packaging; the published
  `SHA256SUMS.txt` is regenerated from the uploaded files by the workflow.
- **Authenticode:** both EXEs report `NotSigned`.

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an
  unknown publisher; no code-signing certificate is configured.
- Windows 10/11 requires the user's final confirmation in Default Apps. Kryvex
  cannot silently become the default browser.
- The terminal theme is a visual style, not an embedded shell; there is no
  command execution surface in Kryvex.
- Custom themes are stored as five colours. The app derives the rest, and
  third-party theme-file import/export is still not implemented.
- Torrents restore paused but there is no bandwidth scheduler, ratio limit,
  per-file selection or router port mapping.
- Windows x64 only in this build. macOS and Linux were not exercised.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
