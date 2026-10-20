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

37 themes in six families, plus the plugin theme and the generated Custom tile.
Each theme overrides `bg/surface/raised/line/ink/muted/accent/accentSoft` plus
status colours and `onAccent` where needed; spacing, radius, type and motion
stay shared. Every entry also carries `symbol` (two letters), `family`,
`number` (tile position, `0` reserved for Custom) and optional `gradient`,
`glass` and `mono` flags.

| Family | Count | Themes |
| --- | ---: | --- |
| `core` | 6 | Kryvex Dark, Kryvex Light, Midnight, Graphite, OLED Black, High Contrast |
| `spectrum` | 9 | Sunburst, Violet, Lapis Lazuli, Turquoise, Rose Quartz, Ember, Emerald, Amethyst, Obsidian |
| `element` | 11 | Carbon, Neon, Argon, Krypton, Xenon, Radon, Sulfur, Iodine, Chlorine, Nitrogen, Silicon |
| `metal` | 7 | Platinum, Titanium, Copper, Gold, Silver, Iron, Mercury |
| `light` | 3 | Helium, Lithium, Oxygen |
| `terminal` | 1 | Terminal |

Light-family and light-mode accents are deliberately darker (`#0369A1`,
`#0F766E` in Kryvex Light) so accent text and focus rings keep contrast on
white. High Contrast uses white 1px borders, pure black surfaces and a visible
focus ring. Carbon keeps near-black surfaces with a light-grey graphite edge;
Platinum and Mercury set `glass` for an aero-style reflected sheen; Terminal
uses near-black surfaces, phosphor green and `mono` for the whole interface.

`applyTheme()` maps the flags onto `data-gradient`, `data-glass` and
`data-terminal` attributes plus `--accent-gradient`, `--shine` and the UI font,
so a theme stays one data object with no per-theme CSS.

## Custom theme

`buildCustomTheme()` turns five stored colours (`bg`, `surface`, `accent`,
`accentSoft`, `ink`) into a complete palette: `raised`, `line` and `muted` are
mixed with `color-mix`-compatible hex math in `src/lib/color.ts`, and
`readableInk()` picks `--on-accent` by relative luminance. The mode is derived
from the background luminance, so a pale background produces a light theme
automatically. Colours are entered in `src/components/ColorPicker.tsx`
(hue/saturation field, rainbow slider, HEX field and editable R/G/B inputs);
malformed values are rejected by `sanitizeCustomTheme()` rather than shown.

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
