# KRYVEX — Brand Specification

**Product:** Kryvex (app: Kryvex Desktop) · **Mark:** Kx · **Abbreviation:** Krx
**Tagline:** Precision in Every Connection.
**Design philosophy:** industrial precision meets futuristic minimalism.
**Positioning:** a modular desktop environment that brings independent tools,
services and workflows into one engineered surface.

Kryvex is named after a fictional engineered element: a stable substrate that
binds other materials without changing them. The identity therefore treats the
product as an element on a periodic table of software — one tile in a larger
system — rather than as a dashboard or a launcher. The tile is the brand.

> **Fictional element notice.** Element designation **x529**, symbol **Kx**,
> and the name Kryvex are branding inventions. `x529` is not a real atomic
> number, and Kx is not an assigned chemical symbol. Never present Kryvex as
> a real element or as a scientific product.

## 1. The tile

Every asset derives from one 512×512 tile:

| Region | Content | Notes |
| --- | --- | --- |
| Plate | `#0B0E12` near-black graphite, radius 86/512 (17%), 6-unit `#394451` border | Flat fill; a 1-unit inner hairline at 35% adds machined edge without gradient |
| Top left | `x529` in mono, `#38BDF8` | The only element designation used in the identity |
| Top right | Three 10-unit signal squares, `#2DD4BF` at 35/60/100% | "Connected systems" motif; omitted below 64px |
| Center | `Kx` constructed from 26-unit round-capped strokes, `#F0F3F7` | Drawn, not typed — no font dependency, identical on every OS |
| Divider | 64×4 accent rule, `#38BDF8` | Separates symbol from name, like a table row rule |
| Name | `KRYVEX`, 30/512, weight 600, tracking 9, `#38BDF8` | Omitted below 64px |
| Micro-label | `MODULAR TECHNOLOGY`, 11/512 mono, tracking 5, `#9AA6B5` | Omitted below 128px |

**Why `Kx` and not `Kr`.** `Kr` is the real symbol for krypton and would read as
a chemistry reference rather than a brand; `Kx` is unassigned, has two sharp
diagonals that survive 16px, and stays distinct from the `KR` in the candidate
mockups. `Krx` remains the spoken/written abbreviation; `Kx` is the symbol.

**Why `x529`.** The tile keeps a short alphanumeric designation in the
atomic-number slot, preserving the periodic-table grammar without pretending to
be a real element. `x529` is fictional and constant — do not renumber it per
release, module, or theme.

## 2. Variants and minimum sizes

| Asset | Use | Minimum |
| --- | --- | --- |
| `logo.svg` | Full tile: installer, about screen, docs, marketing | 96px (wordmark needs the room) |
| `icon-small.svg` | App icon 16–64px, taskbar, alt-tab | 16px |
| `tray.svg` | System tray, transparent background, white only | 16px |
| `logo-mono.svg` | Single-color print, embroidery, one-color surfaces | 96px |
| `icons/*.png`, `icons/kryvex.ico` | Windows shell, shortcuts, store listings | 16px |

At 16px the icon keeps only the plate and `Kx`; strokes are 48/512 (~1.5px)
so the symbol does not dissolve. Never scale the full logo down to 16px — use
`icon-small.svg`. Rendered checks: the 16px export was reviewed at 8× zoom
and the `Kx` remains readable as a single mark.

**Clear space:** one quarter of the tile height on all sides, minimum. The
plate edge is part of the mark; do not crop it, and do not place the tile on a
busy photo without a solid `#0B0E12` field behind it.

## 3. Color

| Token | Hex | Role |
| --- | --- | --- |
| `bg` | `#0B0E12` | App background, tile plate |
| `surface` | `#12171E` | Sidebar, panels |
| `raised` | `#191F28` | Cards, popovers, active rows |
| `ink` | `#F0F3F7` | Primary text, symbol |
| `inkMuted` | `#9AA6B5` | Secondary text, micro-label |
| `border` | `#394451` | Metallic borders, dividers |
| `accent` | `#38BDF8` | Focus, active nav, primary action, element number |
| `accentSoft` | `#2DD4BF` | Secondary accent, status, connected-systems motif |
| `success` / `warning` / `danger` | `#4ADE80` / `#FBBF24` / `#F87171` | Status only |

