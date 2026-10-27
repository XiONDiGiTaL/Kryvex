# Kryvex 0.9.5: the built-in tools, a crop-area capture, and startup on your terms

Prepared 2026-10-27 for the `v0.9.5` tag. This is a new version line rather than
a hotfix suffix: everything in 0.9.4, 0.9.4-hotfix.1, 0.9.4-hotfix.2 and
0.9.4-hotfix.3 is included, and the batches that landed after hotfix.3 was
published are gathered here instead of in another `-hotfix.N`
([UPDATES.md](UPDATES.md)).

Three tools join the app as services of their own, the tools and the room can
live in windows, the capture tool can take an area, and the machine can be left
to start Kryvex and its speech engine by itself. Reported items addressed:

- **The capture tool could only take the whole target.** The card now offers
  **Whole target** (the default, unchanged) or **An area**, drawn by dragging on
  a frozen frame — for stills and for recordings alike.
- **A service's options panel stayed open when you pressed away from it**, so
  several could be left open at once unless the settings button was pressed
  again. It closes on any press outside it now.
- **The clock's outline style was invisible on some themes**, reported on XiØN
  Special Edition unless Accent or Muted was chosen. It was invisible on *every*
  theme: the rule stroked the digits with `var(--fg)`, a token no theme defines.
- **The centred clock sat to the left of where the eye expects it**, and now sits
  a little right of its column.
- **The world clock's 24-hour switch was changing the main clock too**, so the
  two were not separable. Each clock owns its own switch now.
- **The calculator gave no sign it could be typed into.** It shows a caret while
  it holds the keyboard, and only then.
- **Home's blocks could not be moved.** Common actions, quick launch, recent
  activity and startup are reorderable from the board's own controls.
- **The phone companion was called "Kyvex Link"** — one letter short — in the
  desktop copy, the served page, its own title, the catalogue and the storage keys
  the phone keeps its pairing under. All of them read **Kryvex Link**, and a phone
  that paired under the old keys keeps its pairing.
- **A pinned service could not be dragged onto the Workspace** (addressed in
  0.9.4-hotfix.2); what is new here is that the three built-in tools can be
  placed the same way, and that a room can be popped out of the main area.

## What changed

- **Three in-house tools (`src/views/Arcade.tsx`, `src/views/FileForge.tsx`,
  `src/views/Canvas.tsx`, `src/lib/secret-tools.ts`, `src/lib/forge-rules.ts`,
  `src/lib/canvas-rules.ts`, `src/lib/canvas-session.ts`,
  `src/lib/i18n-secret.ts`, `src/components/ElementMark.tsx`,
  `src/views/Services.tsx`, `src/components/ServiceDialog.tsx`).** Arcade (x535)
  embeds the xiondigital.net arcade in a persistent partition of its own, so
  scores and saves survive a restart. File Forge (x536) is one workbench over
  four groups — images, PDFs, data and batch rename — where the interface only
  offers a destination it can actually write. Canvas (x537) is a vector sheet with
  undo, redo, exports and a hand-off that turns typed words into a sticky note on
  the Home board, refusing when the board is full rather than dropping the text.
- **One file boundary behind them (`electron/file-kit.ts`,
  `electron/file-kit-rules.ts`, `src/lib/binary.ts`, `electron/main.ts`,
  `electron/preload.ts`).** Nothing in these tools touches the disk on its own.
  Every path crosses a native dialog in the main process through one narrow
  boundary — pick, save, rename, reveal, copy — and every payload is sniffed there
  before it is written, so a file that lies about its format, a name the app never
  writes, a rename of a file this session never picked and an empty export are all
  refused as codes, with no dialog and no file. The rules live in one place and
  are shared by both sides, which is what keeps the renderer's promise and the main
  process's check the same promise. `pdf-lib` is pinned for the PDF group; the
  three tools have copy in Spanish, German, French and Turkish.
