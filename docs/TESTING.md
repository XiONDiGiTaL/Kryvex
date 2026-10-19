# Testing record — Kryvex 0.3.0

All results below were produced on 2026-10-19 on Windows with Node 24.19.0,
pnpm 12.3.4 and Electron 44.2.0. Commands were run from `X:\Veyra`; no test was
skipped, weakened or excluded to make the suite pass.

## Automated

| Command | Result | Scope |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `tsc --noEmit` for renderer and `electron/` (strict) |
| `pnpm test` | exit 0, 40/40 | Vitest: URL normalisation/search resolution, service validation and helpers, starter state, state sanitisation and registry operations, catalogue, theme catalogue |
| `pnpm build` | exit 0 | Vite renderer (`dist/`) + esbuild main/preload (`dist-electron/`); 322.12 kB JS, 43.73 kB CSS |
| `pnpm capture` | exit 0 | Launches the built Electron window and writes thirteen 1440×900 PNGs |

Test files: `tests/url.test.ts`, `tests/services.test.ts`, `tests/store.test.ts`,
`tests/themes.test.ts`.

What the unit suite covers:

- URLs: scheme inference, http(s) restriction, trailing-slash and case
  handling, host extraction, host-vs-search address resolution, search engines.
- Services: name/URL validation, category and accent allowlists, glyph
  derivation, duplicate and unsafe IDs, starter workspace shape, catalogue
  presets.
- Store: hostile/partial state sanitisation, add/edit/remove/pin/toggle
  operations, settings updates, theme selection, reset.
- Themes: six themes, token completeness, the `kryvex-dark` default.

## Runtime checks

- **Production shell + thirteen captures.** `pnpm capture` uses the built
  renderer (`dist/index.html`), deep-links each view, waits for render, and
  saves a screenshot. Capture aborts on renderer console errors. All thirteen
  captures produced a non-blank image: `home`, `help`, `services`, `add-service`,
  `service`, `browser`, `settings`, `settings-shield`, `settings-plugins`,
  `settings-about`, `donkey-theme`, `command-palette`, `light-theme`.
- **Live embedded module.** The Sohbet module (`https://sohbet.xiondigital.net/`)
  was loaded in its `persist:svc-*` webview and probed until
  `loading: false`; the captured frame shows the real site.
- **IPC bridge.** The About panel and starter workspace in the captures prove
  the preload `appInfo` and `loadState` paths work through the sandboxed bridge.
- **Shield and extensions.** The packaged Windows build started, attached the
  cached filter engine, and loaded the installed-extension list. A temporary
  Chrome-compatible test extension installed and loaded through the native
  manager; it was removed afterwards.
- **About credits.** `settings-about.png` shows the `x529` element readout and
  the two developer links (XiONDiGiTaL, player529) in the running window. The
  header Add/Settings/Help buttons and the Home common-action cards are visible
  in `home.png`; `help.png` shows the clickable quick-help dialog.
- **Click paths.** Offscreen Electron probes clicked the header Add/Settings/Help
  controls and every Home common-action card. Header Help opened the four-action
  dialog; its Settings and Add actions navigated or opened the correct dialog;
  Home cards reached `#/services`, `#/browser` and `#/settings`.
- **Installer.** electron-builder produced `release/Kryvex-Setup-0.3.0-x64.exe`
  and `release/Kryvex-Portable-0.3.0-x64.exe` (108 MiB each). The setup was
  installed silently to a custom temporary directory; Desktop and Start Menu
  shortcuts and the uninstall registry entry were present. The installed
  `Kryvex.exe` completed all thirteen capture routes. The portable EXE also
  launched directly and completed all thirteen routes. The uninstaller removed
  the install directory, both shortcuts and the registry entry.
- **Signing state.** PowerShell `Get-AuthenticodeSignature` reports
  `NotSigned` for both EXEs.
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
- The NSIS wizard was not clicked through manually; installation was verified
  with `/S /D=<custom folder>` instead. No code-signed installer exists and no
  CI workflow has run.
- macOS and Linux were not exercised.

## Reproduce

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm capture   # rewrites screenshots/ from the built app
```
