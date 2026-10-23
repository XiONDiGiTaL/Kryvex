# Third-party attribution

Kryvex is MIT-licensed, but it depends on data and libraries written by other
people. This file records those dependency notices.

## uBlock Origin filter lists

- **Project:** uBlock Origin, https://github.com/gorhill/uBlock
- **Author:** Raymond Hill and the uBlock Origin contributors
- **License:** GPL-3.0
- **How Kryvex uses it:** Kryvex Shield downloads these public filter lists at
  runtime and feeds them to a native Electron filtering engine:
  - `filters.txt`
  - `privacy.txt`
  - `badware.txt`
- They are cached in the user's application-data directory, not committed to
  this repository and not redistributed inside the installer. The extension
  itself is not bundled; its lists are consumed by the local filter engine.

The uBlock Origin Chrome extension is Manifest V2. Its blocking network layer
does not function inside Electron 44 (verified against uBO 1.75.0: the
extension loads, but requests are not cancelled and its dashboard does not
initialize). Kryvex therefore does not ship a dead extension; it uses the
project's filter data natively instead.

## EasyList, EasyPrivacy and EasyList Cookie

- **Projects:** https://easylist.to/, EasyList and EasyPrivacy; EasyList Cookie
  is the Fanboy Cookie Monster list at https://secure.fanboy.co.nz/
- **License:** GPL-3.0 (list data)
- **How Kryvex uses it:** downloaded at runtime alongside the uBO lists and
  compiled into the same local engine. Not redistributed with the app.
- EasyList Cookie is used to hide many consent banners. Kryvex does not click
  a consent choice on the user's behalf, and it does not claim that hiding a
  banner records a legally valid consent decision.

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

## Demo reel assets

- **Music:** [ende.app](https://ende.app/en), "Happy Beats / Business Moves"
  series, used as the reel's bed.
- **Sound effects:** [Kenney](https://kenney.nl/), CC0.
- **Inter typeface:** https://rsms.me/inter/, SIL Open Font License 1.1,
  bundled as a variable WOFF2 for the reel.

## llama.cpp and ggml

- **Project:** llama.cpp, https://github.com/ggml-org/llama.cpp
- **Authors:** The ggml authors and the llama.cpp contributors
- **License:** MIT. The Windows CPU build also carries the LLVM OpenMP runtime
  under the Apache License 2.0 with LLVM Exceptions.
- **How Kryvex uses it:** release `b11835` (commit `f64a49819`), asset
  `llama-b11835-bin-win-cpu-x64.zip`, SHA-256
  `256e606f93b7f7dfb440e8d78bdbac34184c3b45ae4defead4e072a84afe63e4`
  (arm64: `llama-b11835-bin-win-cpu-arm64.zip`, SHA-256
  `3e3695e4004d5e1d8d0d142e6e665172503e03c15df32f26b7442dc36a498011`).
  `scripts/fetch-runtime.mjs` downloads that pinned asset at package time,
  verifies its size and digest, and extracts only `llama-server` and the DLLs it
  loads into `runtime/bin`. Electron Builder copies them to `resources/bin`
  inside the installed app.
- **What is not bundled:** model weights. The user downloads a GGUF separately
  from the reviewed catalogue or supplies one they already have.
- The llama.cpp MIT text and the OpenMP license ship beside the binaries as
  `LICENSE-llama.cpp` and `LICENSE-LLVM-OpenMP`. Kryvex does not modify the
  binaries, and no llama.cpp trademark or endorsement is claimed.

## Runtime stack

Electron, Chromium, Node.js, React, Vite, TypeScript and the transitive npm
dependencies retain their own licenses. Their license texts are
included in the packaged application under `node_modules`.

## Special Donkey Edition

The theme tokens, donkey line art, and plugin wiring in `src/plugins/` are
covered by the repository's MIT license.

## Special XiØN Edition

The XiØN logotype is the project creator's own mark, supplied for this theme and
redrawn as five flat SVG polygons in `src/plugins/xion.tsx`. The theme tokens,
glow and liquid-progress styling are covered by the same MIT license.
