# Kryvex 0.9.5-hotfix.9: the xiondigital.net edition

Prepared 2026-11-01 for the `v0.9.5-hotfix.9` tag. This is a hotfix batch, so
the version line stays at **0.9.5** and the build wears the `-hotfix.9` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.8 is
included.

One thing lands here: a fortieth custom theme, **xiondigital.net Edition** — the
eighty-first theme in the catalogue and the third creator plugin. It is the
Special XiØN Edition's glass and liquid motion on the xiondigital.net site's own
near-black ground and single blue, with the site's real X mark in place of the
element tile and its blue kept to edges as a signature accent.

Nothing on `main` is live until this tag runs the Release workflow: the
`windows` job builds the installers and the `web` job publishes the renderer to
`gh-pages`, and no push to `main` publishes either.

## What changed

### The theme (`src/plugins/xiondigital.tsx`)

- **The palette is read from the site, not invented.** `xiondigital.net`'s
  `assets/css/xion.css` and its arcade stylesheet both declare `--bg: #050607`,
  `--panel: #0c0e11`, `--panel-hi: #101318`, `--ink: #ecedef`,
  `--muted: #8b9099`, `--blue: #3f80ff` and `--blue-hi: #79a8ff`; those become
  the theme's tokens, with the site's white hairline resolved onto the ground as
  `line: #232A35`.

  | Token | Value | Site source |
  | --- | --- | --- |
  | `bg` | `#050607` | `--bg` |
  | `surface` | `#0A0B0D` | `--bg-raised` |
  | `raised` | `#101318` | `--panel-hi` |
  | `line` | `#232A35` | `rgba(255 255 255 / 0.14)` over `--bg` |
  | `ink` / `muted` | `#ECEDEF` / `#8B9099` | `--ink` / `--muted` |
  | `accent` / `accentSoft` | `#3F80FF` / `#79A8FF` | `--blue` / `--blue-hi` |

- **Sleeker, not louder.** `glass: true` and `gradient: true` keep the Special
  XiØN Edition's sheen, travelling liquid progress fills and slow mark pulse,
  but the emission is pulled back and the pulse slowed, so the darker ground
  reads as a cooler, quieter version of the same skin rather than a second
  neon one.
- **Accents only on edges** (`src/styles.css`, scoped to
  `:root[data-theme='xiondigital-net']`): a lit hairline under the header, a lit
  brand chip, the rail's section counts, the hero glow, the active theme tile's
  glow, blue status-bar separators, and a small `xiondigital.net` chip beside
  the view name that folds away under 1100px. All of it stops under
  `prefers-reduced-motion`.
- **Wiring.** `Theme.mark` gains `'xiondigital'` (`src/lib/themes.ts`) and
  `ThemeMark` dispatches on it (`src/components/ui.tsx`), so the header chip, the
  status bar label and the Settings About line all use the mark. The plugin
  registers third in `src/plugins/index.ts` with `markColor: '#3F80FF'`.

### The mark

The creator's artwork, not a redrawn approximation. `src/assets/x-mark.png` is
the site's own `images/x-mark.png` (734×862 RGBA), trimmed of its empty margin
and downscaled to 320px of alpha; the file stays colour-neutral (white pixels,
original alpha) and the shell paints it through a CSS mask with
`background: currentColor`. The theme's blue fills it, any other theme would
tint it with its own accent, and there is no second copy of the artwork per
colour. It reads at 12px in the status bar and at 320px on the About tile.

### Translations and docs

- Two new strings — `xiondigital.net Edition` and
  `XIONDIGITAL.NET / SIGNATURE BLUE` — are translated in Spanish, German, French
  and Turkish, so the coverage ratchet does not move. `scripts/audit-i18n.cjs`
  classifies the edition name as technical alongside the other two editions.
- README, `docs/THEMING.md` and `PROJECT_STATUS.md` record the eighty-first
  theme and the third plugin. The mark is bundled once as
  `src/assets/x-mark.png` for the app and is deliberately not reproduced as a
  standalone image in the README.

## Verification

- `pnpm typecheck` clean; `pnpm test` **1,159 passing**; `pnpm check:icons`
  PASS; `pnpm audit:i18n` clean (59 renderer files, no hardcoded UI strings);
  `pnpm build` and `pnpm build:web` clean, with the web gate's manifest, icon and
  service-worker checks passing.
