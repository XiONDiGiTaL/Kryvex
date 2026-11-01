# Rooms: in-app hangouts

**Status:** implemented and shipped in 0.7.0.
Rooms is a first-party view (`#/rooms`, sidebar, `Ctrl 6`).
Phase 1 (room, presence, chat, invites) and the screen/app share half of
phase 2 are implemented and verified end to end against two real app
instances. File drop, voice and co-watch are not built yet; this note keeps
the reasoning, the limits and the next steps honest.

## 1. What Rooms is

Create a room, copy one invite, and everyone who opens it lands in the same
place. Inside a room:

- presence, who is here, chosen display name, colour, connection state;
- text chat: ephemeral, per room, no account, Enter to send;
- screen share: a desktop, a window, or a **specific Kryvex app** (Discord, a
  browser tab, Vexium), with optional system audio on Windows;
- recent rooms on the lobby so a group can come back;
- later: file drop, voice, host-authoritative co-watch.

No account, no lobby, no Kryvex-owned server in the media path. The invite link
is the whole access model.

## 2. Room scope

| Feature | Kryvex Rooms | Notes |
| --- | --- | --- |
| Rooms + link invites | yes | `kryvex://room/<id>` and a copyable code |
| Screen share | yes (P2P, up to ~6 viewers) | no 1080p guarantee; upload bound |
| Chat / names / presence | yes | data channels, ephemeral |
| Share a single app, not the desktop | yes | Kryvex service webviews are capture sources |
| File drop | not yet | chunked over data channels, phase 2 |
| Voice | not yet | same peer connections, phase 4 |
| Co-watch YouTube / direct video | not yet | host clock, drift correction, phase 3 |
| Netflix / DRM streaming sync | **no** | DRM forbids it; a virtual browser is not portable |
| Public room lobby | **no** by default | link-only rooms avoid the moderation surface |
| Games, emulators | not planned | separate, much larger effort |

## 3. The constraints that decide the architecture

1. **WebRTC needs signaling.** Peers must exchange SDP/ICE before anything
   flows. That is the only part that traditionally needs a server.
2. **Public WebTorrent trackers can carry signaling only.** A room id becomes
   the swarm key; offers/answers are exchanged there and chat, files and video
   go direct. This is what `trystero` (MIT) does with pluggable strategies.
   Caveats: public trackers are best-effort third parties, the tracker sees
   room metadata, and rooms fail if every configured tracker is unreachable.
3. **STUN is free; TURN is not optional at scale.** `stun:stun.l.google.com`
   covers most home networks. Roughly 20–25 % of consumer sessions need a
   relay; without TURN those peers simply fail, and with TURN someone pays
   bandwidth. The TURN field exists in Settings and is unused until a relay is
   configured.
4. **Screen capture is local and permission-gated.** Electron's
   `desktopCapturer` + `session.setDisplayMediaRequestHandler` produce a real
   `MediaStream`; a specific Kryvex app is captured through its `WebFrameMain`,
   so the sharer can hand over one service instead of a whole desktop.
5. **Mesh upload is the ceiling.** Each viewer of a screen share costs the
   sharer one upload. Practical limit: 4–6 viewers at 720p/30 on a normal
   connection; a relay/SFU is a later, bigger project.

## 4. Room model

- Room id: 128-bit random, Crockford base32, 26 chars. It is the capability.
- Invite: `kryvex://room/<id>` plus a `room · <id>` code for pasting in chat.
- Identity: display name (sanitised, 1–24 chars) + a colour from the palette.
  Stored locally; no account, no email, no device id.
- Ephemeral by default: chat and presence live in memory; leaving ends them.
  The lobby remembers recent room ids, nothing else.
- The host is whoever created the room. Kick/ban is local to their client;
  real access control needs a password or a relay.

## 5. Architecture

