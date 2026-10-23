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
**Phase 2: screen share + app share.** Done. File drop still open.
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

1. File drop with an accept/decline prompt, size caps and saved copies in
   `<download root>/Kryvex Rooms/<room>/`.
2. A self-hosted signaling relay, so rooms do not depend on public trackers.
3. Co-watch with a host clock and drift correction.
4. Room password, which derives the signaling key rather than encrypting media.