- **A window that is a window (`src/components/ToolWindowBoard.tsx`,
  `src/lib/tool-windows.ts`, `src/App.tsx`, `src/lib/secret-tools.ts`).** The
  built-in tools can be dropped into the Workspace from *Add service*. A tool has
  no service record, so placing one adds nothing to the service list and leaves
  nothing behind when it closes: the window is the whole of it, drawn by the same
  board that holds services — same geometry, same stacking band, same controls,
  same tray, same motion. Only the tools that draw themselves may be framed twice
  — the others own a partition, a server or a page state — so the embeddable set
  is a registry of its own rather than "every secret tool".
- **A room that leaves the main area (`src/views/Rooms.tsx`, `src/App.tsx`,
  `src/lib/i18n-session.ts`, `src/styles-link.css`).** A room pops out into a
  window over the app, which is what makes it possible to keep watching a room
  while using a service, the browser or the Workspace. There is still one room and
  one session: the route says where it went and offers **Bring it back**, rather
  than drawing a second copy of the room.
- **The Home board settles what it was asked for (`src/views/Home.tsx`,
  `src/components/HomeBoard.tsx`, `src/lib/home-sections.ts`,
  `src/components/OptionsPopover.tsx`, `src/components/CalculatorWidget.tsx`,
  `src/components/WorldClockWidget.tsx`, `src/styles-board.css`, `src/lib/store.ts`,
  `src/types.ts`).** The four blocks of the page are reorderable from the board's
  own controls, stored in the profile, and repaired rather than trusted on the way
  in. The world clock and the board clock each own their 12/24-hour switch, and a
  profile written before the split keeps the format it was read in. The calculator
  shows a blinking caret only while it holds the keyboard. The service options
  panel closes on a press anywhere outside it, with a capture-phase containment
  test so a press on its own switches — or on the button that opened it — cannot
  swallow a toggle. The clock's outline style stroked with a token no theme defines
  and so drew nothing: all five uses of `--fg` in the stylesheets now name
  `var(--ink)`, which repairs every theme rather than the one it was reported on.
- **A capture can take an area (`src/components/CaptureRegionPicker.tsx`,
  `src/lib/capture-region.ts`, `src/components/ScreenCaptureWidget.tsx`,
  `src/lib/screen-capture.ts`, `src/lib/i18n-capture.ts`, `src/styles-board.css`).**
  Choosing **An area** arms the target, grabs one frame and asks for the box on
  that frozen frame rather than on the live target, which is what keeps the
  overlay out of the picture. The drag is read back in the frame's own pixels, so
  the region survives a resized window or a different monitor scale, and a drag
  under 24 source pixels is a click rather than a selection. A still is that frame
  with the region copied out of it. A recording cannot be cropped afterwards
  without re-encoding, so it is cropped as it is written: the target's frames are
  drawn into a canvas the size of the area, that canvas is what `MediaRecorder`
  records, and the target's audio tracks are carried across, with even-rounded
  sizes because VP8/VP9 want even dimensions. The area is remembered, and an area
  the frame can no longer hold is reported and dropped instead of quietly cutting a
  strip out of the result.
- **Two startup switches (`electron/startup.ts`, `electron/speech-runtime.ts`,
  `electron/speech-runtime-rules.ts`, `electron/main.ts`, `electron/preload.ts`,
  `src/views/Settings.tsx`, `src/views/Lexium.tsx`,
  `src/components/LexiumLocalEngine.tsx`, `src/lib/i18n-extras.ts`,
  `src/lib/i18n-speech.ts`).** Both answer the same complaint: a machine that has
  already been set up still needs a person at the keyboard. The Whisper engine can
  now start with Kryvex and stop on quit — stored in the runtime's own config, read
  by the main process before a renderer exists, and paired with an adoption step in
  Lexium, so an engine Kryvex started for it is used without a press while one the
  user started by hand stays theirs to select. Quitting waits for the child to be
  gone rather than only for the kill to be sent. The general **Start with Windows**
  setting writes the per-user `Run` entry through Electron's login-item API and
  reads it straight back, so the switch can only show what Windows will actually
  do; a portable copy registers its launcher rather than the temporary extraction
  path, and an unpackaged run refuses to write an entry that would open the
  Electron binary with no app.
