# Third-party attribution

## Disk cleanup reference projects

Disk pulse was designed after reviewing three open projects. Their code was
not incorporated, because only one of the three licences permits it:

- **Cleanmgr+** — https://github.com/builtbybel/CleanmgrPlus — custom EULA that
  forbids modification and derivative works. No code or text was adapted.
- **CleanManager** — https://github.com/patrickleehua/CleanManager — MIT,
  Copyright (c) 2026 patrickleehua. Its category checklist and
  see-before-you-delete flow informed the UI; no source files were copied.
- **SquirrelDisk** — https://github.com/adileo/squirreldisk — AGPL-3.0.
  Its analyzer presentation informed the concept only; incorporating AGPL code
  would relicense Kryvex, so none was used.

Kryvex's implementation is independent: the scanner, rules and cleaner are
written for this app and covered by Kryvex's own tests.


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

## EasyList, EasyPrivacy and EasyList Cookie

- **Projects:** https://easylist.to/ — EasyList and EasyPrivacy; EasyList Cookie
  is the Fanboy Cookie Monster list at https://secure.fanboy.co.nz/
- **License:** GPL-3.0 (list data)
- **How Kryvex uses it:** downloaded at runtime alongside the uBO lists and
  compiled into the same local engine. Not redistributed with the app.
- EasyList Cookie is used to hide many consent banners. Kryvex does not click
  a consent choice on the user's behalf, and it does not claim that hiding a
  banner records a legally valid consent decision.

## Brave Browser and Brave Core

- **Projects:** https://github.com/brave/brave-browser and
  https://github.com/brave/brave-core
- **License:** MPL-2.0
- **How Kryvex uses it:** Brave is a feature reference for HTTPS upgrades,
  tracking-parameter stripping, fingerprint farbling and consent-banner
  filtering. Kryvex does **not** copy Brave source code or ship a Chromium
  fork. The Electron-native implementations live in
  `electron/brave-rules.ts`, `electron/web-privacy.ts` and
  `electron/farbling-preload.ts`; they are smaller, independent approximations.
- Brave's documentation and wiki were consulted for behaviour and
  compatibility notes. No Brave trademark or branding is used, and no
  affiliation or endorsement is implied.

## Ghostery Adblocker

- **Project:** https://github.com/ghostery/adblocker
- **Packages:** `@ghostery/adblocker`, `@ghostery/adblocker-electron`,
  `@ghostery/adblocker-electron-preload`
- **License:** MPL-2.0
- **How Kryvex uses it:** the unmodified npm packages provide the filtering
  engine and Electron `webRequest` adapter. Kryvex adds a small local shim in
  `electron/shield.ts` so one set of cosmetic-filter IPC handlers serves every
  isolated session instead of throwing on the second partition, and installs a
  combined privacy listener in `electron/web-privacy.ts` because Electron keeps
  only one `onBeforeRequest` handler per session.
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

## Demo reel tooling and assets

- **Skill:** `/brag` — https://github.com/latent-spaces/brag
  - **Author:** Shunit Haviv Hakimi
  - **License:** MIT. The skill is a local agent workflow and is not
    redistributed with this repository.
  - **How Kryvex uses it:** the skill is installed for agent-driven launch-video
    work and produced the reel published at `docs/media/kryvex-demo.mp4`. It is
    not loaded by the app at runtime.
- **Video framework:** HyperFrames — https://github.com/heygen-com/hyperframes
  - **License:** Apache-2.0
  - **How Kryvex uses it:** local rendering of the HTML composition. The
    composition is a working project kept outside the repository; only the
    rendered reel is published. Not a runtime dependency of the app.
- **Music:** [ende.app](https://ende.app/en), "Happy Beats / Business Moves"
  series, bundled by the `/brag` skill and used as the reel's bed.
- **Sound effects:** [Kenney](https://kenney.nl/), CC0, bundled by `/brag`.
- **Inter typeface:** https://rsms.me/inter/, SIL Open Font License 1.1,
  bundled as a variable WOFF2 for the reel.

## Runtime stack

Electron, Chromium, Node.js, React, Vite, TypeScript and the transitive npm
dependencies retain their own licenses. Their license texts are
included in the packaged application under `node_modules`.

## Special Donkey Edition

The theme tokens, donkey line art, and plugin wiring in `src/plugins/` are
original Kryvex work and are covered by the repository's MIT license.

## Special XiØN Edition

The XiØN logotype is the project creator's own mark, supplied for this theme and
redrawn as five flat SVG polygons in `src/plugins/xion.tsx`. The theme tokens,
glow and liquid-progress styling are original Kryvex work under the same MIT
license. No third-party logo, font or artwork is bundled for it.
