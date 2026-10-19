# Engineering Decision Log

## ED-001 — Upstream checkout is reference-only
**Decision:** `X:\Veyra\upstream\ferdium-app` (shallow clone, `develop`) is
read-only evidence. Kryvex source will live directly under `X:\Veyra`
(separate `package.json`, ids, branding), never inside the upstream dir.
**Reason:** Directive forbids using either upstream checkout as destination.
**Status:** Enforced. Verified 2026-10-19.

## ED-002 — Naming: Veyra → Gatherium → Kryvex (risk open)
**Veyra (rejected, 2026-10-19).** USPTO TSDR shows VEYRA standard-char mark,
reg. 8482976 (Oct 6 2026, ser. 99644569, Class 42 SaaS/software) to The
Celestial Group; Veyra Studio desktop code editor (GitHub fcopensource,
veyraeditor.com, MS Store); Veyra Live comms app (Google Play); Veyra dating
and VPN apps; second VEYRA application ser. 50009270 (Veyra IP LLC). Never
launch publicly under Veyra.

**Gatherium (superseded).** Nine candidates screened: Veyra (USPTO reg +
Studio/Live), Switchyard (Mac productivity app + pending software TM),
Waystation (macOS app + MCP service), Portage (Windows Store app + Gentoo),
Crossbuck (railroad app), Roadstead (media platform), Moorline (Mac app),
Converra (desktop workbench + Convera near-match), Workstead (employee app).
Gatherium looked clean (one tiny unrelated GitHub repo, no store/desktop/USPTO
hits) and an identity was built, then superseded the same day by the owner's
choice of Kryvex (candidate 6). Gatherium remains the fallback candidate.

**Kryvex (current — high risk).** Owner selected Kryvex and supplied a
periodic-table identity direction. Conflict screen, 2026-10-19:
  - Kryvex LLC — a KRYVEX AI platform, “The Terminal That Thinks”, listed in
    Intel's partner showcase → exact name, active software.
  - deepsingh245/Kryvex — zero-knowledge password vault (web/mobile).
  - 38 GitHub repositories match “Kryvex”; Kryvex Technologies, Kryvex Studio
    (software services), Kryvex Media, kryvex.pro (crypto trading).
  - Google Play developer account “Kryvex” (Mexicanario); a possible App Store
    “Kryvex” listing returned 404 and is unverified.
  - USPTO ser. 99897056 KRYVEX (Nexvora LLC) for hand-operated salt mills —
    different goods, so not clearance for software.
  No Microsoft Store, Mac App Store or Steam product was found.
  **Verdict: high brand risk for a public software product.**

**Decision:** Build the Kryvex identity at the owner's explicit request, but
keep it fully tokenized (`brand/tokens.json`, `brand/themes.json`, logo
variants) so a rename does not require redesign; no domain purchase, store
listing, paid brand spend, or public launch under Kryvex without counsel
clearance. Working directory stays `X:\Veyra` — never rename or move it;
future repo `kryvex`. Design choices: symbol `Kx` (avoids the real krypton
symbol `Kr`), fictional element number `027`, tagline “Precision in Every
Connection.”
**Status:** brand system delivered 2026-10-19; clearance open.

## ED-003 — Midori integration: fallback D
**Findings:** `midori-browser/core` is Vala + GTK3 + WebKitGTK, CMake,
LGPL-2.1, unmaintained since Oct 2019 (v9.0 Jul 2019). No Electron/Windows
embed path; historical MinGW docs only. Current Midori desktop is a separate
Firefox-derived repo.
**Decision:** Evaluate in order A→D per directive; A–C fail on maintenance/
platform/integration grounds. Kryvex browser = Electron webview capabilities
(Chromium), with a documented seam for a future engine. Record measurements
before claiming anything "lightweight". Do not present Midori as integrated.
**Status:** Decided; recorded in `docs/MIDORI_INTEGRATION.md`. No Midori code ships.

## ED-004 — Keep Ferdium stack for the fork baseline
**Decision:** Retain Electron + TypeScript/React/MobX + pnpm + electron-builder
for M2/M3. No Rust/Go/Tauri rewrite. Architectural changes only from
profiling or concrete incompatibility.
**Reason:** Directive + buzzword rewrites carry unmeasured cost. Baseline
first, then justify deltas.
**Status:** Superseded by ED-008 for v0.1.0 — the Electron + TypeScript +
React stack was kept, but no fork is shipped.

## ED-005 — Security hardening is mandatory fork work
**Findings (verified):** Upstream main window sets `nodeIntegration: true`,
`contextIsolation: false` (`src/index.ts:282-284`); recipe guide says recipe
code can access Electron/Node APIs.
**Decision:** Kryvex must enable context isolation, disable Node integration in
remote-content surfaces, scope preload bridges, validate IPC senders, and keep
service content in isolated partitions/sessions. Document inherited issues in
`docs/SECURITY_MODEL.md`.
**Status:** Implemented in v0.1.0; see `docs/SECURITY_MODEL.md`.

## ED-006 — pnpm required for baseline honesty
**Findings:** Upstream engines pin Node 24.20.0 + pnpm 12.3.4; env has Node
24.19.0 + npm 12.0.2, no pnpm. Lockfile is `pnpm-lock.yaml`.
**Decision:** Install pnpm via documented free route (corepack or official
installer) inside M2 and record versions; never convert to npm silently.
If installation is blocked, record the exact error as the M2 blocker.
**Status:** Completed — pnpm 12.3.4 installed to a local tool dir (corepack blocked by EPERM); baseline recorded.

## ED-007 — Sohbet integration without assumptions
**Findings:** `https://sohbet.xiondigital.net` returns 200 (Next.js/Vercel).
Frame-ancestors policy, auth/session behavior, notification support unknown.
**Decision:** Dedicated service entry + isolated session/partition; verify
X-Frame-Options/CSP at integration time; never disable web security globally;
no Node in remote content; narrow IPC only. Document site-imposed limits.
**Status:** Implemented — Sohbet loads in its own `persist:svc-*` module session (live probe, `loading: false`).

## ED-008 — Ship a fresh shell instead of a Ferdium fork
**Decision:** v0.1.0 is an independent Electron 44 + React 19 + TypeScript app
(`electron/`, `src/`), not a rebranded Ferdium checkout. No upstream code is
copied; the upstream clone remains reference-only.
**Reason:** The upstream tree carries a large inherited surface, privileged
recipe bridge and `nodeIntegration: true` defaults (ED-005). A small shell with
four IPC calls, hardened webviews and token-driven UI delivers the requested
module/browser/theming behaviour with a reviewable security boundary, and keeps
licensing unambiguous (MIT, no Apache-2.0 attribution burden for a derivative).
**Consequence:** Ferdium's recipe catalogue, hibernation, downloads UI and
service presets are **not** inherited. Modules are URL-based. If catalogue
parity becomes a requirement, evaluate a recipes integration separately rather
than importing the whole app.
**Status:** Implemented and verified 2026-10-19 (typecheck, 38 tests, build,
route capture, live Sohbet module).
