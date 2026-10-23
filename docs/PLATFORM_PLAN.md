# Platform plan — compounds, assistants and the ideas around them

This is a triage of the larger wishlist: BetterDiscord-style client injection,
Ferdium-like services, an in-house assistant with periodic-table branding,
local model runners, bundled AI sites, a retro emulator and a legal pack. Each
entry says what Kryvex should adopt, adapt, defer or refuse, and why.

The rule behind every decision: Kryvex stays a shell the user owns. It does not
patch other companies' clients, it does not ship code it cannot sign and
update, and it does not pretend a feature is safe because it is convenient.

## 1. Service engine (adopted)

The core of the request — a Discord-like app instead of a browser page — is
shipped as the service engine described in [SERVICES.md](SERVICES.md):
persistent partitions, keep-alive frames, a browser user agent, native
notifications, unread badges, auth popups and per-service session clearing.

Ferdium, Caprine and `whatsapp-web.js` were read for ideas, not copied. The
useful patterns are a service recipe (URL plus quirks), one long-lived guest
per service, and a notification bridge. The parts not adopted are the ones that
need a custom client per service: Kryvex deliberately stays generic so a
service can change its web client without a Kryvex release.

`whatsapp-web.js` and other unofficial clients automate WhatsApp through a
linked-device session. That is out of scope: it violates the service's terms in
spirit, can get a number banned, and adds a Puppeteer-sized dependency. Kryvex
uses `web.whatsapp.com` like a browser would.

## 2. BetterDiscord, AyuGram and client mods (refused)

Bundling BetterDiscord would mean injecting third-party code into an
authenticated Discord session, against Discord's terms, with the user's account
as the collateral. It also creates a permanent compatibility treadmill: every
Discord client update can break the injected bundle, and Kryvex would have to
ship an updater that patches a site it does not control. The same reasoning
applies to AyuGram-style patched Telegram clients: those are separate
applications with their own build and signing pipeline, not modules Kryvex can
adopt.

What Kryvex does instead:

- supports Chrome-compatible extensions through Electron's extension loader,
  for users who want a specific tool and accept that it executes third-party
  code;
- keeps service frames hardened, so a page cannot reach Node or the shell even
  if it is compromised;
- will host its own **compounds** (below) with a signed, first-party capability
  model rather than monkey-patching someone else's client.

## 3. Compounds — the periodic-table add-on system (designed, not built)

The user-facing idea is good: optional modules with an element-style identity
that extend Kryvex itself. The implementation must avoid turning "install from
GitHub" into remote code execution with full app privileges.

Proposed model:

| Layer | Rule |
| --- | --- |
| Identity | Short symbol (`VX`, `NX`), atomic number, name and accent colour, rendered in the existing tile language |
| Package | JSON manifest plus bundled JS, no network code at install time |
| Integrity | SHA-256 in a signed manifest; Kryvex ships the public key, not the packages |
| Permissions | Declared per compound: which Kryvex APIs it may call, which origins it may reach, whether it sees service metadata (never page content) |
| UI | Its own view or panel, mounted by the shell; no access to the DOM of a service guest |
| Install | Explicit click, permission sheet, stored in `userData/compounds/`; update and remove are first-class |
| Offline | A compound must work with no network unless it declares a network permission |

Candidate compounds, in build order:

1. **Vexium (VX, 078)** — an in-house assistant surface. Chat history, local
   notes, prompt library and a tool palette. Talks to *user-configured*
   endpoints only.
2. **Nexion (NX, 042)** — planner, scheduler and focus timer with local
   reminders and calendar export (`.ics`). No account.
3. **Matronix (MN, 086)** — workspace automation: open a set of services, set a
   theme, run a checklist. Deterministic macros, no page automation.
4. **Aetheron (AE, 119)** — knowledge index over the user's own notes and
   bookmarks, with local embeddings if a local model is configured.
5. **Omnexis (OM, 064)** — the compound manager and diagnostics view.

Aetheron and Omnexis are deliberately later: they need the manifest and
permission model to exist first. Shipping five branded tiles before the
permission model would be branding without a product.

