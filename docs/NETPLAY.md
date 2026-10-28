# Netplay

Kryvex has two ways to play with another person. They are different features, and
neither pretends to be the other.

| | **Link play (Rooms)** | **Netplay (RetroArch)** |
| --- | --- | --- |
| Transport | The room's own peer-to-peer data channel | RetroArch's own netplay (TCP) |
| What moves | The cartridge, two controller frames, and a save state every 1.5 s | Frame-synchronised input |
| Engines | The cartridge engine and the second engine | Whatever RetroArch runs |
| Rooms required | Yes | No |
| Where it renders | In Kryvex, on the emulator screen | In RetroArch's own window |
| Honest summary | Two cores kept close by checkpoints | Real netplay |

## Why link play cannot become netplay

Link play was built to answer "can two people play the same cartridge without a
third-party service?"

- The host sends the cartridge once, chunked, so the guest never needs the file.
- Both cores run locally; the host is authoritative and its save state is pushed
  to the guest every 1.5 s so the two cannot drift far.

That is a checkpoint channel, not netplay. A guest running its own core re-simulates
between snapshots, so its input is always at least one interval late, and every
snapshot is a correction the player can feel. Frame-synchronised netplay needs the
two cores to consume the same input on the same frame, which needs rollback or a
fixed input delay plus a shared clock — that is an engine feature, not something a
transport can add. This is also why a Dreamcast game is refused: a Dreamcast state
is far larger than 1.5 s of transport can carry, and its core is far heavier than
the 8-bit ones the channel was measured against.

The clean fix would be a netplay-capable core. The cartridge engine's own netplay
exists but its maintainer describes it as "a mess right now" and it has not reached
stable; it also routes through a third-party relay, which would move game data off
the peer-to-peer path the room promises. Building rollback into a WASM core is a
project, not a switch.

## What ships instead

**Netplay runs on RetroArch.** RetroArch implements netplay properly and exposes it
on the command line, which is all a sidecar needs:

```
retroarch -L <core> -H --port 55435 --nick <name> <game>
retroarch -L <core> -C <host> --port 55435 --nick <name> <game>
```

`-H` hosts and waits for a player; `-C` joins one. Kryvex finds the copy the user
installed, writes the loaded cartridge to a temporary file, and starts it.

**Kryvex never downloads or bundles RetroArch.** That is a licence decision, not a
technical one: RetroArch is GPLv3, and shipping it inside an MIT application's
installer is exactly the redistribution question this project refuses to answer
casually. Every core on the buildbot has its own licence too — some are
non-commercial — so a Kryvex downloader would have to curate them. The user installs
RetroArch and the cores they want through RetroArch's own updater, and Kryvex only
runs what is already there. Nothing in the app knows a RetroArch URL.

### Where it is wired

| File | Job |
| --- | --- |
| `electron/retroarch-catalogue.ts` | Console → core table, usual install paths, the argument list, address parsing, cartridge file names. Pure. |
| `electron/retroarch.ts` | Finds the executable, lists installed cores, writes the cartridge, spawns host or guest, stops on quit. Electron is not imported, so it is testable. |
| `electron/main.ts` | Five narrow IPC handlers; the file dialog is the only way a path enters the main process. |
| `src/lib/retroarch.ts` | The failure ids as sentences the interface translates. |
| `src/views/Emulator.tsx` | The **NETPLAY (RETROARCH)** panel: locate, status, per-console core check, host, join, stop. |
| `tests/retroarch.test.ts` | The rules, the refusal cases, and the sidecar's own state machine with a fake install. |

### What the panel does and does not do

- It reports whether RetroArch was found and where, and offers a dialog to point at
  a different copy. The remembered path is a JSON file in the app's own profile.
- It names the missing core for the loaded console (`fceumm_libretro.dll` and so
  on) instead of "netplay unavailable", because the fix is in RetroArch's updater.
