# Engineering Decision Log

## ED-001: Application shell
**Decision:** Kryvex is an Electron application under `X:\Veyra`.
**Reason:** A compact shell with a narrow IPC boundary is easier to audit.
**Status:** Implemented since v0.1.0.

## ED-002: Naming, Veyra → Gatherium → Kryvex (risk open)
**Veyra (rejected, 2026-10-19).** USPTO TSDR shows VEYRA standard-char mark,
reg. 8482976 (Oct 6 2026, ser. 99644569, Class 42 SaaS/software) to The
Celestial Group; Veyra Studio desktop code editor (GitHub fcopensource,
veyraeditor.com, MS Store); Veyra Live comms app (Google Play); Veyra dating
and VPN apps; second VEYRA application ser. 50009270 (Veyra IP LLC). Never
launch publicly under Veyra.

**Gatherium (superseded).** Nine candidates were screened: Veyra, Switchyard,
Waystation, Portage, Crossbuck, Roadstead, Moorline, Converra and Workstead.
Gatherium looked clean and an identity was built, then it was superseded the
same day by the owner's choice of Kryvex. Gatherium remains the fallback.

**Kryvex (current: high risk).** Owner selected Kryvex with a periodic-table
identity direction. Conflict screen, 2026-10-19:
  - Kryvex LLC: a KRYVEX AI platform, “The Terminal That Thinks”, listed in
    Intel's partner showcase → exact name, active software.
  - deepsingh245/Kryvex: zero-knowledge password vault (web/mobile).
  - 38 GitHub repositories match “Kryvex”; Kryvex Technologies, Kryvex Studio
    (software services), Kryvex Media, kryvex.pro (crypto trading).
  - Google Play developer account “Kryvex” (Mexicanario); a possible App Store
    “Kryvex” listing returned 404 and is unverified.
  - USPTO ser. 99897056 KRYVEX (Nexvora LLC) for hand-operated salt mills:
    different goods, so not clearance for software.
  No Microsoft Store, Mac App Store or Steam product was found.
  **Verdict: high brand risk for a public software product.**

**Decision:** Build the Kryvex identity at the owner's explicit request, but
keep it fully tokenized (`brand/tokens.json`, `brand/themes.json`, logo
variants) so a rename does not require redesign; no domain purchase, store
listing, paid brand spend, or public launch under Kryvex without counsel
clearance. Working directory stays `X:\Veyra`, never rename or move it;
future repo `kryvex`. Design choices: symbol `Kx` (avoids the real krypton
symbol `Kr`), fictional element designation `x529` (initially `027`, changed
for developer branding), tagline “Precision in Every Connection.”
**Status:** brand system delivered 2026-10-19; clearance open.

## ED-003: Browser engine (Electron Chromium)
**Decision:** Use Electron's Chromium webview for Kryvex modules and the
browser, with a documented seam for a future engine. Record measurements
before claiming anything "lightweight".
**Reason:** A second embedded browser engine would add a native runtime, a
build matrix and an embedding path with no documented Electron support.
Electron already provides the engine, sandbox and update path.
**Status:** Decided; Chromium/Electron is the engine.

## ED-004: Keep Electron + React + TypeScript
**Decision:** Retain Electron + TypeScript/React + pnpm + electron-builder.
No Rust/Go/Tauri rewrite. Architectural changes only from profiling or a
concrete platform incompatibility.
**Reason:** Rewrites carry unmeasured cost. The current stack already supports
isolated sessions, hardened webviews, native downloads and Windows packaging.
**Status:** Enforced through v0.5.0.

## ED-005: Security hardening is mandatory
**Decision:** Kryvex must enable context isolation, disable Node integration in
remote-content surfaces, scope preload bridges, validate IPC senders, and keep
service content in isolated partitions/sessions.
**Status:** Implemented; see `docs/SECURITY_MODEL.md`.

## ED-006: pnpm is the package manager
**Decision:** Keep pnpm and the committed `pnpm-lock.yaml`; never convert to npm
silently. Record the exact toolchain when a bootstrap step is blocked.
**Status:** pnpm 12.3.4 installed in a local tool directory (corepack blocked by
EPERM); baseline recorded.

## ED-007: Sohbet integration without assumptions
**Findings:** `https://sohbet.xiondigital.net` returns 200 (Next.js/Vercel).
Frame-ancestors policy, auth/session behavior and notification support are
site-controlled.
**Decision:** Dedicated service entry + isolated session/partition; never
disable web security globally; no Node in remote content; narrow IPC only.
**Status:** Implemented, Sohbet loads in its own `persist:svc-*` module session.

## ED-008: Browser downloads and history are first-class
**Decision:** Downloads are observed in the trusted main process for every
session, saved to a user-selected download root (Downloads by default) with
collision-safe names, and exposed to the renderer as display records plus
explicit pause/cancel/remove operations. The location is chosen through a
main-process folder picker, persisted in `kryvex-storage.json`, and shared by
regular downloads and the torrent root. Previously used roots are retained so
old rows stay manageable. History is persisted with the rest of the workspace
state, capped at 500 entries and sanitised on load. The renderer never receives
an arbitrary filesystem path or the ability to choose a deletion target.
**Reason:** A download UI must not become a filesystem bridge. The main process
owns the download item, its path and its lifecycle; the renderer only sees a
tracked record ID.
**Status:** Implemented in v0.4.0; the download-location picker ships in
v0.5.0.

