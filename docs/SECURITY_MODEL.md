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
- Browser privacy defaults are app policy, not Firefox prefs: deny device and
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
| Tracking parameters removed from top-level GET navigations; same-site navigations skipped | `electron/brave-rules.ts`, `electron/web-privacy.ts` |
| Public default-port HTTP navigations upgraded to HTTPS, with exactly one HTTP retry for that URL after a failure; loopback and private hosts exempt | `electron/brave-rules.ts`, `electron/web-privacy.ts` |
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

The engine panel in **Settings → Browser** can switch page features off —
JavaScript, images, WebGL, the PDF viewer, autoplay, spellcheck, hardware
acceleration and smooth scrolling — and can raise the default zoom. This is a
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

## LibreWolf-inspired hardening

LibreWolf is a Firefox derivative, not Chromium, so its `user.js` and patches
are not portable to Electron. Kryvex implements only equivalent behaviours
with documented Electron/Chromium APIs: no-pings, DNS-prefetch disable,
domain-reliability disable, WebRTC public-interface policy, an explicit
mic/camera prompt with other permissions denied, device/Bluetooth denial, GPC,
referrer trimming, and disposable browser storage. Firefox-specific dFPI and
DoH prefs have no documented Electron equivalent here and are not claimed.

## Brave-inspired privacy protections

Brave is a Chromium fork; its native rewriters and farbling patches are not
portable to Electron. Kryvex implements a deliberately smaller, auditable
subset in JavaScript and `webRequest`:

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
switches in Settings. Brave source code is not copied; see
`docs/ATTRIBUTION.md`.

## Dependency advisories

Dependabot alerts are disabled on the repository, so the lockfile is checked by
a CI gate instead: `pnpm audit:deps` (`scripts/audit-deps.cjs`), run by both the
CI and release workflows, executes `pnpm audit` over every scope — Electron is a
dev dependency but ships as the shell — and fails the build on any high or
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
way. Six months is the intended cadence — long enough not to nag, short enough
that an unpatched advisory is revisited while it still matters.

The gate is narrow by design. It only sees advisories that are already
published, so a compromised or hijacked package version is still a supply-chain
risk it cannot detect.

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
- Safe Browsing. Electron does not expose Chromium's Safe Browsing protocol or
  Brave's proxy, so Kryvex makes no malicious-site reputation claim.
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
