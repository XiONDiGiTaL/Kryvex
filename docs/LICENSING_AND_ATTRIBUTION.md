# Licensing & Attribution

## Upstream (verified)

- Ferdium app: Apache-2.0 (`LICENSE.md`, `package.json` line 9).
  Fork keeps the license text, NOTICE/attribution, and copyright notices;
  new Kryvex files carry their own headers without removing upstream notices.
- Recipes submodule (`ferdium/ferdium-recipes`): separate repo — check its
  license file when initializing; retain per-recipe notices.
- Midori `core` reference: LGPL-2.1 — not shipped with Kryvex; if any LGPL
  code were ever vendored, comply (source offer, library boundary). Current
  posture: reference only, no obligation triggered.

## Kryvex duties (before publication)

- [ ] Choose Kryvex license (Apache-2.0 compatible recommended) + write
  `LICENSE`/`NOTICE` with upstream attribution section.
- [ ] Generate third-party inventory from lockfile (names/versions/licenses).
- [ ] Keep Ferdium name/logo/screenshots out of product; attribution wording
  factual ("derived from Ferdium, Apache-2.0, © Ferdium Contributors").
- [ ] Icon/font/media licenses: vector icon family with documented license;
  no emoji-as-icons; no unlicensed assets.
- [ ] No "official support" claims for third-party services.