- `tests/themes.test.ts` pins the catalogue at **81 themes, 78 non-plugin and
  three plugins**, the new id, its presence in the glass list and its tokens;
  `tests/theme-gallery.test.ts` and `tests/i18n-coverage.test.ts` pass with it.
  `npx vitest run tests/themes.test.ts tests/theme-gallery.test.ts
  tests/i18n-coverage.test.ts` reports 31 passing.
- Seven tests in `tests/disk-rules.test.ts` and `tests/model-rules.test.ts` fail
  on the Linux machine this batch was prepared on: they assert Windows
  `C:\…` path behaviour. They are unchanged by this batch and pass on the
  Windows runner the Release workflow uses.
- No screenshot of the running app is attached: the mark was checked by
  rasterising the site's own asset over the theme's ground, and the accent
  placement was reviewed in source. The desktop pass over the header chip at
  narrow widths is still worth a look in the wizard run.

## Artifacts

Produced by the Release workflow on the `v0.9.5-hotfix.9` tag
(`windows-latest`, Node 22, pnpm 10) and attached to the release:

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.9-x64.exe` | 138,319,761 B | `94e44b5381dfc61db52ac7d0f75d88bcade9d767996d08a42d9aef33f7034b4e` |
| `Kryvex-Portable-0.9.5-hotfix.9-x64.exe` | 138,075,929 B | `7c71518eb039e1293d5c742507d3de88485c0d58a67bd3318f31ce09884b8b3d` |

These are the published artifacts' own sizes and digests, read from the release
on 2026-11-06. This table said `recorded after the cut` for four days after the
release went live — the placeholder survived the cut because nothing reads it,
which is why the post-publish pass is now written down in
[UPDATES.md](UPDATES.md). `SHA256SUMS.txt` (207 B) travels with the pair and
matches both digests, so the in-app updater accepts this release. Both EXEs are
**unsigned**, so Windows SmartScreen still shows its unknown-publisher prompt on
first run.

## Wizard capture

The Release workflow runs `node scripts/check-release-record.cjs` before it
builds, and that gate fails a tag whose record has no installer wizard capture.
The capture is therefore made on the Windows machine that cuts the tag, into
`docs/media/releases/0.9.5-hotfix.9-wizard/`, and committed before the tag is
pushed:

1. `pnpm package:win` builds the Setup and Portable EXEs into `release/`.
2. `pnpm release:wizard --archive` runs the Setup EXE through its own wizard,
   records each page's controls in visual order, and writes `wizard.json` plus
   `pages/*.png` and `capture.md` under `0.9.5-hotfix.9-wizard/`.
3. `pnpm release:check` reports PASS for 0.9.5-hotfix.9.
4. Commit the capture, push `main`, then push the `v0.9.5-hotfix.9` tag.

The pages cannot come from a CDP screenshot of the shell: the installer is a
native Windows dialog. The manifest records the installer's exit code and each
page's title and text, and this record links the archive as
`docs/media/releases/0.9.5-hotfix.9-wizard`.

Until step 4, `releases/latest` answered `v0.9.5-hotfix.8` and
`https://xiondigital.net/Kryvex/` served the hotfix.8 renderer. Both moved at
2026-11-02T03:25:05Z: the digests are in the table above and in
`PROJECT_STATUS.md`, and the served `assets/main-ChjyKzae.js` carries the
`xiondigital.net Edition`
entry. The tag's first push was made without this capture and stopped at the gate
above, so nothing was published until the tag was moved onto the commit that
carries it.

## Upgrading

1. Run `Kryvex-Setup-0.9.5-hotfix.9-x64.exe`, or update an installed 0.9.5 build
   from **Settings → Updates** — the checker reads `releases/latest` and accepts
   the Setup asset for the tag it finds.
2. Portable builds never self-replace: **Show downloaded file** opens Explorer so
   the new portable EXE can be run after Kryvex is closed.
3. Existing services, sessions, bookmarks, history, wallpapers, user scripts and
   settings are untouched by an upgrade. The theme is a catalogue entry, so an
   existing profile sees it in the picker on first launch and keeps whatever
   theme it had selected.
