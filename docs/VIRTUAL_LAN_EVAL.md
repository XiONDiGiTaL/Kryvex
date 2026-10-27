# Virtual LAN: survey, feasibility and proposed architecture

**Status: step A of §8 is implemented** — the Rooms strip that reads the tunnel
addresses the user's own engine has already created, publishes one to the room
by hand and lists what the members published. See [VIRTUAL_LAN.md](VIRTUAL_LAN.md)
for that contract and `pnpm verify:vlan` for its harness. **No engine is
bundled, no adapter is created, no route is changed and no elevation is asked
for**; steps B and C below are still proposals, and §11 records the decisions
taken so far.

---

## 1. What was inspected

| File | What it establishes |
| --- | --- |
| `electron/main.ts` | One `BrowserWindow` renders the whole shell. `registerIpc` (~line 780+) holds every handler; each validates the shell sender (`isShellSender`) before returning or mutating. `partyInit()` and the hardening/permission modules are installed here. Nothing in the main process ever asks for elevation. |
| `electron/preload.ts` | The only renderer↔main bridge: a fixed, typed list (`contextBridge.exposeInMainWorld('kryvex', api)`). Relevant members today are `partySources`, `partySelectSource`, and the existing `vpn*` family (`vpnStatus`, `vpnConfigure`, `vpnChooseBinary`, `vpnChooseConfig`, `vpnConnect`, `vpnDisconnect`). There is no generic invoke, no shell, no filesystem. |
| `electron/party.ts` | Rooms capture broker. Shell-only IPC, a single armed pick with a 15 s TTL, shell-frame check, app-frame vs desktop capture, denial of everything else. |
| `src/lib/party.ts` | The Rooms session: `@trystero-p2p/torrent` (`joinRoom`), one application-wide session, actions for hello/chat/presence/control/input/netplay. Chat, presence and share run peer-to-peer over WebRTC data channels. |
| `src/lib/party-rules.ts` | Room id (26 Crockford chars), invite parsing, three public WebTorrent trackers, one public STUN server, name/message limits. |
| `src/views/Rooms.tsx` | The Rooms UI; every native affordance is gated on `isElectron` (join, screen share, control). The web build shows the module without them. |
| `electron/vpn.ts`, `electron/vpn-rules.ts` | **The existing native-tunnel precedent.** Kryvex ships no VPN binary and downloads none: the user picks an OpenVPN executable and a `.ovpn` profile, the manager builds an argv (dangerous flags such as `--up`, `--plugin`, `--script-security` are refused), spawns it with `shell: false`, parses the real log for connected/auth-failed/adapter errors, and kills the tunnel on quit. |
| `electron/link.ts` (`localAddresses()`) | Enumerates `os.networkInterfaces()`, keeps private IPv4 with the adapter name. This is what the phone page lists, and it is exactly what a Virtual LAN panel needs to name the tunnel adapter. |
| `electron/hardening.ts`, `electron/permissions.ts` | `sandbox: true`, `contextIsolation: true`, every permission denied except an explicit per-origin mic/camera grant. |
| `package.json` (build block) | NSIS `perMachine: false` (per-user install), `allowToChangeInstallationDirectory: true`, `extraResources: runtime/bin` (the pinned llama.cpp runtime), `asarUnpack: node-datachannel`. |
| `build/installer.nsh` | Six lines, all HKCU cleanup from the default-browser registration. No `RequestExecutionLevel`, no elevation anywhere in the installer. |
| `docs/SECURITY_MODEL.md`, `docs/PARTY.md` | The stated threat model and the Rooms design record. |
| `docs/ATTRIBUTION.md`, `docs/LEGAL.md`, `scripts/fetch-runtime.mjs` | How third-party binaries are handled today: pinned tag and SHA-256, extracted selectively, licenses shipped beside the binaries. |

Electron is **44.9.3**; React 19; the app is MIT-licensed.

## 2. What Rooms actually is, and why that decides this feature

- **A room id is a capability.** Whoever has the 26-character id can join. The
  invite is the entire access model.
- **Identity is a display name and a colour**, self-asserted, chosen locally. No
  account, no device key, no signature, no server-side membership record.
- **Signaling is third-party.** Three public WebTorrent trackers exchange
  SDP/ICE; there is no Kryvex-owned service in the path.
- **Everything is ephemeral.** Chat and presence live in memory; leaving ends
  them. Only recent room ids are remembered.
- **"Host" is not an authority.** The word appears only in the screen-share
  control protocol, where the sharer grants a remote peer input, and the role is
  a self-declared string in the payload (`role: 'host' | 'guest'` in
  `src/lib/party.ts`) that no peer can verify.
- **There is no kick and no ban in the code at all.** `docs/PARTY.md` says
  kick/ban is "local to their client"; grep finds no implementation, so removing
  someone from a room is currently not a supported operation.

