# Security Model

## Threat model

1. A compromised renderer must not reach Node, the filesystem or arbitrary
   shell commands.
2. Remote service content must run without the preload bridge, Node, or access
   to another service's session.
3. Privileged IPC must stay narrow and validate the sender and payload on every
   call; unknown messages are rejected.
4. Downloads, torrents, extensions and browser registration are main-process
   operations. The renderer receives display records and tracked IDs, never
   arbitrary paths or unvalidated command targets.
5. Microphone and camera access is granted per web origin only after a visible
   prompt in the trusted shell; no page can self-grant a device.
6. Top-level navigation must not leak known click identifiers or silently stay
   on HTTP, and remote pages must not receive an unchanging, globally shared
   canvas/WebGL/audio fingerprint.

## Design requirements (all implemented in v0.5.0; see the table below)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` where
  compatible; narrow `contextBridge` preloads per surface (app shell,
  service guest, popup).
- Browser privacy defaults are app policy, not inherited settings: deny device and
  capture permissions, send Global Privacy Control, trim cross-origin
  referrers, disable hyperlink pings, DNS prefetch and domain reliability,
  restrict WebRTC to the public interface, and keep browser-tab storage in
  memory instead of on disk.
- Validate `event.sender` origin/partition on every IPC handler; allowlist
  external-navigation targets; an explicit mic/camera prompt with every other
  permission denied; isolated session partitions per service group; separate
  persistent vs private browser sessions.
- No plaintext passwords; OS credential store or engine facilities only; no
  custom crypto; no global TLS bypass; download destination validation;
  path-traversal + command-injection review on all user-influenced paths.
- Secrets (tokens, cookies, passwords) excluded from backup/diagnostics by
  default; redaction of credentials/cookies/auth headers/sensitive URLs in
  log export; no secrets in git, logs, or artifacts (pre-push scan).

## Implemented in v0.5.0 (source-verified)

| Control | Where |
| --- | --- |
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the shell window | `electron/main.ts` `createWindow` |
| Preload removed from every webview; Node, web security and insecure content forced safe | `will-attach-webview` |
| Partition allowlist `persist:(svc|browser)-[a-z0-9-]` and http(s) `src` check | `will-attach-webview` |
| Popups denied in-app, validated then opened externally | `setWindowOpenHandler` (app + window) |
| Non-http(s) navigation blocked inside webviews; shell cannot navigate away | `will-navigate` |
| Permissions denied except `clipboard-sanitized-write`, `fullscreen` and an explicit per-origin mic/camera grant; USB/HID/Serial and Bluetooth pairing denied | `electron/hardening.ts`, `electron/permissions.ts` |
| Media prompt validates HTTP(S) origin and devices, stores grants in memory, and requires both devices when Chromium omits a media type | `electron/permissions.ts` |
| GPC signal, cross-origin referrer trimming and removal of Chromium's `X-Client-Data` header | `electron/hardening.ts`, `electron/privacy.ts` |
| Chromium switches: no hyperlink pings, no DNS prefetch, no domain-reliability telemetry, WebRTC public-interface policy | `electron/hardening.ts` |
| Tracking parameters removed from top-level GET navigations; same-site navigations skipped | `electron/url-privacy-rules.ts`, `electron/web-privacy.ts` |
| Public default-port HTTP navigations upgraded to HTTPS, with exactly one HTTP retry for that URL after a failure; loopback and private hosts exempt | `electron/url-privacy-rules.ts`, `electron/web-privacy.ts` |
| Canvas, WebGL and audio-analysis readbacks receive stable per-site noise in remote pages only; seed is per app launch and site | `electron/farbling-preload.ts`, `electron/web-privacy.ts` |
| EasyList Cookie is compiled into the local shield engine so many consent banners are hidden without a click | `electron/shield.ts` |
| Service partitions persist; browser tabs use in-memory `browser-*` partitions and are cleared on tab close | `electron/privacy.ts`, `electron/main.ts`, `src/views/Browser.tsx` |
| Every IPC read and mutation validates the shell sender before returning or changing state | `electron/main.ts` `registerIpc` |
| Narrow typed IPC; URL validated before `shell.openExternal`; download and browser mutations require the shell sender | `electron/preload.ts`, `registerIpc` |
| Downloads saved by main under a user-selected, validated root; delete-file limited to tracked paths inside retained managed roots; the renderer never supplies a path | `electron/downloads.ts`, `electron/storage.ts`, `electron/storage-rules.ts` |
| Torrents accept only validated magnets or `.torrent` files; new folders live under `<download root>/Kryvex Torrents`; queue and action IDs are main-owned; deletion is path-checked against retained roots; restored queue rows are validated, forced paused, and never create a client until Resume | `electron/torrents.ts`, `electron/torrent-rules.ts` |
| Default-browser registration is opt-in, Windows-only, writes only per-user capability keys and is followed by the OS Default Apps choice | `electron/default-browser.ts`, `electron/windows-browser.ts` |
| State: structural validation in the renderer, 1 MB cap, atomic rename, sanitisation on load | `src/lib/store.ts`, `storage.ts`, `main.ts` |
| State is data only; services cannot execute code in the shell | module registry |

