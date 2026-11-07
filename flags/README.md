# Bundled flags

The server-origin chip names the country a site is served from, and draws it from
these files. They are bundled rather than fetched so the chip works offline and
does not tell a third party which countries the user visits.

- Source: [`flag-icons`](https://github.com/lipis/flag-icons) 7.6.0, `flags/4x3`,
  released under the MIT licence in `LICENSE`. Whitespace is collapsed so each
  file stays a single line; the artwork itself is untouched.
- File names are lower-case ISO 3166-1 alpha-2 codes. The chip asks for
  `flags/<code>.svg` and falls back to an empty frame when a code has no file.

Flags are in the public domain in most jurisdictions; the licence above covers
the packaging. Do not hand-edit the artwork: replace it by re-copying the
upstream file so the shapes stay recognisable.
