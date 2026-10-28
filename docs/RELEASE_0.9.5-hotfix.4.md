# Kryvex 0.9.5-hotfix.4: a flagship model, real netplay, and a second emulator engine

Prepared 2026-10-28 for the `v0.9.5-hotfix.4` tag. This is a fix batch, so the
version line stays at **0.9.5** and the build wears the `-hotfix.4` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5, 0.9.5-hotfix.1,
0.9.5-hotfix.2, 0.9.5-hotfix.3 and 0.9.5-hotfix.4 is included.

**Why not `0.9.5.1`.** A fourth component was the first choice and it cannot be
built: `electron-builder` validates `package.json`'s `version` as strict semver
and refuses `Invalid version: "0.9.5.1"` before it packages anything, and npm
rejects the same string. The project's own `-hotfix.N` suffix is the mechanism
built for exactly this — `compareVersions()` in `electron/update-rules.ts` ranks
`0.9.5-hotfix.4` **above** `0.9.5`, so a machine on the release is offered its
patch rather than waiting for a new line.

This batch completes four things the line promised and repairs what running them
turned up.

- **Vexium has a flagship that asks instead of guessing.** `Vexium-1` is
  published on Hugging Face (`XiONDiGiTaL/Vexium-1`, revision `87c8324`,
  `vexium-1-12b-q4_k_m.gguf`, 7,477,209,792 bytes, SHA-256 `26b5ad94…65b6ecb`)
  and pinned in the model catalogue. The weights are
  `Mistral-Nemo-Instruct-2407` at Q4_K_M, **not retrained or merged**: three
  metadata keys changed and the card says so in its first table. What made it
  answer the reported failures correctly is the contract around the weights —
  the chat template, the app's system turn and the planner/tools — because the
  failures were behavioural, not parametric.
- **Netplay is netplay now, and it runs on RetroArch.** The room's link play is a
  checkpoint channel; the frontend's own netplay is hidden, experimental and
  relayed through a third-party service. Kryvex adds a **NETPLAY (RETROARCH)**
  panel that finds the copy the user installed, lists the cores it actually has,
  and launches host or guest — without bundling, downloading or linking
  RetroArch, which is GPLv3.
- **Dreamcast and Naomi are a second engine behind an explicit gate**, and
  Nintendo 64 joins the console list the shipped engine already resolves.
- **The rooms pop-out can be parked on the Workspace**, and leaving a room no
  longer strands its window over everything else.

## What changed

- **The flagship model (`electron/model-catalogue.ts`, `electron/model-rules.ts`,
  `src/components/ModelManager.tsx`, `src/lib/local-models.ts`).** A pinned entry
  with its publisher, revision, byte count, checksum, licence, memory estimate
  and languages, downloaded only on a press that verifies size and SHA-256
  before the file is used. The resolve URL 302s to `us.aws.cdn.hf.co` (allowed
  by suffix) with a `content-length` equal to the pinned byte count. The
  flagship is labelled by its quantisation instead of being called "light".
- **A silent llama.cpp failure, fixed (`electron/local-model-rules.ts`).**
  Without `--jinja`, llama.cpp cannot render a template that uses `set` or
  filters and silently substitutes a generic one, so the whole contract vanished
  while `llama-cli` looked healthy. `buildServerArgs()` passes the flag, and
  `GET /props` returning the 5,109-character template is the check that it took
  effect.
- **The planner and tools (`electron/vexium-planner.ts`,
  `electron/vexium-tools.ts`, `electron/assistant-rules.ts`,
  `electron/assistant.ts`).** Asking to look something up, refusing to invent a
  figure, and answering a Turkish question in Turkish are rules in these
  modules, so correcting one is a text edit rather than a re-train.
- **The RetroArch sidecar (`electron/retroarch.ts`,
  `electron/retroarch-catalogue.ts`, `src/lib/netplay.ts`,
  `src/views/Emulator.tsx`).** `-H` hosts and waits, `-C <host>` joins, `--port`
  defaults to 55435. The cartridge is written to `userData/retroarch/roms` and
  cleared on every start; the sidecar is stopped on quit. The renderer can ask
  for a status, open the main process's file dialog, start a session or stop one
  — it cannot name an executable or a URL — and a join address is parsed before
  it becomes an argument (`fe80::1`, `10.0.0.4`, `host:port` accepted; schemes,
  paths, spaces and out-of-range ports refused with a sentence). It polls every
  5 s because RetroArch can be closed from its own window, and it never claims
  "connected": there is no machine-readable session line, so the two players
  confirm each other by nickname inside RetroArch.
