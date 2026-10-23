# Midori Integration Evaluation (A → D)

Reference: `https://github.com/midori-browser/core` (`master`).
Status verified via web review 2026-10-19. No code cloned (evaluation only).

## Findings

- Languages: Vala (`.vala` sources, "Vala-only core" per CHANGELOG); CMake
  declares C because Vala compiles to C. Java/Gradle workflow for Android.
- Engine: WebKitGTK / WebKit2 (`webkit2gtk-4.0` in CMakeLists), GTK+ 3 base.
  Not Gecko, Chromium, or a Midori-written engine.
- Build: CMake + Make/Ninja; needs valac, GTK, WebKitGTK, GLib, etc.
- Platforms: Linux / Android / historical Windows via MinGW cross-compile
  (Fedora-18-era toolchain docs; WebKitGTK noted broken under Wine).
- Maintenance: last `master` commit Oct 12 2019; latest release v9.0
  (Jul 29 2019); 2024 comment notes this version discontinued.
- License: LGPL-2.1 (`COPYING`). Copyleft obligations would attach to
  distribution of the library: kept as reference, not shipped.
- Embedding: a `midori-core` shared-lib target exists (v0.6, SOVERSION 0,
  with VAPI/GIR/typelib/header outputs) plus a `midori` executable, but no
  documented Electron API, no Windows WebView SDK, no IPC/embed interface.

## Option evaluation

- **A (native embeddable component):** FAIL, no supported embeddable
  component for Electron/Windows; GTK/WebKitGTK runtime, UI model, and event
  loop do not map into an Electron window; Windows build docs are obsolete.
- **B (separate Midori-based process, controlled boundary):** FAIL as
  practical default: would require resurrecting a 2019 GTK/WebKitGTK stack
  on modern Windows toolchains plus inventing the lifecycle/IPC bridge.
  Cost disproportionate; security/maintenance burden high.
- **C (separately maintained companion bridge):** DEFERRED, feasible only as
  future work if a maintained Midori runtime appears. Leave a documented seam
  (browser-provider interface) so a companion process could be added later.
- **D (Electron's browser capabilities):** ADOPTED, Chromium webviews with
  isolated partitions/sessions carry the Kryvex browser for now.

## Honesty rule

Kryvex must not claim Midori integration. About page + technical docs will
name the actual engine (Chromium/Electron webview). This file is the proof
of evaluation the directive requires.

Note: `goastian/midori-desktop` (current, Firefox/Gecko-derived) is a
different project and was not evaluated as an embed target; if revisited,
it needs its own A→D pass.