## Chromium engine preferences

The engine panel in **Settings → Browser** can switch page features off (
JavaScript, images, WebGL, the PDF viewer, autoplay, spellcheck, hardware
acceleration and smooth scrolling) and can raise the default zoom. This is a
capability-reduction surface, not an extension surface:

- `applyChromiumPreferences` runs *after* `preload` removal, `nodeIntegration =
  false`, `contextIsolation = true`, `sandbox = true`, `webSecurity = true` and
  the insecure-content ban in `will-attach-webview`, and the profile object it
  merges contains only content preferences. No setting can re-add a preload,
  Node, or a new partition.
- Launch switches are limited to `--disable-smooth-scrolling` and
  `app.disableHardwareAcceleration()`; arbitrary user-supplied command-line
  flags are deliberately not exposed.
- The profile is sanitised in the main process on every write
  (`sanitizeChromium`): unknown fields are dropped, booleans must be booleans,
  zoom snaps to the browser's own steps, and the colour scheme is an enum.
- A change never clears a session. **Rebuild open pages** remounts `<webview>`
  elements on the same partition, so cookies, storage and sign-in survive.

## Browser hardening within Electron

Kryvex implements privacy behaviours with documented Electron/Chromium APIs:
no-pings, DNS-prefetch disable, domain-reliability disable, WebRTC
public-interface policy, an explicit mic/camera prompt with other permissions
denied, device/Bluetooth denial, GPC, referrer trimming, and disposable browser
storage. Controls that have no documented Electron equivalent are not exposed
or claimed.

## Privacy protections

Kryvex implements a deliberately small, auditable subset in JavaScript and
`webRequest`:

- **HTTPS upgrades** happen before the request and cover top-level GET
  navigations. A failed upgrade gets one HTTP retry for the exact destination;
  loopback, `.local`, `.internal` and RFC 1918 hosts are never upgraded.
- **Tracking-parameter stripping** removes a curated list of campaign and
  click identifiers from top-level GETs. Same-site navigations are skipped to
  preserve functional parameters.
- **Farbling** perturbs low-order canvas/WebGL colour bits and tiny amounts of
  audio-analysis data. It is stable for a site and app launch, applied only to
  remote webviews, and is not presented as a native-engine guarantee.
- **Consent banners** are hidden by EasyList Cookie. Kryvex never clicks a
  consent choice on the user's behalf.

These protections are independent of ad/tracker blocking and have their own
switches in Settings.

## Scripts sent into service guests

Kryvex runs a small, fixed set of scripts inside its own service webviews. They
are not arbitrary IPC: the main process composes each string, and a shell caller
cannot supply code or a selector.

