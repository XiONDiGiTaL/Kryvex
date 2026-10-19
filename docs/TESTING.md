# Testing record — Kryvex 0.1.0

All results below were produced on 2026-10-19 on Windows with Node 24.19.0,
pnpm 12.3.4 and Electron 44.2.0. Commands were run from `X:\Veyra`; no test was
skipped, weakened or excluded to make the suite pass.

## Automated

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `tsc --noEmit` for renderer and `electron/` (strict) |
| `pnpm test` | exit 0, 38/38 | Vitest: URL normalisation/search resolution, service validation and helpers, starter state, state sanitisation and registry operations, theme catalogue |
| `pnpm build` | exit 0 | Vite renderer (`dist/`) + esbuild main/preload (`dist-electron/`); 287,233 B JS, 34,569 B CSS |
| `pnpm capture` | exit 0 | Launches the built Electron window and writes nine 1440×900 PNGs |

Test files: `tests/url.test.ts`, `tests/services.test.ts`, `tests/store.test.ts`,
`tests/themes.test.ts`.

What the unit suite covers:

- URLs: scheme inference, http(s) restriction, trailing-slash and case
  handling, host extraction, host-vs-search address resolution, search engines.
- Services: name/URL validation, category and accent allowlists, glyph
  derivation, duplicate and unsafe IDs, starter workspace shape.
- Store: hostile/partial state sanitisation, add/edit/remove/pin/toggle
  operations, settings updates, theme selection, reset.
- Themes: six themes, token completeness, the `kryvex-dark` default.

## Runtime checks

- **Production shell + nine routes.** `pnpm capture` uses the packaged build
  (`dist/index.html`), deep-links each view, waits for render, and saves a
  screenshot. Capture aborts on renderer console errors. All nine routes
  produced a non-blank image: `home`, `services`, `add-service`, `service`,
  `browser`, `command-palette`, `settings`, `settings-about`, `light-theme`.
- **Live embedded module.** The Sohbet module (`https://sohbet.xiondigital.net/`)
  was loaded in its `persist:svc-*` webview and probed until
  `loading: false`; the captured frame shows the real site.
- **IPC bridge.** The About panel and starter workspace in the captures prove
  the preload `appInfo` and `loadState` paths work through the sandboxed bridge.
- **Dev mode.** `pnpm dev:electron` was started after fixing a Vite
  `publicDir` defect; Vite served the renderer and Electron launched. The dev
  renderer was not visually captured — screenshots come from the production
  build.

## Not executed (do not treat as passing)

- No end-to-end restart test that mutates state in the UI, quits, relaunches and
  re-reads it. Persistence is covered at the store level and the save IPC path
  is implemented, but the round trip is not automated.
- No permission-prompt, download, popup or external-nav integration tests.
- No `pnpm audit`/dependency scan recorded yet (`docs/DEPENDENCY_AUDIT.md`
  covers the upstream reference, not the shipped tree).
- No installer was built (`pnpm dist`), no signed artifact exists, and no CI
  workflow has run.
- macOS and Linux were not exercised.

## Reproduce

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm capture   # rewrites screenshots/ from the built app
```