Rules: the interface stays neutral; accents mark focus, selection, live status
and primary actions — never decoration. Text uses `ink` or `inkMuted`; accent
text is reserved for links and active labels (contrast on `#0B0E12` is 8.4:1
for `#38BDF8`, 10.7:1 for `#2DD4BF`). Light theme swaps to darker accent
variants (`#0369A1`, `#0F766E`) so contrast holds on white. Every color is a
token in `tokens.json`; no hard-coded hex in application code.

## 4. Typography

- Interface: **Inter** (fallback `Segoe UI Variable Text`, `Segoe UI`,
  `system-ui`). Weights 400/500/600. Sizes 11–22px, line height 1.25 tight /
  1.5 body.
- Technical metadata: **Cascadia Mono** or **JetBrains Mono** (fallback
  `Consolas`, `ui-monospace`). Reserved for shortcuts, versions, element
  numbers, status chips, counts, and table labels.
- Labels use uppercase mono with 0.08–0.12em tracking. Body text never uses
  uppercase tracking.

Density target: 13px body, 52px header, 24px status bar, 40px module tabs.
Prefer hairline borders and spacing over shadows; shadows appear only on
floating layers (menus, dialogs, command palette).

## 5. Applying the identity to the app shell

- **Header (52px):** small `Kx` glyph (not the full tile) at left, workspace
  name, centered command field with `Ctrl K`, right-side sync/status dot.
- **Sidebar:** Home, Workspaces, Browser, Modules, Favorites, Recent,
  Downloads, Settings. 56px icon rail expanded to 248px; active row uses
  `raised` fill plus 2px accent bar on the leading edge, never accent fill
  behind body text.
- **Workspace:** neutral `bg`; module content is framed by a 1px `border`
  line, 10px radius. The tile appears in loading and empty states, at ≥64px,
  not as a watermark behind content.
- **Module tabs (40px):** mono tab titles, favicon-sized module glyph, active
  tab underline in `accent`.
- **Status bar (24px):** mono 11px, connection state dot (`success` /
  `warning` / `danger`), element-style separators (`·`).
- **Focus:** 2px `focus` ring at 2px offset, visible on every interactive
  element in every theme, including High Contrast.

Do not reintroduce gradients on buttons, glassmorphism panels, oversized
rounded cards, glow behind text, or atom-orbit illustrations. The tile is the
only place the element metaphor appears.

## 6. Themes

Six built-in themes live in `themes.json` (schema v2): Kryvex Dark (default),
Kryvex Light, Midnight, Graphite, OLED Black, High Contrast. Themes override
surface/ink/accent tokens only; spacing, radius, type and motion stay shared.
Custom themes are data — never executable content. See `docs/THEMING.md`.

## 7. Imagery and voice

- Screenshots are shot in Kryvex Dark with real module content; no mockups
  passed off as product.
- Copy is short, technical, declarative. Tagline appears in full only on the
  splash/about screen and docs cover — not repeated in the UI chrome.
- Never claim an integration works before it does; planned features are
  labelled planned in docs and disabled in the UI.

## 8. Asset manifest

```
brand/
  BRAND.md          this specification
  logo.svg          primary tile (512)
  logo-mono.svg     single-color (currentColor)
  icon-small.svg    16–48px tile
  tray.svg          white tray icon, transparent
  tokens.json       design tokens (source of truth)
  themes.json       six themes, schema v2
  preview.html      visual QA sheet (also the raster QA sheet)
  preview.png       QA capture of the sheet (1280×1000)
  _export.html      Chromium canvas renderer used for raster export
  icons/            kryvex-{128,256,512}.png, kryvex-small-{16,24,32,48,64}.png,
                    kryvex-tray-{16,32}.png, kryvex.ico (7 resolutions)
  tools/icon_export.py  local writer server + ICO composer
```

Raster regeneration: `python3 brand/tools/icon_export.py --port 8903`, open
`http://127.0.0.1:8903/_export.html`, run `exportAll()` in the console, then
`python3 brand/tools/icon_export.py --ico`.

## 9. Limitations

Raster exports are rendered from these SVGs through Chromium at integer sizes;
the wordmark/micro-label use a font stack, so production marketing art should
outline the type before sending to print. Name clearance for "Kryvex" is
research-grade and currently **high risk** (an existing KRYVEX AI platform,
a KRYVEX password-vault project, and ~38 GitHub repos) — see
`docs/ENGINEERING_DECISIONS.md` ED-002 before any public launch.