| Script | What it may do |
| --- | --- |
| Media sample | Read `navigator.mediaSession.metadata` and the first `video`/`audio` element, then return text, an HTTPS image URL, playing state and position |
| Media control | Click a known transport selector for the page's host family, falling back to `play()`/`pause()` on the media element. Next and previous never fall back |
| Dock guard | Set `volume` on media elements and restart the current clip when it ends, only while the user has chosen a volume or repeat in the dock |

The receiver validates the guest's session against the service partition list,
so a browser tab or popup cannot be controlled. Samples are sanitised on the way
back (text capped and flattened, artwork restricted to https, numbers clamped).
The dock guard is installed only after the user changes a setting, is limited to
`volume`, `currentTime`, `play()` and, when that fails, `location.reload()` of the
same page, and is re-installed after a navigation. Force-closing a module closes
its guests but never reads or deletes cookies.

## Bundled model runtime

Vexium can start a GGUF file with a llama.cpp `llama-server` that ships inside
the installer. That binary is a supply-chain surface, so it is pinned and
verified rather than fetched when the app runs:

- `scripts/fetch-runtime.mjs` fixes the release tag (`b11835`), asset name,
  exact byte size and SHA-256. A mismatch aborts before extraction.
- Only `llama-server`, its implementation DLLs, the CPU backends, `mtmd`,
  `libomp` and the license files are extracted. Entries with a path separator,
  a drive prefix or a duplicate name are refused, and files are created with
  exclusive writes.
- The runtime is fetched at package time, copied to `resources/bin` by Electron
  Builder, and never downloaded by the installed app. Source checkouts use
  `runtime/bin`, which is gitignored.
- A user-selected executable, then a binary in `<userData>/bin`, takes
  precedence over the bundled one. A chosen or PATH runtime remains outside this
  pin and is the user's responsibility.
- The process is spawned with `--host 127.0.0.1` and a free loopback port, with
  no shell, no renderer-supplied arguments and piped output. llama.cpp warns
  that no API key is set and CORS allows all origins; binding loopback is what
  keeps that local, and the server is never exposed on a LAN interface.
- No model weights are bundled or redistributed. The reviewed catalogue
  download remains a separate, hash-verified action.
- The llama.cpp MIT text and the OpenMP license ship beside the binaries. See
  [ATTRIBUTION.md](ATTRIBUTION.md).

The CPU build has no GPU backend, so `--n-gpu-layers` is accepted but ignored
(`no usable GPU found`). That is a capability limit, not a security boundary.

## Dependency advisories

Dependabot alerts are disabled on the repository, so the lockfile is checked by
a CI gate instead: `pnpm audit:deps` (`scripts/audit-deps.cjs`), run by both the
CI and release workflows, executes `pnpm audit` over every scope (Electron is a
dev dependency but ships as the shell) and fails the build on any high or
critical advisory. Advisories that cannot be fixed and cannot be reached are
listed inside the script with the reason they are carried and the date that
reason must be re-checked by; the run prints each exception with its date and
warns when one stops matching.
It fails closed: when the audit cannot run, the build goes red instead of
quietly passing.

An exception is valid through its `reviewBy` date and lapses the day after: the
gate then fails before the audit even runs, so a carve-out cannot outlive the
reasoning behind it and the decision comes up again on a schedule rather than
when someone remembers. A missing, malformed or impossible date fails the same
way. Six months is the intended cadence: long enough not to nag, short enough
that an unpatched advisory is revisited while it still matters.

The last 14 days are reported before the date arrives: the run prints an
`EXPIRING` line with the days left, and under Actions also emits a workflow
warning annotation so it appears on the run summary rather than only in the log.
The annotation names `scripts/audit-deps.cjs` and the line of the exception's
id, so opening it lands on the date that needs moving rather than on the
workflow that happened to call the gate.
It does not fail the build (the deadline is the failure) so nobody meets the
expiry for the first time on a red run they did not cause.

