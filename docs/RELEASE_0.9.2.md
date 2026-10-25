# Kryvex 0.9.2: Windows release

Prepared 2026-10-25 for the `v0.9.2` tag. This release makes Vexium Core the
assistant the app actually ships with: a reviewed 3B core installed from the
first run in one press, one identity prompt and deterministic tools behind it,
and no pointer to another local runtime on a fresh install. It also lets a
pinned service be dragged upward, which the tester's sidebar could not do.
Everything in 0.9.1 is included, including link play, floating modules and the
translation sweep.

The assets are attached to the published
[Kryvex 0.9.2 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.2)
by the tag-triggered workflow. This record and its wizard capture were committed
before the tag, so the workflow had both to check (`pnpm release:check`).

## What changed

- **Vexium Core is a real assistant, not a loader.** The default core is
  `vexium-core-3b-q4_k_m.gguf` (Qwen2.5-3B-Instruct, Q4_K_M), published on
  `XiONDiGiTaL/Vexium-Core` release `v2` and pinned in
  `electron/model-catalogue.ts` at 2,104,932,768 B and SHA-256
  `626b4a66…15c62d`. The 1.5B stays in the catalogue as **Vexium Core Light**
  under an unchanged id and filename, so a machine that already verified it
  downloads nothing again. Rules: `electron/model-rules.ts`,
  `src/lib/vexium-core.ts`. Details: [VEXIUM_MODELS.md](VEXIUM_MODELS.md).
- **One system turn and low sampling.** `buildMessages()` puts one
  `VEXIUM_SYSTEM_PROMPT` identity in front of the conversation with the current
  date and any verified tool facts; a renderer-supplied `system` turn is dropped.
  Sampling is `temperature 0.3`, `top_p 0.9`, `max_tokens 768` instead of 0.7
  with no system turn, which is what made the 1.5B open ordinary questions with
  a copyright refusal. Rules: `electron/assistant-rules.ts`.
- **Deterministic workspace tools.** Arithmetic, unit conversion, great-circle
  distance and date questions are answered by `src/lib/assistant-tools.ts`
  before the model is asked, and the computed fact is passed into the prompt, so
  a 3B model no longer invents "18% of 240". Tests: `tests/assistant-tools.test.ts`.
- **Vexium Core installs from a first run.** With no core present the Vexium page
  says so and the empty thread carries the install itself — **Install Vexium
  Core 3B · 1.96 GiB** → progress → **Verifying the download…** → running. The
  generic "no local runtime, start Ollama or LM Studio" notice and the
  Hugging Face **Get a model** link are suppressed while the core is missing; a
  machine that already runs Ollama or LM Studio keeps that path in Runtime
  settings. UI: `src/views/Assistant.tsx`. Details: [ASSISTANT.md](ASSISTANT.md).
- **Pinned services drag upward.** `moveService()` in `src/lib/store.ts` reorders
  the service array in one direction-agnostic move, and the sidebar uses a drop
  indicator at the edge the row will land on, so a pinned service can be dragged
  to the top instead of only downward. Tests: `tests/store.test.ts`.
- **Web client republished at 0.9.2.** `gh-pages` was rebuilt from the 0.9.2
  sources as commit `825f945` and its worker cache rotated to
  `kryvex-web-0.9.2-v1`, so the footer and the shell a phone caches both report
  the release they were cut with.

## Artifacts

