# Couch co-op

Four people, one screen. Each player has their own controller or their own corner
of one keyboard, and the seat decides whose input is whose.

## What was asked for, and what Parsec actually does

The request was to reverse-engineer Parsec's local co-op and adapt it. Inspecting
the install at `C:\Program Files\Parsec` answers the technical question, and the
answer is that there is nothing here to copy — and nothing we would legally copy
anyway:

| Item in the install | What it is |
| --- | --- |
| `vusb\parsecvusba.sys`, `parsecvusba.inf`, `parsecvusba.cat` | A signed **kernel driver** that root-enumerates a virtual USB bus (`Root\Parsec\VUSBA`) |
| `vdd\mm.dll`, `mm.inf`, `mm.cat`, `devcon.exe` | A virtual display driver, installed with `devcon` |
| `pservice.exe`, `wscripts\service-install.vbs` | A Windows **service** that survives the client |
| `skel\appdata.json`, `parsecd-150-86h.dll` | The packaged client payload, hash-pinned |
| `wscripts\*.vbs` | Install/remove scripts for the service and both drivers |

So Parsec's couch co-op is not an input API: a guest's controller is tunneled to
the host and **re-enumerated as a physical USB gamepad** through the driver above.
The game sees a real second XInput pad and never learns Parsec exists. That is
also why it works for games Kryvex cannot touch.

Kryvex does not do that, for three reasons, in order of weight:

1. **Licence.** The driver and the client are proprietary and the driver is
   signed. Redistributing or re-using them is not on the table for an MIT
   project, and reverse-engineering them to reimplement the driver would still
   leave us shipping a kernel component we cannot audit.
2. **Reach.** A virtual-pad driver only helps games outside Kryvex. The emulator
   Kryvex runs has no reason to need one: it is our own page, and the pads it
   reads can be synthesised in the page itself.
3. **Cost.** Installing a kernel driver on a user's machine to play Mario Party
   is a security surface, an uninstall path and a signing story. That is out of
   proportion to the feature.

What is portable is the *model*, and that is what ships: a seat is claimed by the
player who presses a button on their own device, seats are independent, and one
keyboard can be four players.

## The model

`src/lib/couch.ts` is the whole of it, and it is pure:

- **A seat is 1–4**, numbered the way the core numbers players, so seat 1 is the
  pad index 0 the emulator has always used.
- **A pad is bound by index.** `navigator.getGamepads()` lists every attached
  controller whether or not its owner is touching it, so a seat is *claimed*
  rather than guessed: `claimFromPads` compares two snapshots of the pad list and
  returns the pad whose owner just went from no buttons to one. A pad that was
  already held cannot claim by doing nothing, and a pad bound to another seat is
  skipped so the next player gets their own.
- **A keyboard is a keyset, not a device.** One keyboard has no index to bind, so
  each seat owns a non-overlapping set of `KeyboardEvent.code` values. Two
  players can hold Left at the same time and neither sees the other's key. Four
  sets ship: `wasd` (W A S D + J K U I), `arrows` (arrows + number pad), `ijkl`
  (I J K L + N M Y U) and `numpad`. Every code appears once in its map, which the
  tests pin, because a key that meant two buttons would fire both.
- **A held direction also moves the stick.** A core that only polls the analogue
  axis can still be played from a keyboard: the d-pad bits and `axesX`/`axesY`
  are set together.
- **Seat 1 is never reassigned by another player's claim.** A later player taking
  "the free one" cannot take the pad the first player is holding, which is the
  failure mode that makes co-op unusable.
- **A controller already plugged in belongs to seat 1**, bound when a link starts
  and only when no seat holds a pad — so a single-pad player never has to claim
  anything by hand.

## How it travels

The seat number rides the frame that already exists:

- `src/lib/netplay.ts` — the pad frame (16 buttons + 2 axes) is unchanged.
- `src/lib/party.ts` — the room action carries a `seat` (1–4, clamped), so a
  receiver knows whose buttons arrived. An older build sends no seat and keeps
  the old host/guest mapping.
- `src/views/Emulator.tsx` — one animation frame reads every bound seat, sends
  the ones that changed (plus a 250 ms heartbeat so a lost frame cannot leave a
  button held), and merges everything it receives into a four-entry pad list.
  **A seat this machine has not bound is never written**, so an empty local seat
  3 cannot overwrite a guest's seat 3 with neutral every frame.
- The emulator page (`emulatorHostDocument`) hands `navigator.getGamepads()` four
  synthetic pads, `null` for a free seat — exactly the shape a browser returns
  for an unused slot. The core sees four players and knows nothing about seats.

Each machine still runs its own core and receives a checkpoint from the host
every 1.5 s, so every screen shows all four players. A player whose console is
slower sees the same game, slightly behind.

## Room control, and who holds it

Seats cover players who run the emulator themselves. Room control covers the
viewer who does not: they are watching a shared screen and want to press keys.

The two are now one path on the host:

1. The viewer asks for control from the share; the host grants it.
2. The viewer's tile sends `key` events with a **phase** — `down` on press, `up`
   on release. A page only ever needed the press, which is why this did not exist
   before; a game needs the release or every key stays held.
3. `Rooms` offers each granted key to the emulator first (`src/lib/emulator-input.ts`).
   If the shared source is a guest page, the page gets it exactly as before. If
   there is no guest page — the host is sharing the emulator — the key lands on
   the seat the controlling peer owns.
4. A peer with no seat is given the first free one and a keyset nobody else is
   using, and is told about it, so both panels agree on which player they are.
   All four seats taken means the key is refused rather than stolen.
5. Revoking control clears every key that peer was holding, so nothing stays
   pressed down after the grant ends.