The one exception carried today is `ip`
(GHSA-2p57-rm9w-gvfp), reached as
`webtorrent > torrent-discovery > bittorrent-tracker`. It cannot be upgraded
out: `ip` 2.0.1 is both the newest release and the last affected version, and
`webtorrent` 3.0.21 is already the newest, so no bump clears it. Patching the
package in place would leave its version at 2.0.1, which the audit still
reports. Dropping `webtorrent` would clear it but removes the torrent feature
outright; that was considered and declined, because the advisory covers
`isPublic` while the only import lives in the tracker *server* parser, and
Kryvex runs tracker clients. The exception therefore stays, dated, rather than
being deleted or hidden behind a patch.

The gate is narrow by design. It only sees advisories that are already
published, so a compromised or hijacked package version is still a supply-chain
risk it cannot detect.

## Wellness data

The optional wellness widget stores height, weight, birth year, an optional
free-text note and a daily log in the same local state file as everything else.
It stays off until the intake form is completed, nothing is read from a device
sensor or a third-party service, and no request carries any of it: the only
network call on the Home board is still the Open-Meteo lookup for the city the
user chose. BMI and the calorie target are estimates computed from the values
entered, shown beside a not-medical-advice note rather than presented as
measurements or guidance.

## Kyvex Link: the one listener Kryvex opens

Everything else in this document is about Kryvex as a client. Kyvex Link is the
single feature that accepts a connection, so its rules are stated here rather
than only in its own guide ([LINK.md](LINK.md)).

- **Off unless switched on.** The link is a setting, default off; no profile
  opens a socket until the user starts it, and starting it is a click on its own
  page, not a first-run default.
- **A private-network listener.** It binds `0.0.0.0` on a port in 43110–43129 so
  a phone on the same Wi-Fi can reach it, and it refuses any request whose source
  address is not loopback, RFC 1918, CGNAT, link-local or an IPv6 equivalent
  (`isPrivateAddress`). A port-forwarded or tunneled request is answered 403
  before its body is read. This is a shared-network threat model, not a public
  one: the listener is not designed to face the internet.
- **Capability tokens, never account credentials.** A 48-hex-character token is
  minted only when a client presents the live six-digit pairing code, compared
  with `crypto.timingSafeEqual`; codes expire after five minutes, a code pairs one
  device, and guessing is limited to five attempts per source address per minute.
  Tokens are stored in `<userData>/link-index.json`, are never sent to another
  device, and are never exposed to the renderer: the shell sees a 16-character
  digest as a device handle, so a compromised renderer cannot replay one.
- **Input from the phone is data, not instructions.** A file name is reduced to
  one safe path segment, an uploaded body is capped at 256 MB, clipboard text at
  100,000 characters, a link must be `http`/`https` with no embedded credentials,
  and a remote command must be in a fixed allowlist. There is no route that
  accepts a path to read, a URL to fetch server-side, or a shell command.
- **Only the built companion page is served.** Static requests resolve inside the
  build output and must carry an allowed extension; a traversal attempt gets no
  file. Every `/api/*` route except `hello` and `pair` requires a valid token.
- **Unpairing is a dead door.** Revoking a device closes its event stream and its
  token fails on the next request. Unpairing touches nothing else: no Kryvex
  session, no pinned service, no file.