Built locally by `pnpm package:win` from the working tree at `f9142b8` (no EPERM
on `release/win-unpacked`), then installed by the wizard capture below:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.2-x64.exe` | 134,313,725 B (128.09 MiB) | `8954ada3f831ef29ec22a3c2fbfeeb3d144a42b97e395e5c6ce6c489d819574f` |
| `Kryvex-Portable-0.9.2-x64.exe` | 134,076,589 B (127.87 MiB) | `580baa2b9ae0540715fa3383ee9a8e020646ef29a55ffaa11896c7703eaabfeb` |

The CI pair is built from the same sources by the tag workflow and carries its
own hashes in the release's `SHA256SUMS.txt`; only the build environment
differs. Both EXEs are **unsigned**, and the updater ignores a release whose
installer has no matching checksum entry. The packaged tree is about 467 MB, of
which 44 MB is the bundled llama.cpp runtime, and the wizard reports **Space
required: 465.8 MB**. No model weights are bundled: the 2.1 GB core is fetched
once, on the user's press, from the Vexium Core release.

## Install

1. Run `Kryvex-Setup-0.9.2-x64.exe`, or let an installed 0.9.1 update itself
   through **Settings → Updates**.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place; shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in.
3. Open **Vexium**. With no core installed the thread offers **Install Vexium
   Core 3B · 1.96 GiB**; that one press downloads, verifies and starts it.
4. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/` in strict mode.
- `npx vitest run`: exit 0, **701/701** tests across 67 files, including the
  assistant tool rules (`tests/assistant-tools.test.ts`), the pinned reorder
  (`tests/store.test.ts`) and the translation ratchet
  (`tests/i18n-coverage.test.ts`).
- `pnpm package:win`: exit 0, producing the pair above with no EPERM on
  `release/win-unpacked`; `ProductVersion` reads `0.9.2`, and
  `release/win-unpacked/Kryvex.exe` reads `0.9.2.0`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.2-x64.exe --version 0.9.2`: PASS — four pages
  captured, install page ran for 22,000 ms, installer exited 0, capture archived
  under `docs/media/releases/0.9.2-wizard/`, and the installed
  `C:\Kryvex\Kryvex.exe` reports `ProductVersion 0.9.2.0`.
- **Vexium Core from a first run**, driven in the packaged Electron build on a
  clean `userData`: the page read "Vexium Core is not installed." with the
  **Install Vexium Core 3B · 1.96 GiB** call to action and no Hugging Face or
  Ollama pointer; the press downloaded 1.96 GiB from the release, verified the
  checksum, configured and started it in **27 s**, the card then read
  `vexium-core-3b · 4096 context · http://127.0.0.1:11534`, and
  "What is 18% of 240?" answered **"18% of 240 is 43.2."** in 2.4 s.
- `pnpm build:web`: PASS (1.6 MiB), `scripts/check-web-build.cjs` PASS, bundle
  `assets/index-BsVxj6u-.js`, stylesheet `assets/index-D6pb3bHp.css`, worker cache
  `kryvex-web-0.9.2-v1`.
- **Web client**: `gh-pages` pushed as commit `825f945`, the GitHub Pages build
  for that commit reports `built`, and the live site serves the new bundle with
  the footer reading **v0.9.2**.
- `node scripts/check-release-record.cjs`: PASS for 0.9.2.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built 0.9.2 installer before the tag,
and is committed with this record:
[capture.md](media/releases/0.9.2-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.2-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.2" |
| 2 | [Choose Install Location](media/releases/0.9.2-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 465.8 MB"; "Space available: 54.9 GB" |
| 3 | [Installing](media/releases/0.9.2-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.2" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.2-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The run took 34,059 ms in total and 22,000 ms on the install page, and exited 0.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The first-run install was measured on a clean profile. A machine that already
  has Vexium Core Light shows **Switch to Vexium Core 3B** and was not exercised
  in this cut; it downloads the same pinned asset through the same path.
- A 3B model is still a small model. It is given deterministic tools for maths,
  units, distance and dates and refuses to claim it browsed, but it should not be
  trusted for current facts or for advice.
- The web client's edge cache still hands a previously visited browser the
  earlier `sw.js` for up to four hours, so an already-installed PWA keeps its
  0.9.1 cache name until then; navigation is network-first, so the page itself
  is the new build immediately.
- Google still decides the account step, unchanged from 0.9.0; the service view
  offers **Reset session & retry** and **Open externally**.
- Link play was exercised in the renderer, not between two machines.
- The bundled runtime is **CPU-only** and x64.