- **The installer is drawn by the app's own brand (`scripts/installer-art.ps1`,
  `build/installerSidebar.bmp`, `build/installerHeader.bmp`, `package.json`).**
  The install wizard was the one surface Kryvex never drew: a stock NSIS page next
  to an otherwise finished product. The generator now paints both images NSIS asks
  for from one set of brand tokens and the same stroke geometry as
  `brand/logo.svg`, so the mark stays sharp instead of being shrunk from the 512 px
  tile: a 164×314 finish-page panel and a 150×57 header banner carrying the mark,
  the divider hairline and the wordmark, wired through `nsis.installerSidebar` and
  `nsis.installerHeader`. The first attempt stacked the x529 designation under the
  wordmark and crowded the page rule in the real wizard, so the header keeps only
  the mark and the name. Both files regenerate from `pnpm art:installer`.
- **The product name, everywhere (`companion.html`, `electron/link-rules.ts`,
  `electron/link-server.ts`, `src/companion/api.ts`, `src/companion/strings.ts`,
  `src/lib/i18n-link.ts`, `scripts/verify-link.cjs`, `tests/link-companion.test.ts`).**
  The two `localStorage` keys the phone keeps its pairing under are part of the
  rename, so they are moved rather than dropped: an older value is read once and
  written onto the current key, and unpairing clears both spellings, so a retired
  token cannot come back through the old name. The page's `<title>` and its
  `noscript` line were the two places the rename missed, and they are exactly what
  the Link harness reads — the served page *is* `companion.html`.
- **The harnesses stop being local-only (`.github/workflows/ci.yml`,
  `scripts/verify-batch.cjs`, `package.json`).** Twenty-three Electron harnesses
  now run on a runner in a matrix of five jobs — `browser`, `services`, `shell`,
  `rooms`, `tools` — each through `scripts/verify-batch.cjs`, which reads the
  commands out of `package.json` so an alias that changes its script does not need
  editing twice. A matrix rather than more steps: these harnesses boot the app in
  a disposable profile and take the same ports and `.tmp-*` paths, so they cannot
  run beside each other, and without separate jobs one failure would skip
  everything queued behind it. The matrix depends on the main job, because when the
  install or the unit suite is what broke, five more jobs would fail the same way
  for no new information. Sixteen harnesses stay local, each with its reason
  printed by `verify-batch --list`.
- **The checks the runner found (`scripts/verify-chromium-settings.cjs`,
  `scripts/verify-popup-tabs.cjs`, `scripts/verify-shell-batch.cjs`).** A runner
  asks for `prefers-reduced-motion: reduce`, where the app correctly holds the
  calculator's caret still, so that check now emulates both motion branches instead
  of assuming the host's. The engine panel's graphics cell comes from an IPC that
  resolves after the panel mounts, so the harness now waits for a real value rather
  than reading `n/a`; and the popup fixture's own six-second self-close was landing
  inside the placement read on a cold runner, so it is a backstop at 60 s and the
  read waits for the window instead of sleeping a fixed span, printing the desktop
  it saw when it still cannot find one. All three were checks that assumed their
  host, not app faults.
- **One repair that CI caught (`package.json`).** The shell batch's slice of the
  manifest had dropped the `pdf-lib` dependency and the `verify:inhouse` script
  that the services batch added, leaving File Forge asking for a dependency its own
  manifest no longer declared while the lockfile still listed it. A local typecheck
  cannot see that: the package is installed here whatever the manifest says, and a
  dynamic import is not resolved at compile time.
