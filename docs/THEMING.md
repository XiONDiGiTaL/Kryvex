# Theming (Kryvex Theme Studio — plan of record)

Brand: **Kryvex** — a fictional periodic-table element (designation `x529`, symbol
`Kx`) rendered as a graphite tile with a metallic border and restrained
electric-blue accent. Full identity rules live in `brand/BRAND.md`; this file
covers the theme system that will ship in the app.

Assets: `brand/logo.svg` (full tile), `brand/icon-small.svg` (16–64px),
`brand/tray.svg` (white, transparent), `brand/logo-mono.svg` (currentColor),
`brand/icons/` (PNG exports + `kryvex.ico`).

## Token system (`brand/tokens.json`, schema v2)

One source of truth for `color`, `radius`, `spacing`, `border`, `density`,
`type`, `motion`, `layout` and the `brand` block (product, tagline, element
number/symbol). Application code references tokens — never hard-coded hex,
px radius, or duration. Review enforces this from M4.

Core palette (dark default):

| Token | Hex | Meaning |
| --- | --- | --- |
| `bg` | `#0B0E12` | App canvas, tile plate |
| `surface` | `#12171E` | Sidebar, panels |
| `raised` | `#191F28` | Cards, menus, active rows |
| `ink` | `#F0F3F7` | Primary text |
| `inkMuted` | `#9AA6B5` | Secondary text |
| `border` | `#394451` | Metallic border, dividers |
| `accent` | `#38BDF8` | Focus ring, active nav, primary action |
| `accentSoft` | `#2DD4BF` | Secondary accent, live status |
| `success` / `warning` / `danger` | `#4ADE80` / `#FBBF24` / `#F87171` | Status only |

Typography: Inter (UI) with `Cascadia Mono`/`JetBrains Mono` for metadata,
shortcuts, element labels and counts. Sizes 11–22px; 13px body; header 52px;
status bar 24px; module tabs 40px.

## Built-in themes (`brand/themes.json`, schema v3)

78 themes in eight families, plus two creator plugins and the generated Custom
tile. Each theme overrides `bg/surface/raised/line/ink/muted/accent/accentSoft`
plus status colours and `onAccent` where needed; spacing, radius, type and motion
stay shared. Every entry also carries `symbol` (two letters), `family`,
`number` (tile position, `0` reserved for Custom) and optional `gradient`,
`glass` and `mono` flags.

| Family | Count | Themes |
| --- | ---: | --- |
| `core` | 6 | Kryvex Dark, Kryvex Light, Midnight, Graphite, OLED Black, High Contrast |
| `spectrum` | 16 | Sunburst, Violet, Lapis Lazuli, Turquoise, Rose Quartz, Ember, Emerald, Amethyst, Obsidian, Crimson, Vermillion, Coral, Rosé, Blush, Magenta, Fuchsia |
| `element` | 21 | Carbon, Neon, Argon, Krypton, Xenon, Radon, Sulfur, Iodine, Chlorine, Nitrogen, Silicon, Strontium, Barium, Potassium, Sodium, Calcium, Cesium, Rubidium, Phosphorus, Zinc, Bismuth |
| `metal` | 7 | Platinum, Titanium, Copper, Gold, Silver, Iron, Quicksilver |
| `gem` | 12 | Garnet, Aquamarine, Diamond, Pearl, Ruby, Peridot, Sapphire, Opal, Topaz, Moonstone, Bloodstone, Tourmaline |
| `planet` | 12 | Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Nibiru, Sun, Moon |
| `light` | 3 | Helium, Lithium, Oxygen |
| `terminal` | 1 | Terminal |

Light-family and light-mode accents are deliberately darker (`#0369A1`,
`#0F766E` in Kryvex Light) so accent text and focus rings keep contrast on
white. High Contrast uses white 1px borders, pure black surfaces and a visible
focus ring. Carbon keeps near-black surfaces with a light-grey graphite edge;
Platinum and Quicksilver set `glass` for an aero-style reflected sheen; Terminal
uses near-black surfaces, phosphor green and `mono` for the whole interface.

The spectrum band carries the reds and pinks: **Crimson** (`#DC143C`),
**Vermillion** (`#E6411B`), Coral, Rosé, Blush, Magenta and Fuchsia. It also
holds **Turquoise**, a pale mint light theme (`#B3ECEC` ground) so the stone
stays bright instead of sinking into a near-black card. Element
entries use their flame-test colours (Strontium crimson, Barium apple green,
Potassium lilac, Sodium amber, Cesium sky blue, Rubidium violet, Phosphorus
glow green), and the `gem` family follows birthstones: deep Garnet, pale
Aquamarine, ice-blue Diamond (light), warm Pearl (light), rich Ruby, lime
Peridot, royal Sapphire, iridescent Opal (dual accent), amber Topaz,
silver-blue Moonstone (light), green Bloodstone with a red danger tone and
pink-to-teal Tourmaline.