```
renderer (trusted shell)                main process
───────────────────────                 ─────────────────────────────
src/views/Rooms.tsx     UI              electron/party.ts
src/lib/party.ts        session         · capture source list + consent
src/lib/party-rules.ts  pure helpers    · display-media handler (shell only)
        │                               · app-frame vs desktop capture
        │  WebRTC (direct)              · pending-pick permission gate
        ▼                               electron/permissions.ts
   peers on the internet   ◀── signaling ──▶ public WebTorrent trackers
```

- `party-rules.ts` holds everything testable without a network: id generation
  and validation, invite parsing, name/message limits, presence reduction.
- Signaling lives in `src/lib/party.ts` on top of `trystero/torrent` with the
  public WebTorrent trackers. It is not wired to XiØN's Cloudflare, Vercel or
  Supabase accounts, so a user can point the tracker list anywhere later.
- Chat messages are length-capped, type-checked and rendered as text.

### Why capture needed a permission change

Kryvex denies every permission the user did not explicitly grant, and the shell
is not a webview. Chromium asks for `media` (not `display-capture`) when the
shell calls `getDisplayMedia`, so the first build denied its own request and
the capture handler never ran. The fix is narrow and testable:

- the shell may receive `media` **only while the capture broker holds an armed,
  unexpired source pick** (`partyHasPendingPick()`), which is cleared the moment
  the display handler consumes it;
- a request with no armed pick is still denied, and a webview can never arm one
  (`kryvex:party:sources` and `kryvex:party:select` are shell-only IPC);
- the display handler still refuses a foreign frame, a stale pick, a missing
  video request, and a source that disappeared between listing and capture.

## 6. Phases

**Phase 1: room, presence, chat, invites.** Done.
**Phase 2: screen share + app share.** Done.
**Phase 5: files.** Done. A member offers a file, the receiver picks a
folder, and the bytes stream over the room's own data channels (section 11).
**Phase 3: co-watch and host controls.** Not started.
**Phase 4: voice, relay hardening.** Not started. TURN is configured but
needs a user-supplied relay; a self-hosted signaling relay is a later option.

## 7. Security and abuse

- The invite is a bearer capability. Anyone with it can join; rooms are never
  discoverable.
- Capture requires an explicit picker each time; there is no "always allow" for
  screens, and the stream is created in the shell renderer so a compromised
  webview cannot reach it.
- No room traffic touches Kryvex servers. The only third parties are the
  signaling trackers and STUN, both named in the lobby and in Settings.
- Peer payloads are untrusted: messages are capped and rendered as text.

## 8. Verification

- Unit: `tests/party-rules.test.ts` covers ids, invite parsing, name and message
  limits and presence reduction (206 tests overall).
- End to end: `pnpm verify:rooms` launches **two real app instances** with
  separate profiles, creates a room, joins it through the invite hash, asserts
  both presence lists reach two, sends a chat line from A and reads it in B,
  then shares the screen through the real picker and waits for B to decode
  remote frames. Last run: room `akdmedtsegg3kxm9rkzsz85grv`, remote video
  2560×1440, pass.
- Not executed: two machines on different networks, forced-TURN sessions, a
  room with more than two peers. Do not treat those as proven.

## 9. Still open

1. Resuming an interrupted transfer: a peer that drops ends the transfer, and
   the sender has to offer the file again.
2. A self-hosted signaling relay, so rooms do not depend on public trackers.
3. Co-watch with a host clock and drift correction.
4. Room password, which derives the signaling key rather than encrypting media.

## 10. Virtual LAN

A room can also carry a member's virtual LAN address. The strip sits between
the room header and the stage, reads the tunnel addresses the member's **own**
ZeroTier, EasyTier, Tailscale, WireGuard, Hamachi or OpenVPN install has already
put on their machine, publishes one to the room on request, and lists what the
others published so they can be copied into a game or a service.

Kryvex creates no tunnel, changes no route, admits nobody and asks for no
elevation; a room still has no authenticated membership to hang access control
on, so the panel does not pretend to grant or revoke access. The address travels
as one more peer action (`vlan`), is validated on arrival, and is never dialled
by Kryvex. Full contract: [VIRTUAL_LAN.md](VIRTUAL_LAN.md), evaluation and open
decisions: [VIRTUAL_LAN_EVAL.md](VIRTUAL_LAN_EVAL.md).