## ED-009: Default browser is opt-in and Windows-owned
**Decision:** Kryvex registers `http` and `https` and writes per-user Default
Apps capabilities only when the user presses **Set as default** in the
installed Windows build, then opens Windows Default Apps for the final
confirmation. Kryvex also accepts http(s) URLs passed on the command line and
opens them in a browser tab. It never changes the system default silently.
**Reason:** Windows 10/11 intentionally protect the default-browser choice.
Pretending an app can override it would be inaccurate.
**Status:** Implemented; unsigned installer remains.

## ED-010: Browser hardening stays within Electron APIs
**Decision:** Kryvex applies privacy controls only where Chromium/Electron
provides an enforceable behaviour. These are no-pings, disabling DNS prefetch
and domain-reliability telemetry, a WebRTC public-interface policy, explicit
permission/device/Bluetooth denial, Global Privacy Control, cross-origin
referrer trimming, and in-memory browser-tab partitions cleared on close.
Controls that have no documented Electron equivalent are not exposed or
claimed.
**Reason:** Shipping dead configuration would create a false security claim.
Each retained control is implemented with a documented Electron session or
webRequest API, or a well-known Chromium switch, and is covered by tests or
runtime probes.
**Status:** Implemented 2026-10-19; see `electron/hardening.ts`,
`electron/privacy.ts` and `docs/SECURITY_MODEL.md`.

## ED-011: Privacy protections are small Electron components
**Decision:** Implement the privacy layer as small Electron components: HTTPS
upgrades with a one-time HTTP fallback, tracking-parameter stripping for
top-level GET navigations, deterministic per-site canvas/WebGL/audio-analysis
farbling in a frame preload, and EasyList Cookie in the existing local filter
engine. Do not present the JavaScript wrappers as native-engine guarantees.
**Reason:** Browser-engine patches would add a large maintenance surface; an
Electron-native subset is auditable, works with the current installer and
keeps the MIT project boundary clear. Electron's `webRequest` supports only one
listener per event, so the privacy rules are combined with Ghostery's blocker
in a single pipeline instead of competing with it.
**Status:** Implemented in v0.4.0; see `electron/url-privacy-rules.ts`,
`electron/web-privacy.ts` and `electron/farbling-preload.ts`. Known limits: no
native fingerprint guarantees, no Safe Browsing, and top-level HTTPS upgrades
only.

## ED-012: Custom GitHub updater, not electron-updater
**Decision:** Check the public GitHub `releases/latest` endpoint from the main
process, validate the tag and assets locally, download only a version-matched
Setup/Portable EXE, require a matching `SHA256SUMS.txt` entry, and launch the
interactive installer only from a packaged installed build. Portable and git
builds never self-replace. Do not add `electron-updater`, a generic feed URL, a
silent `/S` install, or a renderer-supplied download URL.
**Reason:** The app needs one narrow, auditable path from a repository it already
publishes to, not a general update framework with its own cache, provider and
signing behaviour. Keeping the feed and asset rules in one pure module makes
them unit-testable and prevents a compromised or misconfigured feed from
choosing an executable. Checksums detect corruption and mismatched assets; they
do not replace code signing, which remains absent and is called out in the UI
and docs.
**Status:** Implemented 2026-10-20; see `electron/update-rules.ts`,
`electron/updater.ts`, `docs/UPDATES.md` and `pnpm verify:updater`.

## ED-013: Never read a window after it has closed
**Decision:** Capture the references a module needs (`win.webContents` for the
shell or a window) while the window is alive, compare against those references,
and ask `isDestroyed()` through the helpers in `electron/lifecycle.ts` before any
late send or dialog. Do not read `win.webContents`, `win.getTitle()`,
`contents.getURL()` or `contents.mainFrame` inside a `closed`/`destroyed`
listener or in a callback that resumed after the window went away. Wrap reads
that cannot be avoided in `try`/`catch`.
**Reason:** Electron destroys the object before those events fire. A destroyed
`BrowserWindow` or `WebContents` still answers `isDestroyed()` but throws
`Object has been destroyed` for every other property, and an exception escaping
a listener becomes the blocking “A JavaScript error occurred in the main
process” dialog: the crash fixed in 0.8.1. Guarding with `isDestroyed()` alone
is not enough when the guard itself reads `webContents`, and `getAllWebContents`
listeners must ask about destruction before calling `getType()`.
**Status:** Implemented 2026-10-21. Modules audited: `main.ts` (IPC sender check
now compares a captured `shellContents`), `party.ts`, `permissions.ts`,
`extensions.ts`, `torrents.ts`, `storage.ts`, `updater.ts`, `downloads.ts`,
`assistant.ts`, `default-browser.ts`, `chromium.ts`, `web-privacy.ts`.
`tests/lifecycle.test.ts` runs `scripts/audit-lifecycle.cjs` (`pnpm
audit:lifecycle`) over `electron/` and fails if a close/destroy handler reads a
window again.