- **Version 0.9.5.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.5-v1`) move together. The installed `C:\Kryvex\Kryvex.exe`
  reports `ProductVersion 0.9.5.0` / `FileVersion 0.9.5`.

## Artifacts

The workflow builds what it publishes: pushing the `v0.9.5` tag runs the Release
workflow (`windows-latest`, Node 22, pnpm 10), which builds the pair, writes
`SHA256SUMS.txt` and attaches them to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.5).

The pair below was built here from this working tree (`pnpm package:win`, Electron
44.9.3, x64) and is **not** the published file set — the workflow's own build
replaces it, and that release page is the one to check a download against:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-x64.exe` | 134,406,210 B (128.18 MiB) | `496c1e7a090b2b98cad5fdfe2c94d8d0ad7b293d926d55aafddd84e802cd4ac2` |
| `Kryvex-Portable-0.9.5-x64.exe` | 134,162,354 B (127.95 MiB) | `46cd9968ede829e7506ac6e1d4e3f3873efba0c7f462c58bcc3cfca145c74d24` |

No model weights are bundled. Both EXEs are **unsigned**.

**Web client.** The same tag rebuilds and force-pushes `gh-pages`, so the
published worker should name `kryvex-web-0.9.5-v1`; if the web client is
republished without a version change, its trailing `-vN` is what moves. Built here
from this tree, `pnpm build:web` passes and the worker names that cache.

## Install

1. Run `Kryvex-Setup-0.9.5-x64.exe`. An installed 0.9.4 line also reaches it via
   **Settings → Updates**: a hotfix outranks the release it patches, but a newer
   version line outranks every hotfix of the line below it, so 0.9.5 is offered to
   a machine on 0.9.4-hotfix.3 rather than being read as a downgrade
   (`tests/update-rules.test.ts` pins both directions).
2. The wizard offers the existing per-user installation in `C:\Kryvex` and upgrades
   it in place. If Kryvex is running, setup asks to close it first; shortcuts stay
   and the profile in `%APPDATA%\Kryvex` is untouched, so services stay signed in,
   the board keeps its layout, and a phone's pairing survives the rename.
3. The Portable EXE runs without installing. **Start with Windows** is off by
   default and, on a portable copy, registers the portable launcher rather than the
   temporary extraction path.

## Verification performed

- `pnpm typecheck`: **PASS**, exit 0 for the renderer and `electron/`.
- `pnpm test`: **1005/1005 across 89 files**, including the new
  `tests/canvas-rules.test.ts`, `tests/file-kit-rules.test.ts`,
  `tests/forge-rules.test.ts`, `tests/home-sections.test.ts`,
  `tests/capture-region.test.ts` and `tests/link-companion.test.ts`.
- **CI is green on the tip of this line** (`ac2350c`, run `40558476437`): install,
  dependency advisories, typecheck, the unit suite, the web/PWA build, the
  one-time-code relay, the three Electron harness steps
  (`verify:inhouse`, `verify:shell-batch`, `verify:link`) and the five-batch matrix
  — six jobs in all. The two runs before it are red, and both are the checks above:
  `40554739880` failed the browser batch at `verify:chromium` and `40555786455` at
  `verify:popups`, neither of which was an app fault.
- Locally, the five batches pass: 23 harnesses, 6 + 6 + 5 + 3 + 3, about 170 s in
  total. The per-harness counts recorded as each batch landed are
  `verify:inhouse` 29/29, `verify:link` 35/35 and `verify:capture-window` 37/37
  (run twice).
- `pnpm verify:packaged-startup`: **PASS** on the packaged build — a real `Run`
  entry is written, read back from Windows, compared with the launched executable
  and removed again by the same switch, and the engine that starts with the app
  comes up on a relaunch by itself, after the previous quit is confirmed to have
  killed its child.
- `pnpm build:web`: **PASS** (2.3 MiB) with `scripts/check-web-build.cjs` reporting
  the shell, companion and worker, and the worker naming `kryvex-web-0.9.5-v1`.