- **The second engine (`electron/flycast-core.ts`, `electron/flycast-catalogue.ts`,
  `src/lib/flycast.ts`, `src/lib/emulator.ts`).** Two pinned files
  (`flycast_libretro.js`, `flycast_libretro.wasm`, 10,711,369 bytes) are fetched
  into `userData/flycast/v1.0/`, streamed to `<file>.part` and verified by size
  and SHA-256 before a rename, then re-hashed on the way out because the payload
  reaches a code loader. `src/lib/flycast.ts` packs them into the single stored
  archive the frontend wants, with a `core.json` and a `license.txt` carrying the
  attribution. Off by default: with the switch off there is no Dreamcast entry,
  `.cdi`/`.chd`/`.zip` are refused and nothing is fetched.
- **Nintendo 64 (`src/lib/emulator.ts`).** `.n64`, `.v64` and `.z64` are one dump
  in different byte order and all open `mupen64plus_next` (with `parallel_n64` as
  the fallback). It is a cartridge, so it is measured against the 64 MB cap, and
  the note about the higher memory cost is translated into all five languages.
- **Link play can renegotiate (`src/lib/netplay.ts`, `src/lib/party.ts`).** A
  guest that pressed *Join* before the host pressed *Host this cartridge* waited
  for ever. It now repeats its announcement every three seconds, offers *Ask
  again*, and stops with an explanation instead of waiting on a packet that was
  dropped before it existed; the host remembers the peer it sent to so the
  cartridge is not sent twice.
- **A popped-out room can be parked, and docks itself (`src/lib/workspace.ts`,
  `src/lib/floating.ts`, `src/views/Workspace.tsx`, `src/components/shell.tsx`,
  `electron/popup-tabs.ts`).** `moveWindow` translates across the boundary in
  both directions — a float dragged onto the canvas becomes a canvas window where
  the title bar was released, and a canvas window pushed more than 48 px past the
  board becomes a float — using the canvas's own origin, because the surface
  starts below the header and right of the sidebar. A room that was live and
  ended docks its pop-out; one taken from the lobby is left alone.
- **Pins for the in-house services (`src/lib/service-drag.ts`,
  `src/components/ToolWindowBoard.tsx`, `src/views/Services.tsx`,
  `src/components/ServiceDialog.tsx`).** The built-in tools drag onto the
  workspace like the catalogue services, and the service options panel closes on
  a press outside it.
- **Translations.** Every new string lands in `es`, `de`, `fr` and `tr`, with the
  coverage ratchet in `tests/i18n-coverage.test.ts` extended so the backlog can
  only fall.
- **Version 0.9.5-hotfix.4.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.5-hotfix.4-v1`) move together. The packaged binary reports
  `ProductVersion 0.9.5.0` / `FileVersion 0.9.5-hotfix.4`, the same shape the
  earlier hotfixes of this line use.

## Artifacts

The `v0.9.5-hotfix.4` tag runs the Release workflow (`windows-latest`, Node 22,
pnpm 10), which builds and attaches:

- `Kryvex-Setup-0.9.5-hotfix.4-x64.exe`
- `Kryvex-Portable-0.9.5-hotfix.4-x64.exe`
- `SHA256SUMS.txt`

The workflow builds what it publishes, so those files — not the locally built
pair used for the wizard capture below — are the ones to check a download
against. Both EXEs are **unsigned**.

**Web client.** The same tag rebuilds and force-pushes `gh-pages`; the published
worker names `kryvex-web-0.9.5-hotfix.4-v1`, so the site reports this version.

## Install

1. Run `Kryvex-Setup-0.9.5-hotfix.4-x64.exe`, or update an installed 0.9.5
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. Shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in and the board keeps its layout.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/`.
- `pnpm test`: **1038/1038** across 91 files, including the new
  `tests/flycast.test.ts`, `tests/retroarch.test.ts`, `tests/netplay.test.ts`,
  `tests/emulator.test.ts`, `tests/assistant.test.ts` and the extended
  `tests/i18n-coverage.test.ts`.
- `pnpm build`: exit 0, and `pnpm package:win` produced
  `release/Kryvex-Setup-0.9.5-hotfix.4-x64.exe` (137,362,603 B) and
  `release/Kryvex-Portable-0.9.5-hotfix.4-x64.exe` (137,118,701 B).
