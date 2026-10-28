# Emulator engines: the cartridge engine, and the second engine for Dreamcast

**Status.** The cartridge engine ships unchanged and is the only one a default
install uses. A second engine — Flycast compiled to WebAssembly, for Dreamcast —
now exists behind an explicit, off-by-default switch: it is downloaded from its
publisher on demand, hash-checked, and handed to the same frontend as a packed
core. **Naomi is not offered** (§7) and **no Dreamcast game has been booted on
this machine** (§9). RetroArch was analysed and is not adopted (§10).

Nothing in this document is a claim about hardware this repository has not run.

## 1. What the cartridge engine offers

Its own manifest (`cdn.emulatorjs.org/stable/data/cores/cores.json`, read
2026-10-27) lists **48 cores**. It maps `n64` to
`["mupen64plus_next", "parallel_n64"]` and `psx` to
`["pcsx_rearmed", "mednafen_psx_hw"]`. It contains **no** `flycast`, `reicast`,
`dreamcast` or `naomi` entry — no spelling of them, on `stable`, `latest` or
`nightly`. That list is the contract; a second engine is the only route.

## 2. Why a second engine is not a core name

The frontend loads a core as an archive named `<core>-wasm.data` from its data
path, containing `<name>.js`, `<name>.wasm`, `core.json` and an optional
`license.txt`, and it looks the core up in that 48-entry map. Naming a core the
map does not know is not an error the app can work around: `getCore()` returns
the name straight through, so the frontend happily asks for
`cores/flycast-wasm.data` — a file the CDN does not have.

Upstream Flycast (`flyinghead/flycast`) is **GPLv2** — checked against its
`LICENSE` — and covers Dreamcast, Naomi, Naomi 2, Atomiswave and System SP. The
only WebAssembly build is a third-party project, `nasomers/flycast-wasm`, which
is young enough to be a dependency to prove rather than a component to depend
on. This document is that proof.

## 3. Measured: the bare core

`pnpm verify:flycast` downloads the pinned `v1.0` release, refuses it unless the
size and SHA-256 match (`flycast_libretro.js` 312,644 bytes / `1f2ae9af…`,
`flycast_libretro.wasm` 10,398,725 bytes / `db2b87d8…`), serves it with the
cross-origin-isolation headers the project asks for, and drives it in an
Electron window over loopback:

| Measurement | Result |
| --- | --- |
| Cross-origin isolation | **true** with the headers; the core also loads without them (`--plain`) |
| Instantiation | **~120–145 ms**, 109–110 exports, **256 MB** wasm heap |
| Virtual filesystem | present (`Module.FS`), so a host can place the image |
| `main` | **started and returned** on a junk image |
| Self-driven start-up | **only with the frontend's two callbacks** — a bare host dies on `querySelector('!parent')` until `Module.parent` is supplied, then on a null import-table entry until `getSavExt` and `callbacks.setupCoreSettingFile` exist |

The core is not a standalone player: it is a frontend plugin wearing a bare
Emscripten module. That is why the app reuses the frontend rather than driving
the module itself.

## 4. Measured: the whole pipeline, through the real frontend

`pnpm verify:flycast -- --frontend` compiles `src/lib/flycast.ts` — the app's own
packer — rather than reimplementing it, builds the archive from the pinned
release, serves it, and drives the real frontend the way the app does (`EJS_core
= 'flycast'`, the zip over `EJS_paths`, `EJS_defaultOptions.webgl2Enabled =
'enabled'`, a 64 KB junk `.cdi`). What it reported here:

| Measurement | Result |
| --- | --- |
| Packed archive | **10,712,194 bytes** from the app's packer |
| Archive requested by the frontend | **1 time**, unzipped |
| Core metadata | `core.json` read: core name **`flycast`** |
| Runtime | **`EJS_Runtime` defined** from the packed zip |
| Module | **instantiated, 111 exports** |
| WebGL2 flag | **true**, so the plain build was requested, not `-legacy` |
| Game | **aborts on the junk image** — there is no BIOS and no disc |

Two upstream behaviours shaped the integration, and both are measured rather
than assumed:

