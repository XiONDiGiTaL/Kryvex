# Kryvex: integration audit (8 Nov 2026, at `0.9.5-hotfix.10` + `92a6a68`)

The question this answers: what does Kryvex already have, what would the
proposed integration work duplicate, and in what order can it be built without
breaking the promises the app already keeps. It is an audit, so it separates
what was read in the code from what is only planned.

## Where the code actually is

- Electron 44, React 19, Vite 8, TypeScript 7, vitest 5, pnpm 10.
- `electron/` holds 103 files: the main process, one module per concern
  (`main.ts` and the `*-rules.ts` files that hold the testable parts).
  `src/` holds 185 files: the React shell, its views, its pure helpers.
- Three surfaces share the app: the trusted shell renderer, one `<webview>` per
  service module, and the browser's own tabs. Every guest is sandboxed with
  context isolation, and the shell talks to main only through the typed bridge
  in `electron/preload.ts`.
- A service module is mounted once and kept alive on its own
  `persist:svc-*` partition, so a call or an upload survives a view change and a
  session survives a restart. Browser tabs get in-memory partitions; private
  tabs are wiped on close and never restored.
- Persistence is one JSON state file the main process owns, written atomically
  and size-capped. There is no account, no telemetry, no cloud sync. That is
  the whole backend, and everything below has to respect it.

## Inventory, by area

Verified by reading the code in this batch:

| Area | Exists | Notable gap |
| --- | --- | --- |
| Services | Registry with presets, pin, categories, isolated sessions, keep-alive, sign-in folding, unread badge | No hibernation; notification granularity is all-or-nothing |
| Browser | Tabs and session restore, history, bookmarks, downloads, torrents, find, zoom, private tabs, pop-ups as in-app tabs, user scripts, Web Store extensions | Per-site zoom memory, per-site privacy exceptions |
| Shell | Home board and widgets, theme gallery (81 themes), wallpaper, workspace/canvas, command palette | The palette is a launcher, not a search layer |
| Notifications | The Windows AppUserModelID and activation handling (`electron/notifications.ts`, 70 lines); unread counts from page titles | No history, no per-service mute, no routing: Chromium shows the toast itself |
| Resources | Per-service CPU/memory sampling (`electron/resources.ts`, `electron/resources-rules.ts`) and a monitor panel | Sampling only; nothing acts on it |
| Assistant | Vexium over a reviewed local model, with a tool surface (`src/lib/assistant-tools.ts`, 593 lines) and page capture | Context is one page at a time |
| Tools | Lexium, media player, 8-bit emulator, Disk pulse, Kryvex Link, File Forge, Arcade, Rooms | — |
| Backup | Nothing | No manual or scheduled backup, no restore, no export |
| Knowledge | Nothing, apart from browser history/bookmarks, `src/lib/research.ts` and captured pages | No notes, collections, highlights or vault |

Read, not assumed: `electron/notifications.ts` is 70 lines and does not receive
notifications; `electron/resources.ts` is 85 lines and only samples; the command
palette's groups are `Navigate`, `Actions`, `Services`, `Themes` and nothing
else; a grep for `backup`, `vault`, `knowledge` and `reading-room` across
`electron/` and `src/` finds no feature, only unrelated copy.

## Overlaps: what to build on instead of duplicating

1. **Universal search vs the command palette.** The palette
   (`src/components/CommandPalette.tsx`, 177 lines) filters a fixed list of six
   views, two actions, the services and the themes. It has no index and no data
   sources. Search should own the data layer and the palette should become one
   surface over it, not a second implementation beside it.
2. **Activity Center vs notifications.** `electron/notifications.ts` is the
   Windows identity and activation path only. Service toasts are Chromium's own,
   so a centre needs a `Notification` shim in the guest preload that records,
   routes and (when opted in) suppresses the native toast — one interception
   point, not a competing system.