- `pnpm verify:flycast` (bare and `--frontend`): the packed archive is
  10,712,194 bytes, the frontend requests it once, reads `core.json`, defines
  `EJS_Runtime`, instantiates the module with 111 exports and 256 MB of heap, and
  aborts on the junk probe image because there is no BIOS or disc — the numbers
  the second-engine section of [EMULATOR_ENGINES.md](EMULATOR_ENGINES.md) records.
- `pnpm verify:netplay`: **PASS**, ten checks — 22 consoles with nothing
  installed, a differently named executable refused, the chosen copy reporting
  its Flycast and FCEUmm cores, a console with no core refused with the candidate
  file names, an undialable address refused, the cartridge written byte-for-byte
  under `roms/`, the process spawned with its exit and stderr captured,
  `10.0.0.4:55535` parsed into a session, and `stop()` back to idle. Plus 11 unit
  tests for flags, names, addresses and cartridge naming.
- `pnpm verify:shell-batch`: **PASS**, 26 checks in the built app, including
  dragging the rooms pop-out onto the Workspace (it becomes an `absolute` window
  inside the canvas and still holds the room), dragging it back off (it becomes a
  `fixed` float again) and *Bring it back* afterwards.
- `pnpm verify:inhouse`: **PASS**, 29 checks over Arcade, File Forge and Canvas,
  including their pins onto the workspace.
- Vexium-1, measured through the shipped template (`llama-server --jinja`,
  Vulkan, RX 7900 XT, 99 GPU layers, 4k context, ~73 tok/s): a Turkish question
  about today's Bitcoin price with no sources supplied asks in Turkish to look it
  up and states **no** figure; the same question with one supplied source answers
  `Bitcoin'in bugünkü fiyatı 67.412 ABD Dolarıdır.`; `Türkiye'nin en kalabalık
  şehri hangisi ve neden?` gets `İstanbul. Çünkü en büyük nüfusa sahiptir.`;
  `What is the capital of Turkey?` gets `Ankara`. The first build answered that
  Turkish price question in English, which is why the template was rebuilt and
  the artifact replaced **before** publishing.
- `GET /props` on the running server returns the 5,109-character Vexium
  template, which is how `--jinja` taking effect was confirmed rather than
  assumed.
- The pinned resolve URL 302s to `us.aws.cdn.hf.co` with a `content-length`
  equal to the pinned byte count.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record: [capture.md](media/releases/0.9.5-hotfix.4-wizard/capture.md).

Recorded 2026-10-28T11:05:51Z from a locally built installer of this working tree
(`pnpm package:win`, Electron 44.9.3, x64), which is not one of the published
files: it measured 137,362,603 B Setup and 137,118,701 B Portable. The wizard
found the existing per-user installation in `C:\Kryvex` and upgraded it in place.

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.5-hotfix.4-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.5-hotfix.4" |
| 2 | [Choose Install Location](media/releases/0.9.5-hotfix.4-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 486.3 MB"; "Space available: 36.9 GB" |
| 3 | [Installing](media/releases/0.9.5-hotfix.4-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.5-hotfix.4" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.5-hotfix.4-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 24,368 ms between **Installing** and **Completing Kryvex
Setup**, all four pages were photographed, and the installer exited 0. The wizard
found no running copy to close first, so the capture has the four pages above
rather than the five a stopped install produces.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **Netplay needs RetroArch installed, with the same core on both machines and
  TCP 55435 reachable on the host.** Kryvex does not bundle, download or link it.
- **No netplay session was played.** The harness uses a fake `retroarch.exe` and
  proves Kryvex's own half; no frame crossed a network and no latency was
  observed. The two-machine plan is in [NETPLAY.md](NETPLAY.md).
- **No Dreamcast game was started.** That needs a BIOS and a disc image, neither
  of which this repository ships or downloads. Naomi is not offered at all: the
  frontend passes a set's first `.bin` as the game, so the board cannot boot.
- **The 7 GiB flagship download was not run end to end through the app**; it
  shares the verified 3B path. Four Turkish prompts are not a Turkish
  evaluation, and no long-form benchmark was run.
- **Vexium-1 is not a fine-tune.** Its behaviour comes from the template, the
  system turn and the tools; the weights are Mistral-Nemo-Instruct-2407 at
  Q4_K_M, which the model card states.
- **Nintendo 64 was measured by core resolution, not by booting a game** — that
  needs a real cartridge.