- **A core report handed over as a blob is never parsed.** The frontend fetches
  `cores/reports/<core>.json` and treats a blob download as bytes, so
  `buildStart` is missing, the core cache is disabled, and `webgl2Enabled`
  falls to false — which makes it ask for `flycast-legacy-wasm.data`, a build
  this release does not publish. The flag can be set directly instead:
  `EJS_defaultOptions.webgl2Enabled = 'enabled'`. Both archive names are mapped
  to the same payload as a safety net, but the setting is what makes the plain
  name the one that is used.
- **The release contradicts its own loader.** `findWasmBinary()` asks for
  `flycast_libretro_upstream.wasm`; the asset is `flycast_libretro.wasm`. Inside
  the packed archive this is moot (the frontend reads whichever entry ends in
  `.wasm`), but anyone integrating the bare pair meets it in five minutes.

## 5. How the app is put together

Four pieces, each with one job:

1. **`electron/flycast-core.ts`** — the only thing that touches the network. It
   fetches the two pinned files into `userData/flycast/<version>/`, streams
   each into `<file>.part`, verifies size and SHA-256 with
   `downloadArtifact`, renames only after the hash matches, and removes the
   partial file on any failure. It re-hashes on the way out, because the payload
   is the one place where bytes reach a code loader.
2. **`src/lib/flycast.ts`** — the packer. The frontend wants one stored zip; the
   release is two loose files, so this builds the archive in memory (CRC-32 per
   entry, local headers, central directory, EOCD) with `core.json` naming the
   core and its extensions. No compression, deliberately: stored entries have
   no decompressor to disagree with.
3. **The frame** (`emulatorHostDocument`) — receives the zip as bytes, makes a
   blob URL, hands it to `EJS_paths` under `flycast-wasm.data` and
   `flycast-legacy-wasm.data`, and sets the WebGL2 option. Nothing is served
   from disk; the sandbox has no origin to serve from.
4. **The panel** (`src/views/Emulator.tsx`) — the gate. Off (the default) means
   the Dreamcast entry is not in the console list, `.cdi`/`.chd`/`.zip` are not
   accepted, and nothing is downloaded. On means a switch, a download state, an
   install/remove control, and a credit line.

The renderer cannot name a URL, a host, a path or a version: it can ask for the
status, an install, the verified payload, a removal, or a cancel.

## 6. Licence position

The core is **GPLv2** and Kryvex conveys none of it.

- Nothing is bundled: no core file is in the repository, the installer or the
  web build.
- The user's machine fetches the release from its publisher, and the app
  repackages those bytes for the frontend it already runs. That is the same
  arm's-length position the cartridge engine keeps with its CDN cores, not a
  weaker one: the difference is only that Kryvex verifies a hash first.
- The payload carries a licence **notice** naming both projects and the
  licence, and the interface credits Flycast with a link to its source. The GPL
  text itself is not fetched: the publisher serves it gzip-encoded, and a
  downloader that enforces a pinned byte count refuses it (measured). The user
  gets the licence from the same release the binary came from.

If that position is ever rejected, the fallback is shape D in §10: offer to
download RetroArch and its cores as separate software. That is a product
decision, not a code change.

## 7. Naomi is not offered, and why

The frontend chooses the boot file inside a set by extension, from the core's
own `core.json` list, and prefers the first entry whose extension matches. A
Naomi set is a MAME-style archive of `.bin`/`.ic` files, and `bin` is on that
list — so the frontend passes one ROM file as the game rather than the set, and
the board cannot boot. Naomi also wants a multi-file BIOS (`naomi.zip`,
`naomi_boot.bin`) where the slot carries one file.

The honest options are a second loader path that hands the archive through
uncompressed, or an engine that takes a set directly. Neither is measured, so
Naomi is named in the panel's note as not offered instead of shipped broken.

## 8. Link play and saves on the second engine

- **Link play refuses a Dreamcast game.** The room's link is
  checkpoint-synchronised: the host sends a whole save state every 1.5 s, and a
  Dreamcast state is far larger than that interval can carry. The panel says so
  and suggests loading the same image on both machines. Two controllers in one
  room therefore need a game the cartridge engine runs.
- **Save states are engine-scoped by key, not by format.** The store key is
  `system:name-hash:size`, so a Dreamcast state can never be offered to a
  cartridge core. States are not portable between engines, and nothing pretends
  otherwise.

