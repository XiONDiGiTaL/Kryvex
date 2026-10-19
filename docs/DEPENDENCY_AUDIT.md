# Dependency Audit (manifest facts, 2026-10-19)

Source: `upstream/ferdium-app/package.json` + `pnpm-lock.yaml` (575 KB).
No `node_modules` installed; no vulnerability scan run yet (M2/M7).

## Runtime highlights (82 deps)

- `electron` 44.2.0 (devDep, ships Chromium + Node for the built app)
- `react`/`react-dom` 18.3.1, `mobx` 6.13.5, `mobx-react` 7.6.0,
  `react-router-dom` 6.24.1
- `electron-updater` 6.3.9 (updates; sign policy in builder yml)
- `@adonisjs/framework` 5.0.13 + `sqlite3` 5.1.6 (embedded local API/DB)
- Full list: see `package.json` → `pnpm-lock.yaml` (exact pins).

## Build/test (63 devDeps)

`electron-builder` 26.15.7, `esbuild` 0.16.17, `typescript` 5.4.5,
`jest` 29.7.0, `eslint` 8.57.0, `prettier` 3.3.3, formatjs Crowdin chain.

## Notes for Kryvex

- Keep pnpm + lockfile (ED-004/ED-006); do not silently switch to npm.
- `sqlite3` 5.1.6 is a native module — needs build tools on Windows for
  source builds; prefer electron-builder's packaged flow and document.
- Recipes submodule (`ferdium-recipes`, uninitialized) is a second
  dependency surface: audit its licenses when initialized.
- Midori `core` reference is LGPL-2.1 — not shipped; no action unless used.
- M7 must run `pnpm audit` (or equivalent) and record CVEs + dispositions.
