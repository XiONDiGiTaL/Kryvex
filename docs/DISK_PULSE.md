# Disk pulse: secret storage tool

Status: **implemented.** Services → Secret services → **Disk pulse** (`#/disk`).

Kryvex's fourth secret tool is a local disk analyzer with a guarded cleaner. It
is not a web module: the view talks to the main process over the existing
`kryvex:disk:*` bridge, and the renderer never sees or sends a filesystem path.

## What it does

- **Health.** Free, used and total bytes for the drive that holds the user
  profile, read with `statfs`. The usage is drawn as a heart-rate trace whose
  amplitude and animation speed follow how full the drive is (calm under 75%,
  warm from 75%, hot from 90%), plus a meter and three numbers.
- **Analyzer.** Sizes the drive's top-level folders (up to eight, largest
  first) with the same walker, bounded by a 20-second budget. Folders that are
  not readable are skipped, not fatal.
- **Cleanup plan.** Seven categories, each with a size and file count:
  user temp files older than a day, crash dumps, the legacy Windows internet
  cache, thumbnail/icon caches, the default Chrome and Edge caches, and the
  Windows Error Reporting queue. Only categories whose roots exist are shown as
  available; the rest say `NOT FOUND`.
- **Background scanning.** Every scan runs in its own worker thread
  (`electron/disk-scan-worker.ts`): the main process spawns one per scan and
  terminates it when it settles or is stopped. The walk therefore cannot block
  the window, IPC or another service even on a full drive; the UI can cancel it
  with `Stop scan`, and a second scan is refused while one is in flight.

## Safety model

The rules live in `electron/disk-rules.ts` and are pure, so they are tested
without touching a drive. The cleaner in `electron/disk-service.ts` enforces
them again at deletion time.

1. **The renderer sends ids, never paths.** `kryvex:disk:clean` accepts a list
   of target ids; `targetById` maps them to roots compiled into the main
   process. A path, an unknown id, an 80-character id or a stale id is refused.
2. **Containment.** A file must sit strictly below its target root, the root
   itself is never a candidate, and drive roots are rejected. Prefix siblings
   (`...\Temp-evil` next to `...\Temp`) are outside, because containment is
   checked with `path.relative`, not `startsWith`.
3. **Protected roots.** `C:\Windows`, `System32`, `SysWOW64`, `WinSxS`,
   `Program Files`, `Program Files (x86)`, `ProgramData`, Desktop, Documents,
   Downloads, Pictures, Videos, Music, Favorites, AppData\Roaming,
   AppData\LocalLow, `.ssh` and `.gnupg` are refused even if a target root were
   misconfigured. The profile itself is deliberately not protected (temp and
   browser caches live under it) but nothing outside a target root is eligible.
4. **No link following.** Directory walks skip symlinks and junctions, and each
   file is `lstat`ed immediately before `unlink`. A link planted inside a cache
   cannot redirect a delete.
5. **Old files only.** The temp category ignores anything touched in the last
   24 hours, so a running installer is not deleted.
6. **Files in use are skipped.** `EBUSY`/`EPERM` and any unlink failure are
   counted and reported; the run continues.
7. **Two human gates.** The first visit requires an explicit disclaimer
   (persisted once), and every clean requires a modal that names the exact
   categories and bytes and a typed `CLEAN` confirmation. The modal states that
   deletion bypasses the Recycle Bin and cannot be undone.
8. **No elevation.** Windows Update, delivery optimization, DISM and other
   system categories that need an administrator are not offered; the spec field
   `requiresElevation` exists and is false for every built-in target. The app
   never asks for UAC from this tool.

Deleting a system-essential file is prevented structurally: it is not reachable
by any target id. If a future rule were to include one, the protected-root check
would still refuse it and the file would be counted as skipped.

## Licence boundaries of the reference projects

The tool was designed after reviewing three projects, but only one permits
adaptation:

| Project | Licence | What Kryvex took |
| --- | --- | --- |
| [Cleanmgr+](https://github.com/builtbybel/CleanmgrPlus) | Custom EULA: personal use, **no modification or derivative works** | Feature ideas only; no code. |
| [CleanManager](https://github.com/patrickleehua/CleanManager) | MIT | Category checklist and "see before you delete" flow; no code copied verbatim. |
| [SquirrelDisk](https://github.com/adileo/squirreldisk) | AGPL-3.0 | Analyzer/tree-map idea only; no code, because AGPL would relicense Kryvex. |

The analyzer is a folder-size walker in Kryvex's own worker thread, not a port of
any of them. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Verification

- `tests/disk-rules.test.ts`: containment, prefix siblings, protected roots,
  traversal, drive roots, age filter, target lookup, size formatting.
- `tests/disk-service.test.ts`: a real fixture under `%TEMP%`, where old files in the
  root and a subdirectory are removed, a fresh file survives, the root survives,
  and a path or unknown id is refused.
- `tests/disk-scan.test.ts`, the body the worker runs, against a fixture:
  targets are sized with the age filter applied, missing caches report as
  unavailable, an already-aborted signal returns cancelled with no sizes, and
  drive health reads real numbers.
- `npm run verify:disk` (build, then `scripts/verify-disk-pulse.cjs`), launches
  the real app in a disposable profile, opens `#/disk`, accepts the disclaimer,
  reads real drive numbers, runs a scan and checks the categories, sizes and
  that the clean action arms. It also probes IPC while the scan is still
  running (the main process must answer immediately) and stops a second scan to
  prove the worker is torn down. It never presses Clean.
- Packaged layout: a worker entry inside a real `app.asar` was spawned with
  Electron 44 and returned a scan payload, so the compiled worker (and the
  `disk-scan`/`disk-rules` modules it requires) load from the archive without
  needing `asarUnpack`.
- `npm run typecheck`, `npm test`, `node scripts/audit-i18n.cjs` and
  `npm run build` are clean.

## Deliberately not in this version

- Recycle Bin emptying (needs `SHQueryRecycleBin`/shell APIs and a different
  confirmation story).
- Windows Update, WinSxS and delivery-optimization categories (elevation).
- Duplicate-file detection and a sunburst canvas; the bars are the lightweight
  version and stay readable at every window size.
- Scheduling scans at startup. Scanning is user-triggered; nothing is read
  before the disclaimer is accepted and a button is pressed.
