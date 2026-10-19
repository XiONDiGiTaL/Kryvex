# Theming (Kryvex Theme Studio — plan of record)

Brand: **Kryvex** — a fictional periodic-table element (number `027`, symbol
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

## Built-in themes (`brand/themes.json`, schema v2)

Kryvex Dark (default), Kryvex Light, Midnight, Graphite, OLED Black, High
Contrast. Each theme overrides `bg/surface/raised/line/ink/muted/accent/
accentSoft` plus status colors; spacing, radius, type and motion stay shared.
Light theme uses darker accents (`#0369A1`, `#0F766E`) so accent text and focus
rings keep contrast on white. High Contrast uses white 1px borders, pure black
surfaces and a visible focus ring.

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
- The element number `027` is decorative metadata and never carries state or
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