Consequence: Rooms can carry payloads between people who already trust each
other, but it cannot attest to *who* any peer is, and it has no mechanism that
could refuse access to a specific device. Any virtual LAN design that promises
per-device admission and revocation therefore needs an authorization layer that
does not exist yet — either inside the app (host-as-authority, §5) or beside it
(a small control plane, §5).

## 3. Requirement-by-requirement feasibility against the current code

| Requirement | Verdict | What it needs |
| --- | --- | --- |
| Optional panel inside Rooms, collapsed/expanded, matching the theme | **Feasible now** | One component plus `Rooms.tsx` wiring and strings. No new privilege. |
| Members see and copy each other's virtual IP | **Feasible now** | A new trystero action (the session already carries several) publishing an address as data; 26 languages of strings; a copy button on the existing `ui.tsx` primitives. |
| Real virtual-IP connectivity between two devices | **Feasible only with an engine** | Either drive the user's own engine (the `vpn.ts` pattern, zero bundling, zero elevation) or bundle one and manage it (§4, §6). |
| Per-member admission separate from chat membership | **Not supportable today** | Needs a room authority (§5). |
| Revocation that actually cuts a kicked device off | **Not supportable today** | Same; plus a revocation path in the engine (shared secrets cannot do it). |
| Real direct-vs-relayed status and latency | Engine-dependent | EasyTier's CLI/RPC reports peers and `lat_ms`; ZeroTier reports per-peer paths. Neither is wired to anything today. |
| Route/subnet conflict detection, no interference with existing VPNs | **Needs new code with care** | This machine already runs two ZeroTier adapters (`10.147.19.81`, `10.124.101.81`), so the conflict case is not hypothetical here. |
| Web/PWA honesty | **Feasible now** | `isElectron` is already the gate for every Rooms native feature; a Virtual LAN panel refuses the same way. |
| No Node/shell exposure to services, no weakened web security | **Feasible, by construction** | Any new IPC goes through `preload.ts` with `isShellSender` validation, exactly like `kryvex:party:*` and `kryvex:vpn:*`. |
| No UI running as administrator | **Structurally hard** | Requires a separate privileged helper/service; see §6. |

## 4. Engine candidates (licences and capabilities)

Verified by research on the vendors' own pages; URLs included so the claims can
be re-checked.