- It shows the host's own LAN address with the port, so it can be read out.
- It refuses a join address it cannot dial: schemes, paths, spaces and out-of-range
  ports are a sentence in the panel, not a process that exits quietly.
- It never claims a session is up beyond "RetroArch was started". RetroArch does
  print `[Netplay] … has joined as player 2`, and those lines are now captured and
  shown in the panel, but the panel does not turn them into a state it asserts:
  the two players confirm each other by nickname inside RetroArch.

## Requirements the user has to meet

1. **RetroArch installed**, with `retroarch.exe` on a usual path or chosen once in
   the panel.
2. **The same core on both machines**, from RetroArch's own core updater. Kryvex
   picks the first installed candidate for the console; both players must end up on
   that same core.
3. **The same content.** RetroArch matches the game by content CRC, so the file
   names may differ, but it must be the same dump. A BIOS, where a core needs one,
   is RetroArch's business — it reads its own `system` directory.
4. **TCP 55435 reachable on the host.** On a LAN this is the firewall; across the
   internet it is a port forward on the router. Kryvex does not do NAT traversal and
   does not pretend to: no relay, no lobby, no account.

## Licence position

- RetroArch: **GPLv3**, a separate program. Kryvex launches it with an argument
  list; it does not link against it, embed it, modify it or redistribute it.
- Cores: each has its own licence. Kryvex downloads none and names none as its own.
- Kryvex's own code for this feature is MIT, like the rest of the repository.

## What the session runs on

A session is not just an argument list; it also decides which files RetroArch
reads and writes. Five things were changed after running one against a real
RetroArch 1.22.2 install:

- **Kryvex's own configuration (`-c`).** RetroArch writes the configuration it ran
  with when a session ends, so a session Kryvex started was leaving its netplay
  state in the user's `retroarch.cfg`. Kryvex now writes its own copy under
  `userData/retroarch/retroarch.cfg` from the user's file on every start, with the
  netplay and save-directory keys removed and `config_save_on_exit = "false"`,
  so the user's settings are read but never rewritten.
- **Its own saves and states.** Netplay redirects saves into a `.netplay` folder;
  both directories now point at Kryvex's profile instead of the RetroArch install.
- **No lobby announce.** `netplay_public_announce = "false"`: a room's session is
  private, and the announce makes RetroArch talk to the lobby while it starts.
- **NAT traversal only for the host.** A guest has nothing to map, and a guest
  that tried blocked on the handshake.
- **The log (`-v --log-file`).** RetroArch is a GUI-subsystem program: given a
  pipe or a file handle it writes nothing, and `--log-file` on its own still
  writes nothing. Both switches together are what put `[Netplay] …` lines in the
  panel, and that is also how a failed session becomes a sentence instead of a
  window that never connects.
- **The port typed into the panel.** A join used to always dial 55435 because the
  parsed port was dropped on the way to the argument list; `10.0.0.4:55535` now
  dials 55535.

## What is measured, and what is not

Measured on this machine:

- The rules: argument lists, nickname and address validation, cartridge file
  naming, install-path discovery, the session configuration above, and the
  sidecar's refusal cases (`not-found`, `no-core`, `rom`, `address`) with a fake
  install — 13 unit tests.
- The sidecar's own half, end to end, with `pnpm verify:netplay`: a fake
  `retroarch.exe` (a copy of `cmd.exe`) plus a `cores/` folder. It found the
  install, listed its Flycast and FCEUmm cores, refused a console with no core
  and named the candidates, refused an address it cannot dial, wrote the
  cartridge byte-for-byte into `roms/`, spawned the process with the documented
  flags, captured its exit and its stderr, parsed `10.0.0.4:55535`, and returned
  to idle on stop. Ten checks, exit 0.
- **A real session, with a real RetroArch 1.22.2 and its `fceumm` core**, using a
  synthetic NES image (an iNES header and `JMP $8000`; this repository ships no
  game). Kryvex hosted, a second RetroArch joined it, and the guest's own log said
  `Connected to: "KryvexHost"`, `You have joined as player 2 (ping: …)` and
  `Loaded the host's state at frame …` — three runs. Kryvex joined a real host on
  a non-default port once, and that host logged
  `KryvexGuest has joined as player 2 (ping: …)`.
