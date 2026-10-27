# Virtual LAN: what the panel does, and what it deliberately does not

**Status:** the display-and-share half is implemented (Rooms strip and panel).
Kryvex creates no network, installs no driver, changes no route and asks for no
elevation. The engine a member uses is the one they installed themselves.

The reasoning, the engine comparison and the remaining decisions live in
[VIRTUAL_LAN_EVAL.md](VIRTUAL_LAN_EVAL.md). This note is the contract.

## What it is

A room is chat, presence and screen sharing, and it stays that. Virtual LAN is
an optional strip between the room header and the stage:

```
[globe] Virtual LAN · Off                     [Expand]
```

Expanded, it shows:

- the tunnel addresses this machine already has, with the engine family and the
  adapter each belongs to;
- `MY VIRTUAL IP` with a copy button, and one button to publish it to the room
  or withdraw it;
- `DEVICES ON THIS NETWORK`: every member who published an address, with their
  name, the engine family and a copy button;
- one plain sentence: put a member's virtual IP in a compatible game or
  service's direct-connect field, the host must have that game or service
  running, and Kryvex only shows the address.

## What it deliberately does not do

| Not done | Why |
| --- | --- |
| Create, install or configure a tunnel | That is a driver, routes and administrator rights. The app installs per-user with no UAC prompt today, and that stays true. `docs/SECURITY_MODEL.md` records the boundary. |
| Admit, kick or revoke anyone | Rooms has no authenticated membership: a display name is chosen locally, and a room id is a capability. There is nothing to authenticate a member against, so the panel does not pretend to control access. See the eval's §5 for the three options. |
| Dial an address a member published | A peer is untrusted text. The address is validated (`isDisplayableAddress`), shown, and copied by a human. Kryvex never connects to it on its own. |
| Claim LAN discovery | Only a Layer-2 engine carries the broadcasts some games need. The panel says direct IP connections, not "find games on your network". |
| Work in the browser build | `isElectron` gates it, and the panel says the desktop app is required rather than showing a switch that cannot do anything. |

## Where the address comes from

`electron/vlan.ts` reads `os.networkInterfaces()` and keeps the private or
carrier-grade IPv4 addresses on adapters whose names belong to an overlay
network: ZeroTier, EasyTier, Tailscale, Hamachi, WireGuard (`wintun`), OpenVPN
(`tap-windows`), `tun*`, `tap*`, `wg*`. Virtual machine and container adapters
(Hyper-V `vEthernet`, VirtualBox, VMware, Docker, WSL) are excluded on purpose:
they are private addresses on a real machine, but nobody plays a game across
them. Classification, address validation and ordering are pure and live in
`electron/vlan-rules.ts`; the renderer has its own copy of the family list and
the payload check in `src/lib/vlan-rules.ts`, because the renderer is built
without the Electron tree.

One read-only IPC member carries it: `kryvex:vlan:status`, validated with
`isShellSender` like every other handler. There is no handler that starts an
engine, writes a route or asks for elevation, and the harness asserts that the
bridge exposes nothing else whose name contains `vlan`.

## Sharing an address

The address travels over the room's existing peer connection as one more
trystero action (`vlan`, `{ ip, engine }`), so nothing new is dialled and no
service is introduced. A member who joins later receives it again, and a member
who leaves loses their row. Withdrawing sends an empty address, which removes
the row for everyone. Leaving the room clears the whole map: the addresses
belonged to the people who were in it.

## Verification

`pnpm verify:vlan` drives the built app in a disposable profile and checks the
things that would be dishonest to claim: every address the panel shows is
compared against `os.networkInterfaces()` on the machine running it (so an
invented or stale address fails), loopback and link-local are refused, the
bridge exposes only `vlanStatus`, publishing lists this device once with the
address the machine really has, and withdrawing removes it. Last run: **18/18
PASS**, with the two real ZeroTier adapters (`10.147.19.81`, `10.124.101.81`)
named correctly.

`tests/vlan-rules.test.ts` covers the rules: adapter families, the virtual
machine exclusions, address ranges, ordering, the payload sanitiser, and that a
public-looking address is shown while a loopback one is refused.

**Not verified, and not claimed:** two machines reaching each other over a
virtual IP. That needs two devices on different networks and belongs to the
next milestone in the eval, not to this one.