The emulator panel names the holder ("{name} has control of this screen and
plays as player 2") and offers **Allow** while the request is pending and **Take
control back** once it is granted. Rooms keeps its own copy of the same state, so
whoever is looking at either surface sees the same answer.

Only a keyset takes remote input. A seat bound to a physical pad is that person's
controller: the room does not carry the pad, so pretending it could would fight
the player holding it.

## P1 sets up P2 (or P3, P4)

A seat row has three controls, and the third is the hub:

- **Use a controller** arms the seat; the next person to press a button on their
  own pad takes it.
- **The keyset picker** gives the seat `W A S D + J K`, `Arrows + number pad`,
  `H J K L + Y U I`, or `Number pad only`.
- **The player picker** (while a room is open) says whether the seat is on *this
  PC* or belongs to a named member. Choosing a member sends them the seat and the
  keyset, and their own emulator adopts it — so their frames arrive on that seat
  even when they are running the game themselves. Changing the keyset afterwards
  re-sends it.

A member's claim travels back, so the host's list shows "Player 2 · XiØN · Arrows
+ number pad" beside its own seats. Claims are advisory by design: only the
machine that owns a device can read it, so each side announces its own seats and
draws the others rather than trying to allocate them remotely.

## Limits, stated plainly

- **Seat travel needs a link session.** The seats are carried by link play
  (Rooms). Two machines on the same couch with no room is just the local seats.
- **Four seats is the ceiling**, matching the pad count the cores expose.
- **A disc cannot ride the room link.** The checkpoint channel caps content at
  16 MB, so a PlayStation or Dreamcast image uses NETPLAY (RETROARCH) instead,
  and the panel says so on the disc.
- **RetroArch's own netplay does its own pad handling.** Seats are Kryvex's
  model, inside Kryvex's emulator; RetroArch keeps its own configuration, which
  is the user's to set up.
- **Control carries keys, not pointer.** A shared page needs clicks; a game does
  not, and mapping a click to a button would be a guess. Pointer events still go
  to a guest page when that is what is shared.
- **The keyset is layout-independent.** Room control forwards `KeyboardEvent.key`
  ('a', 'ArrowLeft'), the seats are written in `code` values (`KeyA`,
  `ArrowLeft`), and `codesFromKey` reconciles them. A value nobody can place
  (a function key, an IME composition) is dropped rather than guessed at.
- **No virtual-pad driver.** A game outside Kryvex still sees one pad per
  physical device. That is the boundary this document draws, and it is the reason
  the feature needs no installer, no service and no administrator prompt.

## How this was checked

`tests/couch.test.ts` (10 tests) covers the rules with synthetic pads and
keyboards: claiming the pad that just pressed, skipping a held pad, moving a
device instead of double-booking it, leaving an unclaimed seat neutral, two
keysets reading two independent frames from one held-key set, one code meaning
one button in every map, and the d-pad/stick pairing.

`pnpm verify:couch` (`scripts/verify-couch-coop.cjs`) then walked the whole chain
with two real instances in one room over the public trackers. A popped Rooms
window opened the room and shared the screen; A went to the emulator and loaded a
SNES cartridge through the real file input; B joined, asked to control, A allowed
it from the emulator panel, B clicked the stream and held an arrow key. The check
reads `navigator.getGamepads()` **inside the emulator frame** — the frame is a
sandboxed out-of-process document, so that is a devtools target of its own — and
found pad 2 with left pressed, pad 1 with left clear, and the key released when B
let go. Seat 2 took the arrow keyset on its own, and player 1 stayed on W A S D.

The same run then covers the two-device case a real couch session lives in: A
starts link play, a controller (a stub answering `navigator.getGamepads()`, which
is the only thing the seat loop reads) claims seat 2 while player 1 keeps W A S D,
and B — granted control afterwards — lands on seat 3 with the arrows. Holding
the controller's Y and B's arrow key at once found both padded through (seat 2
button 3, seat 3 button 14) with player 1 clear; releasing the remote key left the
controller held, and releasing the controller cleared its button alone.

The last step minimizes the host's window and presses the pad again, because the
seat loop is a `requestAnimationFrame` clock: a throttled renderer would stop
reading the controller with no error anywhere, and the person sharing their
screen is the one who looks away. The frame still arrived. The stub the harness
uses returns a fresh pad snapshot per call, like a browser does — one mutable
object would let the "before" snapshot move with the press and turn a claim into
a race, which is what a first draft of this check got wrong.

The cartridge is not in the repository: point `KRYVEX_COUCH_ROM` at one (the
harness stages a copy inside the workspace, because devtools file injection only
resolves paths on the app's own volume). It stays out of CI for that reason and
because a runner has no display to share.

The run found two real defects and both are fixed:

- **The viewer was never told it had control.** `party.ts` handled a `grant` only
  on the host, which had already written its own copy, so the allowed viewer kept
  reading "Ask to control" and its tile stayed unfocusable. The host believed the
  keys had moved; the viewer could not type, and nothing reported an error.
- **The first key built its frame from the old seat list.** The sink assigned
  player 2 and then posted pads read from a ref that only catches up on the next
  render, so a viewer's very first press arrived as a neutral pad. A tap was lost
  entirely; only a second press worked.
A third, smaller one: a popped-out Rooms is a second surface on the same session,
and the route copy unmounting after the window copy mounted could null
`session.onInput`, silently disconnecting the host's control. That cleanup is
identity-checked now, like the emulator's seat sink already was.

A fourth came out of the two-device run: the granted peer's line named "player 2"
unconditionally until their first key, so a viewer told the host's pad seat was
hers. The number now falls back to the first free seat, which is where that key
will land.

Not measured here: two physical machines, physical controllers, and how the
latency feels to two people in the same game. The rules and the wiring are
pinned; the feel of it is not, and that needs a session with people in the room.