The `planet` family is gradient-first: every entry sets `gradient` so buttons,
marks and the tile strip blend two body colours. Jupiter mixes banded cream
(`#E8C08A`) with its Great Red Spot (`#C2452F`), Saturn blends pale gold with
ring silver, Uranus is a pale eerie ice teal (`#8DDDE2` ground, `#3F8E92`
accent), Neptune runs `#477EFD` into `#74D6FD` on a navy `#1F2255` base, Pluto
is a light theme with a brown-red accent, Nibiru keeps a
near-black base (`#050405`) with a faint dark red (`#A8363A`), and Sun blends
solar gold into orange. The metal theme previously named Mercury keeps its
`mercury` id but is now **Quicksilver**, so the planet can carry the plain name.

`applyTheme()` maps the flags onto `data-gradient`, `data-glass` and
`data-terminal` attributes plus `--accent-gradient`, `--shine` and the UI font,
so a theme stays one data object with no per-theme CSS.

## Creator plugins

`src/plugins/donkey.tsx` (gold, hand-drawn donkey) and `src/plugins/xion.tsx`
(near-black glass, electric blue, blade mark) are the two shipped plugins. Each
exports a `Theme` with `plugin: true` and a `mark` hint, plus a descriptor with
`markColor` and `activatedMessage` (kept for provenance; the periodic table
tile now applies the theme directly, so there is no separate activation card).

**Special XiØN Edition** is the full-power skin. Its tokens are `bg #04060A`,
`surface #080C12`, `raised #0E141C`, `line #1D2A36`, `ink #EAF4FB`,
`accent #33B5E5` and `accentSoft #7FE3FF`; `gradient` and `glass` are on so
buttons, marks and the header sheen follow the same pipeline as the rest of the
catalogue. The blade mark is a flat five-polygon glyph traced from the creator's
own logotype and rendered with `currentColor`.

Motion is opt-in CSS scoped to `:root[data-theme='special-xion']`:

- `.xion-mark` runs `xion-glow`, a 5.5s drop-shadow pulse.
- Download, torrent and update fills plus the module loading bar run
  `xion-liquid`, a travelling highlight across an accent-to-accent gradient.
- The brand chip, active nav bar, active theme tile and unread pills gain a
  small accent glow.

All three stop under `prefers-reduced-motion: reduce`. No SVG filter ids are
generated per instance, so the mark can repeat in the header, hero and status
bar without id collisions.

## Custom theme

`buildCustomTheme()` turns five stored colours (`bg`, `surface`, `accent`,
`accentSoft`, `ink`) into a complete palette: `raised`, `line` and `muted` are
mixed with `color-mix`-compatible hex math in `src/lib/color.ts`, and
`readableInk()` picks `--on-accent` by relative luminance. The mode is derived
from the background luminance, so a pale background produces a light theme
automatically. Colours are entered in `src/components/ColorPicker.tsx`
(hue/saturation field, rainbow slider, HEX field and editable R/G/B inputs);
malformed values are rejected by `sanitizeCustomTheme()` rather than shown.

## Theme gallery

The periodic table stays the exhaustive picker. The gallery is the
preview-driven route to the same choice: each family is drawn on a miniature
Kryvex workspace (`ThemePreview` in `src/components/ThemeGallery.tsx`) painted
from that theme's own tokens through `--m-*` variables, so a whole wall of
looks can sit on screen without touching the document theme.

- **First run.** `settings.themeGallerySeen` starts `false` in
  `starterState()`, so a disposable install opens *Choose your look* over the
  shell. Clicking a family card previews its hero without applying anything;
  clicking a theme chip applies it and closes the sheet; **Keep the current
  theme**, the close button and `Esc` dismiss it unchanged.
- **Upgrades.** `sanitizeSettings` reads the flag through
  `themeGallerySeenValue()`, which maps a missing field to `true`. A state file
  written before the gallery therefore never interrupts an existing user.
- **Settings.** The same component renders inline in
  **Settings → Appearance**, directly below the periodic table, with one-click
  apply per theme chip. Nothing about the table changed.
- **Families.** `src/lib/theme-gallery.ts` owns the preview order
  (`GALLERY_FAMILIES`), the hero theme per family (`GALLERY_HEROES`, e.g. Gold
  for metals, Sapphire for gems) and the fallback to the family's first
  catalogue entry. `custom` is excluded because it is a generated palette, and
  plugin themes remain in the table under their own family.
