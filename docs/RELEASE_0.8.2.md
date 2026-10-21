# Kryvex 0.8.2 — Windows patch release

Published 2026-10-21 from the `v0.8.2` tag. 0.8.1 fixed the one handler named in
the reported stack; this release closes the rest of that class of bug, so an
installed build stops reading windows and web contents that are already gone.

Download the installer, portable build and checksum list from the
[Kryvex 0.8.2 release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.8.2).

## What changed

- **Folder pickers no longer hand a closed window to Windows.** Choosing a
  download folder, installing an extension from a file or folder, or opening a
  `.torrent` called `dialog.showOpenDialog(window, …)` with only a null check.
  A destroyed parent window throws `Object has been destroyed` inside the
  picker, which reached the user as the blocking “A JavaScript error occurred in
  the main process” dialog. Each picker now asks whether the window is alive
  first and answers **“The main window is not ready.”**
- **The IPC sender check compares a reference, not the live getter.**
  `isShellSender` read `mainWindow.webContents` for every IPC message, so a
  message arriving while the window was tearing down threw out of the handler.
  It now compares against the `shellContents` captured when the window was
  created.
- **The permission broker holds its own shell reference.** `isShellCapture` and
  the broker's `send` read `this.window.webContents`; both use a shell captured
  at attach time plus `isAliveContents`, so a prompt resolved after the window
  closed is dropped instead of throwing.
- **Rooms asks before it reads.** The display-media handler compared against
  `shell.mainFrame` without checking whether the shell was alive, and the
  source list called `getType()` before `isDestroyed()`. A closed shell now
  refuses the request, and sources are filtered by liveness first.
- **A mechanical guard against the whole class.** `electron/lifecycle.ts` adds
  `isAliveWindow` / `isAliveContents`. `pnpm audit:lifecycle` walks the body of
  every `closed`/`destroyed` registration and reports any window or contents
  read, and `tests/lifecycle.test.ts` runs it over `electron/` **and** over a
  fixture holding the old crashing line, so the audit itself is checked.
  `pnpm verify:guards` drives the three compiled pickers with a window that
  throws on every property except `isDestroyed()` and an Electron stub that
  counts dialog requests; removing one compiled guard makes it fail with a
  dialog call and “Selection cancelled”. ED-013 records the rule.

No feature work is included, and nothing in 0.8.1 or 0.8.0 was removed.
Everything from 0.8.0 is included: the GGUF model-file runner, the Chrome
identity and client hints for embedded pages, custom shield filter lists,
sign-ins that survive a restart, and the green **UP TO DATE** verdict.

## Artifacts

Built by the tag-triggered workflow with `pnpm run package:win` under
`release/` (ignored by Git) and attached to the GitHub release:

| File |
| --- |
| `Kryvex-Setup-0.8.2-x64.exe` |
| `Kryvex-Portable-0.8.2-x64.exe` |
| `SHA256SUMS.txt` |

`SHA256SUMS.txt` is authoritative: it is generated from the published files by
`scripts/release-checksums.cjs`, and the updater ignores any release whose
installer has no matching entry. Sizes and digests are recorded here after the
build.

## Install

1. Run `Kryvex-Setup-0.8.2-x64.exe`, or let an installed 0.8.1 update itself
   through **Settings → Updates**.
2. Choose the destination folder in the normal Windows wizard.
3. Use **Settings → Updates** to confirm the release is seen.

The Portable EXE runs without installation. Its state still lives in
`%APPDATA%\Kryvex`.

## Verification performed

- `npm run typecheck` — exit 0 for renderer and `electron/`.
- `npx vitest run` — exit 0, **268/268** tests across 28 files.
- `npm run build` — exit 0.
- `node scripts/audit-lifecycle.cjs` — clean, 38 files.
- `node scripts/verify-party-close.cjs` — PASS on the fixed Rooms handler.
- `node scripts/verify-window-guards.cjs` — PASS on all three pickers, and FAIL
  (`1 call(s)`, “Selection cancelled”) when the compiled download-picker guard
  was removed, so the guard was checked in both directions.
- `node scripts/verify-updater.cjs` — PASS, including the up-to-date branch.
- `node scripts/verify-service-engine.cjs` — PASS (mount, unread badge, popup
  cookie, cookie across restart, per-service clear).
- `node scripts/verify-rooms.cjs` — PASS with a 2560×1440 screen share flowing
  through the changed display handler.
- `npm run audit:i18n` — clean.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- The lifecycle audit is a heuristic over handler bodies, not a parser: a read
  hidden behind a helper function is still possible.
- A close while a media-permission prompt is on screen was not staged, so the
  broker's teardown path is covered by the guard and the type checker rather
  than by a click-through.
- Everything from 0.8.0 still applies: a model file needs a llama.cpp binary the
  user supplies, filter rules depend on the upstream engine, and fingerprint
  farbling is a preload wrapper rather than a Chromium patch.