- The panel and the bridge compile in both TypeScript projects, and the copy is
  translated into all five languages (the coverage audit counts zero new
  untranslated strings).

**Not measured, or not repeatable here:**

- **A session across two machines.** Every session above was two processes on
  this one desktop, loopback. No frame has crossed a network.
- **Repeat runs were inconsistent on this machine.** A second session minutes
  after the first sometimes sat in netplay without connecting and without an
  error, and the same pair of raw RetroArch instances behaved the same way, which
  points at how this desktop's partners race rather than at Kryvex's arguments.
  A guest that dials before the host's socket exists never retries. That is why
  there is no `verify:netplay-live` harness in the repository: it failed often
  enough here that shipping it as a green check would have been a lie.
- **Stop against a *live* RetroArch process**: the fake executable exits by
  itself, so only the state transition is proven there.
- **Frame rate and input latency** under netplay.

### Manual two-machine test plan

1. Install RetroArch on both machines, add the same core (e.g. `fceumm`) through
   *Online Updater → Core Downloader*.
2. Open Kryvex → Emulator on both, load the same cartridge.
3. On the host: **NETPLAY (RETROARCH)** → **Host with RetroArch**. RetroArch opens
   and waits. Read out the address the panel shows.
4. On the other machine: type that address → **Join with RetroArch**.
5. Inside RetroArch, the host should see the guest's nickname in the netplay
   overlay. Confirm both are on the same core.
6. Play. Then quit Kryvex and confirm RetroArch closes with it.
7. Repeat across the internet with TCP 55435 forwarded to the host, and note
   whether the router needed a UPnP rule.

## Seats: who is player 2, 3 and 4

Link play used to have exactly two seats — the host was seat 0 and the one guest
was seat 1. A four-player game therefore meant three people taking turns at one
controller. Seats are now a first-class idea, and the full model is in
[COUCH_COOP.md](COUCH_COOP.md):

- A seat is 1–4 and is claimed by pressing a button on your own controller, or by
  choosing a keyset (one keyboard can be four players without interference).
- The seat number travels on every pad frame, so a receiving machine knows whose
  buttons arrived. A frame from an older build has no seat and keeps the old
  host/guest mapping.
- A seat this machine has not bound is never written from another machine's
  frames, so an empty local seat cannot overwrite a guest's.
- The emulator page presents four synthetic pads to the core, `null` for a free
  seat. No core knows the difference between a seat and a physical pad.
- A host hands a seat to a named member (**This PC** or a player in the seat row),
  who adopts it, so their frames arrive on that seat.
- Room control reaches the emulator too: a granted peer's keys (press **and**
  release) land on their own seat, which is how a viewer watching a shared game
  plays as player 2 without touching player 1's setup. See
  [COUCH_COOP.md](COUCH_COOP.md).

## A disc on the link

The room link caps content at 16 MB, which is a cartridge many times over and a
disc not at all. A PlayStation or Dreamcast image is therefore refused by link
play, and the panel says so on the disc: **NETPLAY (RETROARCH)** is the path for
those, and its own core list covers `psx` (`mednafen_psx_hw`, `mednafen_psx`,
`pcsx_rearmed`) and Dreamcast (`flycast`) as well as every cartridge console.

## Not in this batch

- Room-based netplay. The room carries chat, sharing and link play; carrying
  RetroArch's TCP session through it would mean a proxy and a new security surface.
- Automatic core installation. That is RetroArch's updater, and curating its core
  licences is exactly what this document declines to do.
- Naomi netplay, or any console the cartridge engine cannot run: RetroArch's
  Flycast core can do Dreamcast and Naomi netplay, but the BIOS and image are still
  the user's to provide.