- `node scripts/verify-self-update.cjs --no-app --wizard --archive --installer
  release/Kryvex-Setup-0.9.5-x64.exe --version 0.9.5`: **PASS** — four pages
  captured, the install page ran for 20,521 ms, the installer exited 0, and the
  capture was archived under `docs/media/releases/0.9.5-wizard/`. The per-user
  installation in `C:\Kryvex` reports 0.9.5 afterwards.
- `pnpm release:check`: **PASS** for 0.9.5, all eleven checks — the record exists,
  it has a `Wizard capture` section, it links the capture, the manifest parses and
  names 0.9.5, the installer exited 0, and all four pages have a screenshot and
  text. `node scripts/check-release-record.cjs --all` passes for every record from
  0.8.3 onward, which is where the capture convention starts; the eight records
  before it (0.3.0 through 0.8.2) have no capture and are reported as missing one.
  The Release workflow runs the check for the version being tagged rather than
  `--all`, so those older records do not gate a tag.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. The capture comes from the locally built installer and is committed with
this record: [capture.md](media/releases/0.9.5-wizard/capture.md).

| # | Page | What it said |
| --- | --- | --- |
| 1 | [Choose Installation Options](media/releases/0.9.5-wizard/pages/01-Choose%20Installation%20Options.png) | "Who should this application be installed for?"; "There is already a per-user installation.(C:\Kryvex) Will reinstall/upgrade."; "Kryvex 0.9.5" |
| 2 | [Choose Install Location](media/releases/0.9.5-wizard/pages/02-Choose%20Install%20Location.png) | Destination `C:\Kryvex`; "Space required: 466.2 MB"; "Space available: 55.4 GB" |
| 3 | [Installing](media/releases/0.9.5-wizard/pages/03-Installing.png) | "Please wait while Kryvex is being installed."; "Kryvex 0.9.5" |
| 4 | [Completing Kryvex Setup](media/releases/0.9.5-wizard/pages/04-Completing%20Kryvex%20Setup.png) | "Kryvex has been installed on your computer. Click Finish to close Setup." |

The install page ran for 20,521 ms between **Installing** and **Completing Kryvex
Setup**, the whole capture took 30,891 ms, and the installer exited 0. The wizard
found no running copy to close first, so the capture has the four pages above
rather than the five a stopped install produces. Both images the new generator
draws were checked in the captured pages themselves rather than assumed: the
header banner on the first two, carrying the mark, the divider hairline and the
wordmark, and the finish page's panel with the lockup, the `x529` designation,
`MODULAR TECHNOLOGY` and `PRECISION III / EVERY CONNECTION` — what
`pnpm art:installer` paints from the brand tokens.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **File Forge and Canvas need the desktop app.** Every write crosses a native
  dialog in the main process, so on the web client File Forge says the web build
  cannot open files on this machine and Canvas says the same rather than offering a
  save that cannot happen.
- **File Forge is four groups, not the whole conversion matrix.** Audio and video
  conversion, extracting audio from video and PDF pages to images remain in
  [BACKLOG.md](BACKLOG.md), as does batch quality presets and an output-size summary
  before the export.
- **The Android companion app does not exist yet.** Kryvex Link is the page a phone
  opens in its own browser; the standalone APK that bridges a phone the way LocalSend
  or KDE Connect does is still on the backlog.
- **Two harnesses still fail here, and both are findings rather than environment.**
  `verify:layout` counts the eight element marks' deliberate `::after` watermark as
  clipped UI, so it is the clipping rule that must learn to read decoration as
  decoration; `verify:home-tools` drives the installed app at `C:\Kryvex\Kryvex.exe`
  and therefore asserts whatever is installed rather than the build under test.
  Both carry their reasons in `scripts/verify-batch.cjs` and neither gates the tag.
- **The startup switches are verified on the packaged Windows x64 build only**;
  the source run refuses to write a `Run` entry by design, and no macOS or Linux
  build exists to try them on.
- **The Virtual LAN panel shows room members' own addresses; it carries no tunnel.**
  Nothing in this release changes what a room's addresses can reach.
