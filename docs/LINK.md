# Kyvex Link

Kyvex Link is the phone half of Kryvex. The desktop serves one small page on the
local network; a phone opens it, types a six-digit code once, and from then on
has the desktop's clipboard, both directions of file transfer, a place to send a
link straight into the Kryvex browser, and a remote for the media player.

There is no account, no cloud service and no companion app to install from a
store. Nothing leaves the two devices, and the link is off until it is started.

Open it from **Services → Secret services → Kyvex Link** (`#/link`, element
x534). Its switch is the only thing that opens a socket.

## Pairing

1. Turn the link on. Kryvex starts listening and shows a **six-digit code**.
2. Open the first address in the list on the phone, in any browser. The address
   is this computer on your own network, e.g. `http://192.168.1.42:43110/`.
3. Type the code. The phone is paired, and the code is retired immediately — the
   next phone needs the next code.
4. Optional: *Add to home screen* gives the page an icon (the x534 tile) and a
   full-screen window. The page is self-contained, so it works with no signal —
   it only ever talks to this computer.

A code lasts five minutes and a new one is one click away. Guessing is limited
to five attempts per source address per minute, which is what makes six digits
enough: a full sweep would take days rather than minutes.

## What a paired phone can do

| Feature | Direction | Notes |
| --- | --- | --- |
| Clipboard | both ways | Text only, up to 100,000 characters. The desktop samples its clipboard while a phone is paired; the phone gets an event the moment it changes. |
| Files | phone → desktop | Multiple files at once, up to 256 MB each. They land in `Downloads\Kryvex Link`, with a collision numbered (`photo (2).jpg`) rather than overwritten. |
| Files | desktop → phone | *Offer a file* in Kryvex, then download it from the phone's Files tab. The download is served by Kryvex over the same authenticated link. |
| Send a link | phone → desktop | A URL opens as a tab in the Kryvex browser. Plain text goes to the desktop clipboard instead. |
| Remote | phone → desktop | Play/pause, next/previous, volume, mute, *bring Kryvex forward*, *open Rooms*, *go Home*. |
| Notices | desktop → phone | Transfers, pairings and anything Kryvex reports appear on the phone. With an https origin they are OS notifications; on a plain local address they appear while the page is open, because browsers only allow notifications on secure origins. |

## Security

The page is reachable by anything on the same Wi-Fi, so the design assumes that.

- **Off by default.** The switch is a user decision, persisted with the rest of
  the settings; a profile that has never opened the page runs no listener.
- **Private addresses only.** A request whose source address is not loopback,
  RFC 1918, carrier-grade NAT, link-local or an IPv6 equivalent is answered 403
  before the body is read, so a port-forwarded link is not a way in.
- **A token is minted only against a live code**, with a constant-time compare,
  and it is a capability for one phone. The shell never holds one: the desktop
  view revokes by a digest (a device handle), so a compromised renderer cannot
  impersonate a paired phone.
- **Nothing the phone sends is trusted.** File names are rewritten into a single
  safe path segment (no separators, no control characters, no reserved Windows
  names), a link must be `http`/`https` with no credentials, and a remote command
  must be in a fixed allowlist. There is no route that takes a path, a URL to
  fetch, or a shell command from the phone.
- **The page is the only thing served.** Static requests resolve inside the built
  bundle, are limited to a small extension list, and cannot reach above it; a
  request for anything else is refused.
- **Unpairing is immediate**: revoking a device drops its event stream and its
  token stops working on the next request. Doing it on the phone unpairs that
  phone only.

Revoking a phone never touches Kryvex's data, sessions or files: the link is a
door, not an account.

## Limits, stated plainly

- **Same network only.** The phone must share a network with the desktop. There
  is no relay, no tunnel and no port forwarding, by design.
- **Text clipboard only.** Images and rich content do not cross; a copied image
  is not sent, and nothing is written to the desktop clipboard except text.
- **No phone → desktop notifications.** A browser page cannot read Android's
  notification stream; that needs a native app with a notification listener.
  Notices flow the other way (desktop → phone) and show while the page is open.
- **OS notifications need https.** On a plain `http://192.168.x.x` address a
  browser refuses notification permission, so the page shows notices in-page.
  The feature works; the OS-level presentation needs a secure origin.
- **Five devices** can stay paired at once; **200 files** are listed at a time
  (the files themselves stay in the folder).
- **The address is typed once per phone.** There is no QR code yet: nobody has
  scanned one in this codebase, and a hand-written encoder would be untested
  code. The address is copyable with one click, and browsers remember it.

## Files on disk

| Path | What it is |
| --- | --- |
| `Downloads\Kryvex Link\` | Everything the phone sent. |
| `<userData>\link-index.json` | Paired devices (label, address, digest) and the transfer log. Tokens are stored here as opaque 48-character secrets; delete along with the pairing if the profile is shared. |

## How it is built

| File | Role |
| --- | --- |
| `electron/link-rules.ts` | Every pure decision: ports, code shape, token shape, address policy, file-name rewriting, URL and command allowlists. |
| `electron/link-server.ts` | HTTP transport: routes, size caps, pairing rate limit, the SSE event stream, static serving of the companion bundle. |
| `electron/link.ts` | The service: pairing list, clipboard sampling, the transfer folder, remote commands, notifications. |
| `src/views/Link.tsx` | The desktop page: switch, code, addresses, devices, transfers. |
| `src/companion/` | The phone page: pairing, clipboard, files, send, remote, and its own four-language string table. |
| `companion.html` | The second entry in the Vite build. `pnpm build` produces `dist/companion.html` plus its chunk, which is what the link server serves. |

The main process registers `kryvex:link:*` handlers; the preload exposes one
typed operation per action, and `onLinkNotice` / `onLinkCommand` are the only
events that reach the shell.

## Verification

`pnpm verify:link` builds the app, runs it on a disposable profile with the link
switched on, and drives the real server: pairing, a wrong code, a
too-large/odd file name, the clipboard round trip over the event stream, an
allowed and a refused command, a link landing in the browser, the rate limit and
unpairing. Results are recorded in [TESTING.md](TESTING.md).