## 4. AI assistants (adopted as services, not bundled clients)

ChatGPT, Claude, Gemini, Copilot, Perplexity, Hugging Face and Freebuff are
presets that open the public web client in a persistent module. That gives
users the real product, with its own features and updates, without Kryvex
shipping an API key, a proxy or a copy of someone else's UI.

The in-house assistant is different: it should not re-implement a chat client.
Its value is being *inside* Kryvex — aware of the user's workspace, able to open
a service, start a focus session, search local notes and hand a task to a model
the user chose. That is a compound with a narrow tool API, not a clone.

## 5. Local models (deferred, with a clear path)

Bundling weights would add gigabytes and a GPU compatibility matrix to a
~115 MB app. The lightweight path is to detect a local runtime the user already
has:

- LM Studio and Ollama expose an OpenAI-compatible HTTP server on loopback;
- a compound may call `http://127.0.0.1:<port>` only after the user enters the
  port in its settings;
- model listing, chat and embeddings use that endpoint;
- no model files, no telemetry, no cloud fallback unless a key is added.

This keeps Kryvex's download honest and makes "download local models" a link to
LM Studio/Ollama rather than a second package manager.

## 6. Popups and untrusted sites (adopted, tightened)

Popup policy is now deliberate rather than uniform:

- A service module may open an http(s) window. It inherits the service session,
  is sandboxed, cannot leave http(s), and cannot stack further app windows.
- A browser tab may not open a background pop-under. Foreground links still
  hand off to the system browser, so "open in new tab" keeps working.
- The Kryvex shell never opens an in-app window; links leave for the system
  browser.
- Any window created from an auth popup is externalised immediately.

This is the useful half of "make Google sign-in work but block movie-site
popups": the trusted surface (an installed service) gets a real window, while
throwaway browsing gets the least authority that still works.

Dialog boxes (`alert`, `confirm`) are not suppressed, because breaking a site's
own confirmation flow is worse than the annoyance. They never run with Kryvex
privileges.

## 7. Retro emulator (deferred, gated)

An 8-bit panel is a good easter egg and a bad default dependency. Shipping
RetroArch means a second native runtime, per-core licences, controller mapping
and a build matrix; shipping ROMs is not on the table at all.

If it is built, the honest shape is:

- a hidden compound, unlocked only after an explicit disclaimer that Kryvex
  does not condone piracy and ships no games;
- a WASM NES core loaded lazily (a few hundred KB), not a bundled emulator;
- the user picks a `.nes` file from their own disk; nothing is downloaded,
  indexed or shared;
- save states stay in `userData/`, and the panel is offline-only;
- no SNES/N64 claim until a core of that size is actually tested.

Until then, the easter-egg slot stays empty rather than promising a console
Kryvex cannot legally or technically support.

## 8. Legal and policy pack (adopted as documents)

The checklist maps to Kryvex like this:

| Requested item | Status in Kryvex |
| --- | --- |
| Privacy policy | Written in [LEGAL.md](LEGAL.md); the app has no account, telemetry or sync |
| Terms of service | Written; as-is software, acceptable use, third-party services remain theirs |
| Refund policy | Not applicable: Kryvex sells nothing and has no checkout |
| Cookie policy | No first-party cookies; installed sites keep their own cookies in their own partition |
| Cookie consent banner | Not needed for first-party cookies; the shield already hides many third-party banners. A fake banner would be dark-pattern theatre |
| Form consents | No forms collect data. The only prompts are media permission and session clearing |
| No unnecessary data collection | State is a local JSON file plus per-service Chromium partitions |
| Audit third-party SDKs | Runtime dependencies are Electron, React, Ghostery's blocker and WebTorrent; extension packages are unpacked by an in-house reader; no analytics SDK |
| Remove dark patterns | No fake urgency, no pre-checked marketing, no hidden toggles |
| Remove hidden fees / fake reviews / unsupported claims | No commerce, no reviews, no benchmark claims |
| Accessibility: alt text, contrast, keyboard | Icons are decorative or labelled; themes are contrast-checked; every action has a keyboard path |
| Business details | A placeholder in LEGAL.md that the distributor must fill before publishing |
| Age consent | No account and no data collection; the app is not directed at children |
| Unsubscribe link | Not applicable: Kryvex sends no email |
| Licence fonts/images | App MIT, icons CC0 Simple Icons, system fonts only |
| Data deletion | Reset workspace, per-service session clear, and deleting the profile folder |

