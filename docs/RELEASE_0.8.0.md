# Kryvex 0.8.0 — Windows release

Prepared 2026-10-20; publishes from the `v0.8.0` tag. This release runs a GGUF
model file you already have, presents a real Chrome identity to embedded
services, lets the shield take your own filter lists, and tells you plainly when
a check finds no update.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.0 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.0).

## Highlights

- **Run a model file.** Vexium no longer needs Ollama or LM Studio: **Settings →
  Vexium → Run a model file** takes a `.gguf` you already downloaded and starts
  llama.cpp's `llama-server` against it on a free loopback port. The runner asks
  the OS for the port, binds `--host 127.0.0.1` so nothing is exposed to the LAN,
  polls `/v1/models` while a large file loads, and reports `starting → running`
  or an error with the last lines of output. Context size and GPU layers are
  adjustable, a `.js`/`.mjs`/`.cjs` path runs on Electron's own Node, and the
  process is killed on **Stop server** or quit. Kryvex ships no weights, hosts
  nothing and uploads nothing.
- **A Chrome identity for embedded pages.** Google was refusing module sign-ins
  because Electron announced itself and sent no client hints. Guests now report
  `Google Chrome / Chromium / Not(A:Brand` with a full version list through
  `getHighEntropyValues` and `Sec-CH-UA` headers on the wire, while farbling
  wrappers keep `Function.prototype.toString` reporting native code.
- **My filters.** **Settings → Shield → My filters** accepts the uBlock Origin
  syntax people already paste — `||ads.example.com^`, `example.com##.ad`,
  `example.com##+js(…)` — and compiles it from the cached lists, so applying
  needs no download. Scriptlet rules are behind their own switch, the editor
  imports and exports plain text, and a YouTube preset bundles ad and feed
  blocking for one site only. See [ATTRIBUTION.md](ATTRIBUTION.md) for the
  upstream credit.
- **Sign-ins survive a restart.** Sessions for every service partition and the
  default session are now flushed to disk before the window closes (capped at
  1.5 s). Previously a module signed into shortly before quit reopened signed
  out, because Chromium had not written its cookie store.
- **Up to date, visibly.** A check that finds nothing newer shows a green
  **UP TO DATE** verdict with a check mark beside the running version, and a
  manual **Check for updates** confirms with a toast naming that version. A
  local build ahead of the newest published release gets the same verdict,
  because no update is available either way.
- **Translation coverage is enforced.** `npm run audit:i18n` scans JSX text and
  human-facing attributes for strings that bypass `t()`, and `tests/i18n.test.ts`
  runs it in the suite. The new shield editor, model runner, sign-in notice and
  verdict are translated for es/de/fr; edition marks stay as brand names.

Everything from 0.7.0 is included: Rooms with presence, chat and screen share;
Vexium against Ollama or LM Studio over loopback; the Chromium engine panel; the
first-run theme gallery; the opt-in wallpaper; and the updater with mandatory
checksum verification.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.0-x64.exe` |
| `Kryvex-Portable-0.8.0-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry. Exact sizes are listed on the release page.

## Install

1. Run `Kryvex-Setup-0.8.0-x64.exe`, or let 0.7.0 update itself through
   **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. For a model file, install llama.cpp and point **Find runtime…** at
   `llama-server.exe`, or drop a `.js` wrapper beside the model.
4. Use **Settings → Updates** to confirm the up-to-date verdict sees this
   release.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

Run from the 0.8.0 working tree on Windows with Node 24.19.0, Electron 44.2.0
and pnpm 12.3.4. `pnpm` is not on this shell's PATH, so the same entry points
were run directly with npm, npx and node.

- `npm run typecheck` — exit 0 for renderer and `electron/`.
- `npx vitest run` — exit 0, **261/261** tests across 27 files.
- `npm run build` — exit 0 for the renderer and main process.
- `node scripts/verify-updater.cjs` — PASS: available release, rejected
  checksum, verified download, `ready` UI, source mode refusing to install, a
  missing release reported, and the up-to-date branch rendering the verdict
  with the theme's success colour.
- `npx electron scripts/verify-local-model.cjs` — PASS: a `.gguf` accepted, a
  non-GGUF path refused, the stand-in runtime started on loopback,
  `/v1/models` reported it, a reply streamed and the process stopped.
- `node scripts/verify-service-engine.cjs` — PASS, including the cookie
  surviving a restart and per-service clearing.
- `node scripts/verify-restart.cjs` — PASS.
- `npm run audit:i18n` — clean.

`verify-identity` and `verify-shield-filters` had already passed against this
tree and were not re-run for this cut because their inputs did not change.
Per-pass details and every check that was **not** run are in
[TESTING.md](TESTING.md).

## Known limitations

- The artifacts are **unsigned**. Windows SmartScreen may warn about an unknown
  publisher; no code-signing certificate is configured.
- A model file needs a llama.cpp build the user supplies. Kryvex does not bundle
  it, download it or check its version, and no real GGUF weights or GPU were
  available on the build machine, so inference speed was not measured.
- Filter rules depend on the upstream `@ghostery/adblocker` engine. Only uBO's
  `set`/`set-constant` scriptlets are implemented; other scriptlet names are
  skipped and the panel says so.
- The Chrome identity unlocks the Google form but a completed Google or Discord
  sign-in was not exercised: that needs real credentials at the keyboard.
- Rooms was verified with two instances on one machine and one screen. Two
  machines across the internet, a forced-TURN peer and system-audio capture were
  not exercised.
- Windows x64 only in this build. macOS and Linux were not exercised.
- Fingerprint farbling is a JavaScript preload wrapper, not a Chromium patch;
  worker/offscreen contexts and determined detection remain gaps.