3. **Resource Manager vs the monitor.** `resources.ts` already maps guest PIDs
   to modules. Hibernation adds an action to that measurement, and the service
   lifecycle code already knows how to unmount and remount a module without
   losing its partition.
4. **Knowledge vs what is already captured.** `src/lib/research.ts`,
   `src/lib/vexium-capture.ts`, browser history/bookmarks and the user-script
   store are the raw material. A vault should index those rather than start a
   second store of the same pages.
5. **Extensions.** `electron/extensions.ts` (Web Store) and
   `electron/userscripts.ts` already run third-party code with narrow, separate
   rules. A public extension API must reuse that permission shape; it must not
   become a second, weaker execution path.

## Conflicts and constraints to settle first

- **Where the index lives.** History, bookmarks and downloads live in the state
  file in main; open tabs and notes live in the renderer. A search layer needs
  one query API in main plus renderer-registered providers, or every source
  becomes its own ad-hoc search.
- **Hibernation vs the product promise.** "A module stays mounted" is why a call
  survives a view change. Hibernation has to be opt-in, per service, exemptible,
  and must never clear the partition or drop a signed-in session.
- **Notification capture vs double toasts.** Intercepting in the preload while
  Chromium also raises its own notification would notify twice. The shim must be
  the only path, and it must keep working for services that choose to stay
  native.
- **Backup vs the one state file.** Restoring must never overwrite the live
  state silently, and it has to cope with older schema versions; the atomic
  write path already exists to build on.

## Order of work

1. **Search data layer** (main-process query + renderer providers + one UI
   surface with categories, filters and keyboard navigation). It is the
   dependency for the next two items.
2. **Activity Center** (notification capture, history, per-service preferences,
   click-through into the originating module).
3. **Resource Manager** (hibernation and wake on top of the existing sampler and
   lifecycle).
4. **Backup and restore** (versioned snapshots, preview before restore, no
   silent overwrite).
5. **Reading Room and Knowledge Vault** (collections, highlights, tags, and
   making collections selectable as Vexium context).
6. **Extension API and review process** (last: it packages the surfaces above
   and needs them stable).

## Milestone 1, shipped (8 Nov 2026)

Universal search, first slice. `electron/search-rules.ts` holds the pure rules
(query terms, scoring, ranking, and the sanitising the renderer applies to what
it is handed); `electron/search.ts` builds the index and answers one query from
the state file and the download manager. One IPC channel
(`kryvex:search:query`) and one bridge method (`searchQuery`) carry it, and the
command palette became the surface rather than a second implementation beside
it: with a query typed, its own commands are scored by the same function and
merged with the index's services, history, bookmarks and downloads into one
ranked list, grouped by source, with arrow/Enter navigation and `Ctrl+K` over
all of it.

What a result opens: a service goes to its module, a history entry or bookmark
to a Browser tab (`#/browser?url=…`), a download to the file the download
manager already tracks. Nothing leaves the machine: the query is answered from
records the app already keeps, and there is no second index on disk.

Not in this slice, and therefore still on the queue: workspaces, saved settings
and user-script records as sources; per-source filter chips; and a dedicated
results view with more room than a palette row.

## In this batch

- The user-script harness's address-bar click now verifies that the press
  actually reached the field before it asserts a selection
  (`scripts/verify-userscripts.cjs`).
- A service's pop-up that opens with no page (`window.open('')`,
  `about:blank`) is allowed again, so Google Identity Services and other OAuth
  SDKs that reserve a window and navigate it afterwards work
  (`electron/main.ts`, `electron/popup-rules.ts`, unit-tested).

## What this audit does not claim

The first search slice exists; the Activity Center, hibernation, backup and the
vault do not. Search is exercised by unit tests over the rules and the index,
and by nothing else yet: no harness drives a query through the running app.
Nothing here was exercised in a running Windows build. The pop-up fix is
unit-tested, and `scripts/verify-signin-popup.cjs` is the harness that proves it
in a real window; it needs the internet and an opt-in CI job, so its result is
recorded where it ran, not assumed here.