## 9. What is not measured

- **No Dreamcast game has been started.** That needs a BIOS dump and a disc
  image; this repository ships and downloads neither. There is no frame rate,
  no audio result and no compatibility claim in this document.
- **No Naomi title**, for the reason in §7.
- **The installed engine has not been driven from the packaged app.** The
  installer path (`flycast-core.ts`) is covered by unit tests and the download
  primitives are shared with the speech runtime, but the end-to-end
  install→play path needs a BIOS on a real machine.

The way to close that: run the packaged app on two reference machines, install
the engine, and load one Dreamcast title with its BIOS. Only then does the
status line earn the word "playing".

## 10. The RetroArch question, in four shapes

| Shape | What it is | Licence position | Gets us | Cost |
| --- | --- | --- | --- | --- |
| **A. Keep the cartridge engine** | The embedded frame, `nes` … `n64`, `psx` | No GPL code is conveyed: the engine and its cores are fetched by the user's client from the project's own CDN | A wide cartridge range, PSX, N64, save states, link play | No Dreamcast |
| **B. Second WASM engine** (shipped) | A Flycast build fetched at run time and packed by the app, inside its own sandboxed frame | Same arm's-length position: Kryvex ships no copy, verifies a hash, and the build's licence travels with it | Dreamcast, Atomiswave (Flycast covers it) | A second engine, a second payload, a second save story |
| **C. Vendor or fork RetroArch** | Bundle or modify a GPL-3.0 application inside the app | **The combined distribution becomes GPL-3.0** | Every upstream core | A licence change for the whole product, not a feature |
| **D. Native sidecar** | Offer to download RetroArch and its cores and launch it as its own application | Kryvex conveys nothing | Every core upstream ships, including PS2 | A separate window, separate save storage, no in-app link play |

**C is rejected.** It trades the project's licence for a core list.

**B is what shipped**, with the Dreamcast system hidden until the switch is on.
**D shipped in a narrower form** — not a downloader, but a sidecar that runs the
RetroArch the user installed, which is what makes real netplay possible. It is
described in [NETPLAY.md](NETPLAY.md); it does not carry PS2, because Kryvex does
not install cores for the user.

## 11. Non-goals

- No BIOS, ROM or arcade ROM-set bundling, ever: the slot takes files the user
  already owns.
- No automatic download of system files to make a title boot.
- No claim of universal compatibility, and no claim that a WASM Dreamcast core
  holds full speed on hardware this project has not tested.
- No "all cores" marketing line while the engine list is what it is.

## 12. Open questions

- **Naomi scope.** A second loader path that passes an archive through
  uncompressed, or an engine that reads sets natively — which is worth its
  complexity?
- **Save-state portability** between the WASM engine and a native RetroArch
  installation, if D ever ships beside B.
- **Hosting.** Today the core comes from its publisher's GitHub release, pinned
  by hash. A self-hosted, hashed copy would remove the dependency on that
  project's release staying up; the licence review would have to cover
  redistribution rather than fetching.

## 13. Netplay, in the same breath

Two different things are called netplay here, and they are not interchangeable.

**The frontend's own netplay** exists but is experimental and relayed: its
4.2.3 bundle gates the whole feature on `EJS_DEBUG_XX &&
EJS_EXPERIMENTAL_NETPLAY` and defaults to `https://netplay.emulatorjs.org` over
socket.io. Kryvex does not switch it on — a third-party relay would move game
data off the peer-to-peer path the rest of the room promises.

**Kryvex's link play** is its own, inside the room: the host sends the cartridge
once, streams both controller seats, and hands over a save state on a slow
clock so the guest cannot drift far. Swapping engines does not remove the need
for it, and adding one does not make it work for a system whose states are too
large to send (§8).

**Real netplay is RetroArch's**, launched as a sidecar (`-H` / `-C`) and never
shipped by Kryvex. That is shape D used for the one thing it does better than
either embedded engine, and [NETPLAY.md](NETPLAY.md) is its document. The two
features are deliberately separate: the room stays the peer-to-peer path, and
netplay stays the engine's own protocol over TCP.
