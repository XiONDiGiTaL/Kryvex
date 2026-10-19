# Third-party attribution

Kryvex is MIT-licensed, but it depends on data and libraries written by other
people. This file records those contributions explicitly. Kryvex claims no
authorship of, affiliation with, or endorsement by any project listed here.

## uBlock Origin filter lists

- **Project:** uBlock Origin — https://github.com/gorhill/uBlock
- **Author:** Raymond Hill and the uBlock Origin contributors
- **License:** GPL-3.0
- **How Kryvex uses it:** Kryvex Shield downloads these public filter lists at
  runtime and feeds them to a native Electron filtering engine:
  - `filters.txt`
  - `privacy.txt`
  - `badware.txt`
- They are cached in the user's application-data directory, not committed to
  this repository and not redistributed inside the installer.
- Kryvex does **not** include uBlock Origin's application code, UI, or
  trademark. The "Kryvex Shield" feature is an independent implementation.

The uBlock Origin Chrome extension is Manifest V2. Its blocking network layer
does not function inside Electron 44 (verified against uBO 1.75.0: the
extension loads, but requests are not cancelled and its dashboard does not
initialize). Kryvex therefore does not ship a dead extension; it uses the
project's filter data natively instead.

## EasyList and EasyPrivacy

- **Projects:** https://easylist.to/ — EasyList and EasyPrivacy
- **License:** GPL-3.0 (list data)
- **How Kryvex uses it:** downloaded at runtime alongside the uBO lists and
  compiled into the same local engine. Not redistributed with the app.

## Ghostery Adblocker

- **Project:** https://github.com/ghostery/adblocker
- **Packages:** `@ghostery/adblocker`, `@ghostery/adblocker-electron`,
  `@ghostery/adblocker-electron-preload`
- **License:** MPL-2.0
- **How Kryvex uses it:** the unmodified npm packages provide the filtering
  engine and Electron `webRequest` adapter. Kryvex adds a small local shim in
  `electron/shield.ts` so one set of cosmetic-filter IPC handlers serves every
  isolated session instead of throwing on the second partition.
- Source for the MPL-2.0 components is available from the package links above
  and inside `node_modules` after installation.

## Simple Icons

- **Project:** https://simpleicons.org / https://github.com/simple-icons/simple-icons
- **License:** CC0-1.0 (icon paths)
- **How Kryvex uses it:** a build-time script extracts the paths for 15 service
  marks into `src/lib/brand-icons.ts`. `simple-icons` itself is a development
  dependency and is not loaded at runtime.
- Brand names and logos are trademarks of their respective owners. They are
  used only to identify the service a module links to. No endorsement is
  implied.

## Chrome and Firefox extensions

Chrome-compatible extensions installed by the user remain the property of their
authors and are governed by their own licenses. Kryvex only loads them into
Electron sessions; it does not audit, modify, or redistribute them. Firefox
`.xpi` add-ons target Gecko and are not installed by Kryvex.

## Runtime stack

Electron, Chromium, Node.js, React, Vite, TypeScript, `extract-zip` and the
transitive npm dependencies retain their own licenses. Their license texts are
included in the packaged application under `node_modules`.

## Special Donkey Edition

The theme tokens, donkey line art, and plugin wiring in `src/plugins/` are
original Kryvex work and are covered by the repository's MIT license.