- **Captures.** `runCapture()` dismisses the sheet
  (`[data-shot="gallery-skip"]`) before shooting routes, so screenshots show
  pages rather than onboarding.

The mock is intentionally abstract — rail, header bar, copy lines, two cards, a
primary action and a status strip — so it reads as a workspace at 128px wide
and still shows gradient, glass and mono themes honestly. It sizes to its
content rather than a fixed height: an earlier fixed frame clipped the bottom
of every preview, and `verify:layout` now treats that as a failure. On the
first-run sheet the header and footer are pinned and only the gallery scrolls,
so the skip action survives a 900×600 window.

## Wallpaper

A backdrop can sit behind the whole shell without touching the theme, and it is
opt-in: `settings.wallpaper.enabled` is `false` by default and older saved
profiles are read as off, so the theme alone paints the window until the user
flips the switch in the panel. `source` then chooses **Theme wash**
(`gradient`) or **My image** (`image`); an image source with no file yet falls
back to the wash.

The image is never part of the saved state: the renderer downscales the chosen
file to at most 2560px, re-encodes it as WebP, and stores it in exactly one
place — `userData/wallpaper/wallpaper.<ext>` in Electron
(`electron/wallpaper.ts`) or `kryvex.wallpaper.v1` in localStorage for the web
preview (`src/lib/wallpaper.ts`). Only `settings.wallpaper` is persisted:
`enabled`, `source`, `fit` (`cover` | `contain` | `tile`) and `veil` (0–90,
clamped by `sanitizeWallpaper`).

The wash is defined once as `--wallpaper-wash` on `.app`, built only from
`--accent`, `--accent-soft` and `--bg`. Nothing about it is fixed: switching
theme changes its colour, and there is no rainbow palette baked into the
shell. The panel preview paints the same token through
`.wallpaper-preview.is-wash`.

The main process accepts base64 raster data URLs only, checks the declared type
against the file's magic bytes, caps the payload at 8 MB, rejects SVG and
writes atomically before deleting the previous image.

Rendering is one layered background on `.app`:

```css
.app.has-wallpaper {
  background-image: linear-gradient(var(--wallpaper-veil), var(--wallpaper-veil)),
    var(--wallpaper-image);
}
```

`--wallpaper-veil` is `color-mix(in srgb, var(--bg) <veil>%, transparent)`, so
the veil follows the active theme — light themes wash with light, dark themes
with dark — and every plugin, custom palette and future theme inherits it for
free. Header, sidebar and status bar switch to `color-mix(...)` surfaces with
`backdrop-filter` so the artwork reads through the chrome; panels keep about
94% body for contrast. There is no per-theme wallpaper CSS to maintain.

## Theme Studio requirements (M4)

- Live preview, accent picker, sidebar density, spacing, corner radius, font
  scale, compact mode, reduced motion, focus indicators, transparency where
  the platform supports it.
- Import/export JSON with schema validation (`version`, `mode`, token map);
  reject malformed or unknown keys safely; migrate v1 (Gatherium) files by
  mapping the old surface/ink/accent keys onto v2 names.
- Imported themes are data only — never execute JS, HTML, CSS urls or shell
  from a theme file.
- Contrast checks in light and dark; a 2px focus ring at 2px offset must be
  visible in every theme, including High Contrast.
- Native window chrome follows the theme. Remote service content is **not**
  re-skinned by default — no CSS injection into third-party sites.

## Brand in the interface

- Header uses the `Kx` symbol at 20px, not the full tile.
- Splash/About use the full tile at ≥96px with the tagline.
- Empty, loading and error states may use the tile at ≥64px, never as a
  full-bleed watermark.
- The element designation `x529` is decorative metadata and never carries state or
  version information.

## Icon exports

- Vector masters: `logo.svg` (≥96px), `icon-small.svg` (16–64px),
  `tray.svg` (16–32px), `logo-mono.svg` (≥96px, single color).
- Raster set in `brand/icons/`: full 128/256/512, small 16/24/32/48/64,
  tray 16/32, plus `kryvex.ico` (16/24/32/48/64/128/256).
- Regenerate after any SVG change:
  1. `python3 brand/tools/icon_export.py --port 8903`
  2. open `http://127.0.0.1:8903/_export.html`, run `exportAll()`
  3. `python3 brand/tools/icon_export.py --ico`
  4. Inspect `brand/preview.html` (native sizes and 8× zoom) before shipping.

All exports are RGBA with transparent corners; the plate is opaque.