| Engine | Licence | Per-device revocation | Privilege | L2 broadcast for LAN discovery |
| --- | --- | --- | --- | --- |
| **EasyTier** | LGPL-3.0 ([LICENSE](https://github.com/EasyTier/EasyTier/blob/main/LICENSE)); Windows builds also pull WinDivert (LGPLv3/GPLv2) and ship the signed Wintun DLL under its own custom prebuilt-binary licence | Shared `network-name` + `network-secret` by default; Secure Mode can issue individual revocable credentials, but the managed-credential work is highlighted in the **2.7.0 pre-release**, so per-device revocation must be proven on the pinned stable (2.6.4) before it is promised | Wintun adapter + routes ⇒ **administrator**; the project also recommends an admin install, and its UDP broadcast relay needs admin | No L2 claim; a Windows-only, off-by-default UDP broadcast relay is documented for LAN game discovery |
| **ZeroTier One** | Agent MPL-2.0; the controller under `/nonfree` is source-available and **non-commercial** | Yes: per-node identity, controller authorizes/deauthorizes each member | Admin **service** does the networking, a separate non-admin UI talks to it — the model this feature would need | **Yes**, Ethernet semantics, multicast as groups: the only strong fit for games that insist on LAN discovery |
| **NetBird** | Client BSD-3-Clause, but current `management`/`signal`/`relay` and dashboard are **AGPL-3.0** since v0.53.0 | Yes, server-managed peers | Elevated service; self-host is a public VM + Docker stack | No (Layer 3) |
| **Nebula** | MIT | Per-host certificates; revocation is a blocklist every host must receive | TUN, service install elevated | No (Layer 3) |
| **n2n** | GPL-3.0 | Per-user allow-list on a supernode | TAP adapter, elevated | Yes (TAP, `-E` multicast) |
| **Tailscale + Headscale** | Daemon/CLI BSD-3-Clause (the official GUI wrappers are not open source); Headscale BSD-3-Clause | Yes, per node key | Elevated service; macOS uses a system extension | No |
| **WireGuard / wg-quick** | Kernel and tools GPLv2, Windows client MIT | Keys are per peer; **no controller** — revocation means editing every peer config | Windows tunnel runs in its own service | No |

Two facts decide the shortlist for **this** codebase:

1. **Kryvex is MIT and ships third-party binaries only under pinned, permissive
   licenses** (`runtime/bin` carries llama.cpp's MIT text and the OpenMP licence,
   `docs/ATTRIBUTION.md`). Adding an LGPL-3.0 engine plus a signed kernel-adjacent
   adapter DLL to an unsigned installer is a legal *and* a trust decision, not a
   build step. The engine's own docs are explicit that a shared network secret
   is not a per-member authorization system.
2. **The precedent that already exists is "the user brings the engine."**
   `electron/vpn.ts` proves the app can validate an argv, run a tunnel without a
   shell, read real status from its output and tear it down on quit, with no
   bundling and no elevation asked of Kryvex itself.

## 5. The authorization gap, and the smallest honest options

Three ways to satisfy "only people the room lets in, and a kick really cuts them
off". Ordered by how much they add to the product:

**Option A — bring your own engine, mirror the address (no new authorization).**
The panel reads the tunnel adapter from the existing `localAddresses()`
enumeration, the user copies their virtual IP into the room, and peers see it
with a copy button. Nothing privileged, nothing bundled, and it is honest: the
network is the user's own ZeroTier/EasyTier/WireGuard mesh, admitted by *that*
product's control plane, and Kryvex is a display and a clipboard. Revocation
happens where the network actually lives. This is the only option that needs no
decision from anyone but the user, and it is deliverable now.

**Option B — host-as-authority, no server.** At room creation, generate a host
key pair; the invite carries the room id **and** the host public key
(`kryvex://room/<id>#<hostKey>`), so a joiner can verify the host's signature.
A member publishes its device public key in the room; the host answers with a
membership grant **encrypted to that device's key** (WebCrypto ECDH → AES-GCM)
containing the engine credentials and a short expiry, signed by the host key.
Revocation is then "stop renewing": with a short TTL (minutes, not hours) a
removed device falls off without rotating anything for everyone else.
This is the design that fits `PARTY.md`'s "no Kryvex-owned server" principle, and
it is the one I would want — but it is a new cryptographic protocol in a repo
whose own rules say no custom crypto, so it needs an explicit review before it is
written, and the host must be *proved* (today anyone can claim the role), which
means changing the invite format.

**Option C — a small control plane.** A Kryvex-owned service (Cloudflare Worker +
D1, or the Supabase project already connected) holding room membership, issuing
per-device credentials and revoking them. This is the only option where
revocation is immediate, provable and testable, and the only one that scales past
"the host is still online". It contradicts a stated Rooms principle, so it is a
product decision, not an engineering one.

## 6. Privilege, packaging and cleanup

Any real tunnel changes the privilege posture of the whole product:

- Today the installer is **per-user with no elevation** and touches HKCU only.
  Creating an adapter and installing routes cannot be done from there.
- The required shape is a **separate privileged helper** (a Windows service, or a
  helper the installer elevates once and the app starts as needed). The Electron
  UI stays unelevated and talks to it over a narrow, authenticated channel;
  renderer-supplied argv is never forwarded, mirroring `vpn-rules.ts`
  `BLOCKED_FLAGS` rather than inventing a new policy.
- **Crash recovery is the classic failure**: a killed app that leaves a TUN
  adapter and routes behind bricks the user's networking until they reboot. The
  helper must own teardown, reap stale sessions, and the app must prove it on
  quit (the `vpn.ts` precedent kills its child on `before-quit`).
- **Firewall**: the adapter needs its own rules; the firewall is never disabled.
- **Signing**: both shipped EXEs are unsigned today. A driver-adjacent component
  raises the SmartScreen cost of that decision considerably.
- **One network at a time** per device is the sane first release; multiple
  simultaneous room networks multiply the route-conflict surface.

## 7. Proposed architecture (if Option B or C is chosen)

New files, following existing conventions:

| File | Role |
| --- | --- |
| `src/lib/vlan-rules.ts` | Everything testable with no network: grant formats, expiry maths, address validation, conflict checks, status reduction. Pure, like `party-rules.ts` and `vpn-rules.ts`. |
| `src/lib/vlan.ts` | Renderer-side session: talks to main over IPC, publishes/receives the address or grant payload over the existing trystero room, exposes a subscribe function the view reads. |
| `src/components/VirtualLanPanel.tsx` | The collapsed strip and the expanded flyout, on the existing `ui.tsx` primitives. |
| `src/views/Rooms.tsx` | One insertion point: the strip below the room header. |
| `electron/vlan-rules.ts` | Main-side validation: no renderer path ever reaches an argv. |
| `electron/vlan.ts` | Engine lifecycle: spawn without a shell, parse status, own teardown on quit. |
| `electron/vlan-helper.ts` (Option B/C) | The privileged side: adapter and route management, reached over a narrow channel, never from a webview. |
| `electron/preload.ts` | New `vlanStatus/vlanJoin/vlanLeave/vlanDiagnostics` entries, each sender-validated in `main.ts`. |
| `src/lib/i18n-*.ts` | Strings across the 26 catalogues, with `scripts/audit-i18n.cjs` kept green. |
| `docs/VIRTUAL_LAN.md`, `SECURITY_MODEL.md`, `TESTING.md`, `BACKLOG.md` | Publish the model, the privilege boundary and the harnesses. |

## 8. Proof-of-concept plan (smallest first, in this order)

1. **A — panel + address, no privilege (can start today).** Virtual LAN strip in
   Rooms, adapter read via the `localAddresses()` pattern, address published as a
   room action, peer rows with copy, honest "no engine detected" state, web build
   shows "Desktop app required". Provable end to end on one machine and, for the
   copy path, between two.
2. **B — real connectivity on two devices, before any polish.** Pin the engine,
   agree the licence position, run it on two machines on different networks, and
   only then decide what the UI is allowed to claim.
3. **C — authorization and revocation.** Only after B: the grant model (B) or the
   small control plane (C), with kick proved by a device that genuinely cannot
   reconnect with cached credentials.

## 9. Test plan and what can actually be verified here

Automatable in this repository: rules unit tests (grant/expiry/address
validation, argv building, conflict detection), a `pnpm verify:vlan` harness over
the built app (panel states, address read, copy, offline/engine-missing state
wording, no duplicate network on leave, teardown on quit), and the web build's
unsupported state.

Requires **two real machines on different networks** and cannot be run by an
agent in this workspace: both devices join and receive real addresses (1–2), a
service is reachable by virtual IP (3), direct connect in a game (4), direct vs
relay paths (5), room-to-room separation (6), revocation by a device that still
holds cached credentials (7), crash/restart leaving no routes (9), VPN/route
conflict behaviour (10), firewall-denied diagnosis (13).

Cannot be run at all in this environment: any of the above, plus anything
needing administrator rights to install an adapter, and anything needing a live
relay. None of it should be reported as tested.

## 10. What is explicitly not verified

- Whether EasyTier **2.6.4** (stable) contains the Secure Mode credential
  issuance/revocation the docs describe, or whether that is 2.7.0-only.
- Whether EasyTier carries the broadcast/multicast traffic a given game needs for
  LAN discovery; no engine's claim here has been tested against a game.
- The exact licence inventory of the EasyTier Windows release archive and the
  Wintun prebuilt DLL's redistribution terms in a bundled product.
- Whether the host-as-authority grant design (§5, Option B) is acceptable under
  this repo's no-custom-crypto rule. It has not been reviewed, let alone written.
- Anything on two devices, on any engine, at any point.

## 11. Decisions taken, and what is still open

Answered on 2026-10-26, which is what step A implements:

1. **Where to start:** the panel and real addresses, using an engine the user
   already has — not a bundled engine and not the authorization model first.
2. **Engine:** the user's own engine, nothing bundled. Nothing in Kryvex's IPC,
   installer or licence position changes.
3. **Privileges:** no elevation. The app stays per-user with no UAC prompt, and
   the user's engine keeps ownership of the adapter, its routes and its
   admission.

Still open, and each one is a product decision rather than a coding one:

4. **An in-house engine.** The intent behind this is sound, and it is worth
   splitting into two halves, because only one of them is a build:
   - The control plane — membership, who is admitted, who is revoked, the
     relay/rendezvous, and the Rooms experience around it — is ours to build,
     and it is the part that actually distinguishes Kryvex. It sits on top of
     a tunneling data plane.
   - The data plane itself (a WireGuard-class protocol plus a kernel-adjacent
     adapter on three platforms) is a long, security-critical project with a
     signing and driver-distribution problem attached. Reverse-engineering a
     proprietary client (Hamachi is the usual example) is not a shortcut: its
     protocol and assets are not licensed for that, an EULA does not grant it,
     and a static-analysis tool such as REA cannot make it lawful — REA is
     useful for auditing our own binaries and understanding formats we are
     entitled to read, not for cloning someone's tunnel.
   - The defensible "in-house" build is therefore: our own membership and
     revocation layer, our own relay when we want one, our own UI, over a
     **permissively licensed** data plane we are allowed to ship (Nebula, the
     MIT WireGuard Windows client, or a future permissive engine). §4 lists
     what each candidate's licence allows.
5. **Revocation model:** A (delegate to the user's engine, which is what ships
   today), B (host as authority — a new protocol, no server, needs review under
   this repo's no-custom-crypto rule) or C (a small Kryvex control plane, the
   only one with immediate and provable revocation).
6. **LAN discovery:** is it a launch requirement? Only a Layer-2 engine carries
   those broadcasts, which rules engines in or out by itself.
7. **Platform scope:** Windows-first, or one engine proven on all three.
8. **Two-device proof:** step B of §8 still has to run on two real machines on
   different networks before any of this can be described as working.