The legal text is a starting point for the distributor, not legal advice.

## 9. Deliberately not doing

- Injecting BetterDiscord, Vencord, AyuGram or any patched client.
- Shipping unofficial WhatsApp/Telegram automation.
- Bundling model weights or an emulator core in the base installer.
- Adding a cookie banner for cookies Kryvex does not set.
- Fetching executable add-ons from arbitrary URLs without a signature.
- Reading service page content for "smart" features. Titles are the only page
  signal, and only for a count the page already publishes.

## 10. Order of work

1. ~~Service engine, notifications, popups, presets~~ (this build).
2. Compound manifest, signing key, permission sheet and installer.
3. ~~Vexium assistant shell~~ shipped: `#/assistant`, loopback runtime
   settings, streamed chat. The Nexion planner is still a design.
4. ~~Local-runtime settings (Ollama/LM Studio loopback) inside Vexium~~
   shipped in the same pass, with the address rule enforced in the main
   process (see [ASSISTANT.md](ASSISTANT.md)).
5. In-app legal viewer and a one-click "delete all local data" flow.
6. Optional emulator compound behind the disclaimer.

## 11. Android (deferred, with a path)

A direct APK port of the Electron build is not possible. Electron 44 has no
Android runtime, and the parts that make Kryvex a workspace are exactly the
parts Android cannot reuse: the main process, the preload bridge, `<webview>`
partitions, the filesystem and torrent runtime, the OpenVPN child process and
the local-model runner. A WebView around `dist/` would boot the shell, but the
service and browser routes would show their own "available in the Electron app"
fallbacks; it would not be Kryvex.

A real mobile client is a separate build with a smaller native core:

- **Phase 1 — service launcher.** A Kotlin app (minSdk 26, targetSdk 35) with a
  home grid, add/edit service, and one active WebView per service. Use AndroidX
  WebKit's `WebViewAssetLoader` for the local shell, `CookieManager` with
  `flush()` for persistence, Chrome Custom Tabs for OAuth that a service refuses
  to frame, and `DownloadManager` for downloads. Keep the desktop's URL, colour
  and catalogue rules in a shared JSON file so the two clients do not drift.
- **Phase 2 — session model.** Android's WebView cookie jar is shared across
  WebViews in one process. True per-service isolation needs a separate process
  or a separate profile per service, and that choice must be made before the UI
  promises isolation. This is the hardest parity gap, not the styling.
- **Phase 3 — shell features.** Request interception for the Shield, a
  user-configured OpenAI-compatible client for Vexium (Android would need an
  explicit LAN address, not the desktop's loopback-only rule), EmulatorJS in a
  WebView for the optional emulator, `VpnService` with a native OpenVPN engine
  (Android 10+ will not execute the desktop's user-supplied binary), and a
  smaller Home board built from Android's own battery, network and storage
  APIs. Rooms and WebTorrent stay desktop-only until their native transports
  are designed.

The reusable renderer pieces are the React components and styles, the catalogue,
the store sanitisers, i18n and the one-time-code field detection. The Electron
main process is not reusable.

Status: **no APK has been produced.** This machine has JDK 19, `adb` and no
Android SDK or attached device (`adb devices` is empty), and `android.jar` is
absent. A build needs Android SDK 35, build-tools and a device or emulator to
verify the WebView and cookie behaviour; a successful Gradle build alone would
not prove a service can sign in. The next concrete step is a `mobile/android`
Phase 1 project and a CI job that uploads a debug APK, followed by a real device
pass on the S23 Ultra.
