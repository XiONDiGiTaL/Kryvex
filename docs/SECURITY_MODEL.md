# Security Model

## Inherited findings (Ferdium reference, not shipped)

These were the security problems that motivated a fresh shell (ED-008); none of
this code is part of Kryvex v0.1.0.

1. Main window: `nodeIntegration: true`, `contextIsolation: false`
   (`src/index.ts:282-284`). Any XSS in the shell renderer = full Node.
2. Recipe code can access Electron/Node APIs (per recipe integration guide +
   `src/webview/recipe.ts` bridge shape). Third-party service JS runs with
   more privilege than it needs.
3. Broad IPC surface (`src/electron/ipc-api/`: settings, downloads,
   localServer, sessionStorage, processManager, ...) — sender validation
   must be confirmed per handler during M7.
4. Update config disables signature verification
   (`verifyUpdateCodeSignature: false`) — supply-chain risk if reused blindly.

## Design requirements (all implemented in v0.1.0; see the table below)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` where
  compatible; narrow `contextBridge` preloads per surface (app shell,
  service guest, popup).
- Validate `event.sender` origin/partition on every IPC handler; allowlist
  external-navigation targets; permission prompts (mic/camera/location/
  notifications); isolated session partitions per service group; separate
  persistent vs private browser sessions.
- No plaintext passwords; OS credential store or engine facilities only; no
  custom crypto; no global TLS bypass; download destination validation;
  path-traversal + command-injection review on all user-influenced paths.
- Secrets (tokens, cookies, passwords) excluded from backup/diagnostics by
  default; redaction of credentials/cookies/auth headers/sensitive URLs in
  log export; no secrets in git, logs, or artifacts (pre-push scan).

## Implemented in v0.1.0 (source-verified)

| Control | Where |
| --- | --- |
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for the shell window | `electron/main.ts` `createWindow` |
| Preload removed from every webview; Node, web security and insecure content forced safe | `will-attach-webview` |
| Partition allowlist `persist:(svc|browser)-[a-z0-9-]` and http(s) `src` check | `will-attach-webview` |
| Popups denied in-app, validated then opened externally | `setWindowOpenHandler` (app + window) |
| Non-http(s) navigation blocked inside webviews; shell cannot navigate away | `will-navigate` |
| Permissions denied except `clipboard-sanitized-write` and `fullscreen` | session handlers |
| Four narrow IPC calls; URL validated before `shell.openExternal` | `electron/preload.ts`, `registerIpc` |
| State: structural validation in the renderer, 1 MB cap, atomic rename, sanitisation on load | `src/lib/store.ts`, `storage.ts`, `main.ts` |
| State is data only; services cannot execute code in the shell | module registry |

## Not yet implemented

- Permission prompt UI (requests are currently denied silently except clipboard
  and fullscreen).
- Per-module permission scopes, certificate error handling UI, download
  destination policy, history/download privacy controls.
- `pnpm audit` run, packaged-app ASAR integrity checks, CSP for the renderer.
- macOS/Linux sandbox validation.

## Verification plan

`docs/TESTING.md`: startup, permission prompts, IPC-boundary tests,
private-session isolation, download handling, error recovery, shutdown.
Record what was executed; never report unrun tests as passing.

Executed so far: `pnpm typecheck` (0), `pnpm test` (38/38), `pnpm build` (0),
`pnpm capture` (0, nine routes), live Sohbet module probe
(`https://sohbet.xiondigital.net/`, `loading: false`).