## Share audio, and why it doubled

A share can carry the system mix (a screen or window source) or one app's audio
(a Kryvex app source). Chromium mutes the media of a `<webview>` that is being
captured, so an app share needs the captured track played back to the sharer —
that is what "Play it here" is for, and it defaults on for an app share.

A screen or window share captures the same mix the sharer is already hearing
from the app producing it. Monitoring that plays every sound twice, a few
hundred milliseconds apart, which is the doubling that was reported. The default
now follows the source (`monitorShareByDefault` in `src/lib/party-rules.ts`),
and the checkbox stays available for anyone who wants it.

## 11. Files

A room can carry files between its members with no upload and no size cap. The
bytes travel as chunks over the WebRTC data channels the room already has, so
no Kryvex service is in the path and nothing is stored anywhere but the two
disks.

- **Offer, then accept.** The sender picks files, and every member sees an offer
  with the name and size. Nothing is read from disk until someone accepts.
- **The receiver chooses the destination.** Accepting opens a native save dialog
  in the main process; the path never comes from the wire.
- **Credit window.** The receiver returns one credit per chunk it has written,
  and the sender keeps at most `TRANSFER_WINDOW` (8) chunks in flight. A fast
  sender is throttled to a slow disk instead of filling memory, and a full round
  trip is not spent per chunk.
- **Nothing half-written is visible.** Chunks go to `<name>.kryvexpart` and the
  file is renamed only after every declared byte has arrived and been synced.
  A cancelled or failed transfer removes the partial file.
- **Untrusted names.** A peer picks the name, so it is stripped to a basename,
  scrubbed of characters Windows cannot store, refused as a device name, and
  capped at 180 characters with the extension kept.
- **The sender cannot exceed the agreed size.** The sink refuses any chunk that
  would take the file past the size the receiver accepted.

- **A drop pauses, it does not end.** A transfer that has already moved bytes
  keeps its partial file, its open handle and the sender's `File`. When the peer
  returns — with a new id and a new channel, because that is how a room peer
  comes back — the sender re-asks (`resume`) and the receiver answers with the
  byte count it has on disk (`resume-accept`), so the stream continues from that
  offset and nothing is transferred twice. A transfer that never started still
  ends when its peer leaves: there is nothing to continue.
- **A pause has a deadline.** A pause holds a partial file open and one of the
  twelve transfer slots, so it waits `TRANSFER_PAUSE_MS` (5 minutes) and then
  gives up: the partial file is removed, the slot is freed and the row says the
  other side never came back. A transfer that resumes is taken off that clock.

Wire: two actions. `xfer` is a JSON control frame (`offer`, `accept`, `decline`,
`credit`, `end`, `done`, `cancel`, `fail`, `resume`, `resume-accept`);
`xfer-chunk` is binary, 256 KiB per frame, with `{id, seq}` metadata. A resume
only continues the same file: a different size or name is refused, and the
receiver only answers with a chunk boundary it actually wrote. A chunk that arrives out of order, or a final
byte count that disagrees with the offer, fails the transfer instead of saving a
corrupt file.

Code: `src/lib/transfer-rules.ts` (names, chunk plan, labels),
`src/lib/transfer.ts` (the engine and the protocol), `electron/transfers.ts`
(the sink: save dialog, append, sync, rename), `src/components/RoomFilesPanel.tsx`
(the panel). Kryvex Links's phone relay is a separate mechanism and is not
involved.

Where the audio goes silent instead: system audio is captured through the OS's
own loopback path, so a device held in exclusive mode by another application —
ASIO/ASIO4ALL drivers do this — yields a silent track. Kryvex installs no
driver, no virtual device and no Stereo Mix requirement; it captures, encodes
with Opus and sends over the room's peer connection. When a platform refuses
system audio, the panel says "Shared without system audio." rather than
pretending.