Not implemented, deliberately: any relay or tunnel that would work across
networks, phone → desktop notification mirroring (a web page cannot read
Android's notification stream), and notification permission on a plain-http
origin (browsers require a secure context, so notices show in-page there).

## Virtual LAN is read-only

Kryvex ships no VPN engine, creates no adapter and changes no route. The Virtual
LAN strip in a room reads the addresses an engine **the user installed** has
already put on the machine, and that is the whole of its privilege:

- One IPC member, `kryvex:vlan:status`, validated by `isShellSender` like every
  other handler. There is no handler that starts an engine, writes a route,
  installs a driver or requests elevation, and `pnpm verify:vlan` asserts the
  bridge exposes nothing else whose name contains `vlan`.
- The address is read from `os.networkInterfaces()` in the main process and
  filtered to private or carrier-grade ranges on adapters that belong to an
  overlay network. Virtual machine and container adapters are excluded. Loopback
  and link-local are never offered.
- A published address is peer-supplied text: it is validated again in the
  renderer (`isDisplayableAddress`) before it is painted, and **Kryvex never
  connects to it**. A member copies it into a game or service themselves.
- Publishing is an explicit click per room. Nothing is published by default, and
  leaving the room clears every address it held.
- The browser build shows the desktop-app notice instead of a switch that could
  not do anything.

If the project ever bundles an engine instead, that decision brings a driver, a
privileged helper and an installer that elevates with it: all three are
recorded as open in [VIRTUAL_LAN_EVAL.md](VIRTUAL_LAN_EVAL.md) §11 and would
have to be designed before they are shipped.

## Not yet implemented

- Per-module permission scopes and persisted site grants (media grants are
  per origin for the current app session only).
- Certificate error handling UI and history/download privacy controls.
- Torrent bandwidth scheduling, ratio limits and per-file selection. Queue
  rows restore, but they do so paused and are not hydrated until Resume.
- Per-site exceptions for HTTPS upgrades, tracking-parameter stripping or
  fingerprint farbling.
- A native Chromium patch for fingerprint resistance. The current preload is
  detectable by a determined page.
- Update integrity. The main process checks a fixed GitHub endpoint, accepts
  only HTTPS GitHub assets whose names match the release tag, and requires the
  release's `SHA256SUMS.txt` entry to match before an installer can run. The
  renderer cannot choose a URL or path. Builds are unsigned, so this detects
  transport corruption and mismatched files, not a compromised repository.
- Safe Browsing. Electron does not expose Chromium's Safe Browsing protocol,
  so Kryvex makes no malicious-site reputation claim.
- A UI for per-site exceptions to referrer trimming or GPC.
- Packaged-app ASAR integrity checks, CSP for the renderer.
- macOS/Linux sandbox validation.

## Verification plan

`docs/TESTING.md`: startup, permission prompts, IPC-boundary tests,
private-session isolation, download handling, error recovery, shutdown.
Record what was executed; never report unrun tests as passing.

Executed so far: `pnpm typecheck` (0), `pnpm test` (137/137), `pnpm build` (0),
`pnpm capture` (0, twenty-four captures), restart-persistence, download-history and
download-location UI, torrent-restore and find/zoom harnesses, download-manager
integration test (completed file, collision-safe path, delete-file), Web Store
extension install and removal harness, default-browser URL filtering/status
check, the live
Sohbet module probe (`https://sohbet.xiondigital.net/`, `loading: false`), a
loopback torrent harness (torrent file + magnet, real peer transfer, live
seeder count, paused restore with no client, on-demand hydration and folder
deletion), the live torrent IPC/UI harness, the
media-permission harness (real webview `getUserMedia`, allow and block), and
the privacy harness (query stripping, HTTPS fallback, cookie list and
stable canvas farbling with an off-switch).

REA 6.7.0 static application analysis of `dist-electron` parsed 10 main-process
files and 8,495 AST nodes, reconstructing 1 BrowserWindow, 1 preload entry,
27 exposed bridge members, 24 IPC handlers and 24 paired renderer
transmissions with 0 unpaired literal transmissions. REA reports 0
`sender_validation_observations` because it does not follow this code's
`isShellSender()` helper; manual review confirms every IPC handler validates
the shell sender (or returns only non-privileged capability data). REA parses
inert syntax and does not prove runtime enforcement, so the header/partition
behaviour above was also exercised in a live Electron harness.
