# Services as apps

Kryvex treats an installed service as an app window, not a bookmark. This
document describes the engine behind that behavior, what it guarantees, and
where its limits are.

## The short version

- An opened service is mounted once and **stays running** for the app session.
  Switching to Home, the Browser or Settings parks the frame with opacity, not
  `display: none`, so Chromium still treats the page as visible; it does not
  destroy the guest. Audio and the dock keep working in another view. See
  [SERVICE_UX.md](SERVICE_UX.md).
- Each service owns a persistent Chromium partition, `persist:svc-<id>`.
  Cookies, localStorage, IndexedDB, service workers and caches live there and
  survive restarts.
- Installed services may display native desktop notifications. Throwaway
  browser tabs may not.
- Sign-in popups open in a sandboxed child window on the **same** service
  session, so OAuth and passkey flows can finish and report back to the opener.
- A page title such as `(3) Discord` becomes an unread badge in the toolbar and
  sidebar, plus `(3)` in the window title. No page content is read.
- The lock button in the service toolbar clears that service's cookies and
  storage after an explicit confirmation; nothing else is touched.

## Why the old behavior logged people out

Three separate faults could end a session:

1. **Attribute order.** Electron requires a webview's `partition` to be set
   before `src`. The renderer passed them through React, which does not promise
   attribute order; a guest that loaded first was bound to the default
   in-memory session. The partition attribute is now set imperatively before
   the source, and re-asserted on `dom-ready`.
2. **Unmounting on navigation.** Leaving a service destroyed the webview.
   Reopening rebuilt it from scratch: a chat client re-ran bootstrap, dropped
   its gateway connection and could treat its stored token as stale. Service
   frames are now kept mounted and hidden instead of destroyed.
3. **An Electron user agent.** Electron's default agent advertises
   `Electron/44`, which several web clients classify as an unsupported browser.
   At launch Kryvex sets a browser-shaped fallback that reports the bundled
   Chromium version and nothing else. It is stable for the whole session,
   because a changing agent is itself a fingerprint.

## Session model

| Surface | Partition | Lifetime |
| --- | --- | --- |
| Service module | `persist:svc-<id>` | Until the service is cleared, or the profile is removed |
| Browser tab | `browser-<random>` | In-memory; discarded when the tab or app closes |

`will-attach-webview` accepts only those two shapes, deletes any page-supplied
preload, and forces Node off, context isolation and sandbox on. A service frame
is capped at eight simultaneously mounted modules, most recently used first;
evicting a frame unloads it but never clears its partition.

Removing a module from the registry also leaves its partition on disk. Signing
out has to be a deliberate act, so it lives behind the toolbar lock button and
a confirmation dialog.

## Notifications

`electron/service-sessions.ts` records the session of every webview attached to
a `persist:svc-*` partition. The permission broker grants `notifications` only
to those sessions, and only while **Settings → Service apps → Desktop
notifications** is on. Browser-tab sessions stay denied, so a random page
cannot raise an OS toast.

Notification clicks are handled by Chromium; `Notification.handleActivation`
also brings Kryvex forward when the click arrives from the Action Center or
starts the app. Unread counts are separate and come from the page title, not
from the notification payload: Kryvex never inspects message content.

The packaged app owns the `net.xiondigital.kryvex` AppUserModelID, matching the
installer's Start Menu shortcut. A source run uses
`net.xiondigital.kryvex.dev` instead. Electron names its unpackaged shortcut
`Electron.lnk` and points it at the bare executable, so sharing the packaged ID
made Windows attribute installed toasts to that shortcut and open Electron's
welcome page on click. The separate ID keeps the installed shortcut as the only
owner of the packaged identity.

A hidden frame still runs because its webview sets `backgroundThrottling=no`.
That keeps the gateway, timers, audio and calls alive while the user is in
another view.

## Sign-in popups

A window opened by a service guest is allowed when all of these hold:

- the opener is a webview,
- its session is a recorded service partition,
- the target is http(s).

The child inherits the service session, runs sandboxed with context isolation
and no Node, cannot navigate to non-http(s), and any window it opens is sent to
the system browser instead of stacking more app windows. Popups opened by the
Kryvex shell or by a browser tab are still externalised.

This is what makes "Sign in with Google/Microsoft/Apple" work inside a module.
If a provider insists on a native app handoff, use **Open externally**; the
module's own session is not transferred.

### A Google service signs itself in without leaving the module

Google's products sign in with cookies, not with an opener handshake. When a
Google page inside a module opens Google's account pages, the module's own frame
navigates there instead of a window being created: the account pages render in
the service stage, the sign-in completes, and Google redirects back to the
product in that same frame. A popup would have signed the user in and then shown
Gmail in a stray window while the module itself stayed on its signed-out page —
which is exactly what happened before `electron/service-signin.ts`.

Other providers keep the real popup, because they answer through
`window.opener`, but their result is folded back rather than left in a window:

- the popup's starting point is anchored when it opens, not read while it
  navigates. Google sends the *module* to `accounts.google.com` mid-flow, so the
  live URL is the account host by the time the popup returns; comparing against
  it would never recognise the product page. An account URL is anchored through
  its `continue` target instead;
- a popup that left the module's site and came back closes, and its page loads
  in the module. A popup that never left (a compose window, an attachment
  preview) keeps its own window;
- whenever a popup closes without folding, the module is reconciled: its last
  page when that page belongs in the module, otherwise a reload when the popup
  touched an account page or changed a cookie the module reads. That is what
  turns the signed-out page into a signed-in one, and it is why closing the
  sign-in window never leaves the module behind.

`signsInWithin`, `returnsToOpener`, `moduleHome` and `popupOutcome` are pure and
covered by `tests/service-signin.test.ts`; the watcher itself is covered by
`tests/service-popup-watch.test.ts`, and `pnpm verify:signin-fold` drives the
real app through a two-origin sign-in to prove the window closes and the module
ends up on the returned page.

### Google's own account pages

Google's account pages verify the browser before they accept a sign-in. The
check reads more than the user agent: a Chrome claim from an engine that is not
Chrome is refused, and so is a guest missing the `window.chrome` surface every
Chromium browser exposes.

Measured on 2026-10-24 in a Kryvex guest against `accounts.google.com`, one
throwaway identifier per run, one process, one partition per variant. "Full"
means Google served its regular sign-in flow (`GlifWebSignIn`); "lite" is the
reduced flow it serves to a browser it will not let finish a sign-in:

| Identity | User agent | Hints | `window.chrome` | Google's answer |
| --- | --- | --- | --- | --- |
| application agent | `Kryvex/0.8.9 … Electron/…` | none | absent | accepted, lite flow |
| Chrome claim | `Chrome/152.0.0.0` | Google Chrome | absent | **refused** |
| bare Chromium | `Chrome/152.0.7977.167` | Chromium | absent | **refused** |
| Chrome claim | `Chrome/152.0.0.0` | Google Chrome | present | accepted, full flow |
| bare Chromium | `Chrome/152.0.7977.167` | Chromium | present | accepted, full flow |

The differentiator was not the brand claim: the two refused rows are exactly the
two without `chrome.app`, `chrome.csi` and `chrome.loadTimes`. Electron exposes an
empty `chrome` object, and its absence is what marks a guest as an embedded
view.

So Kryvex reports the browser it actually is, with that surface in place:

- `chromiumUserAgent` (`electron/user-agent.ts`) removes the shell's own product
  tokens from Electron's agent and leaves the plain Chromium agent: platform,
  engine, and a Chrome-versioned token. Nothing claims to be Google Chrome and
  nothing announces Electron;
- `withChromiumClientHints` (`electron/privacy.ts`) sends the engine's own brand
  list — `Not?A_Brand` and `Chromium` — which is exactly what Electron's native
  `navigator.userAgentData` reports, so headers and JavaScript agree;
- the identity preload installs `chrome.app`, `chrome.csi`, `chrome.loadTimes` and
  `chrome.runtime`, plus a prototype-level `navigator.webdriver === false`, in
  **every** guest;
- the guest's user agent follows the site family in `electron/identity.ts`, so
  `navigator.userAgent` and the requests agree on every Google host;
- the `userAgentData` patch is skipped on Google, because there the engine's own
  brands already match the agent and a Chrome-shaped object would contradict it;
- fingerprint farbling is not installed on the account hosts
  (`fingerprintSeed` returns 0 there), so their canvas, WebGL and audio calls are
  the engine's own.

### One identity per site family, not per page

0.8.9 changed identity per *host*, which left the flow claiming Chrome on
`mail.google.com` and Kryvex on `accounts.google.com`. A sign-in is a round trip
— product, account host, product again — so that made the browser change in the
middle of its own flow, exactly where Google's post-password risk check runs.
`isGoogleSite` in `electron/sign-in-hosts.ts` covers the whole family
(`google.com` and its country domains, `youtube.com`, and Google's CDNs), and
`hardening.ts`, `identity.ts` and the identity preload all ask that one
question. A hop anywhere in a Google sign-in carries the same agent.

The shield stands aside for the account surface too: a blocked subresource
there fails a sign-in with no message, so `web-privacy.ts` hands requests to
`accounts.google.*`, `myaccount.google.*` and `accounts.youtube.com` straight
through. HTTPS upgrade and tracking-parameter stripping still apply.

What Google still decides is the account step itself: a captcha, a device
check, or a tighter gate. The notice in the service view covers a refusal that
comes back anyway and offers **Reset session & retry** and **Open in my
browser**.

## Unread badges

`unreadFromTitle` in `src/lib/unread.ts` recognises the formats the major web
clients already publish:

- `(3) Discord`, `(12+) Slack`, `[4] Element`, `WhatsApp (2)`
- a leading `*` or `•` counts as one unread item

Four-digit years in parentheses are ignored, counts are capped at 999, and the
window title mirrors the total. The renderer also flashes the taskbar button
when a count rises while the window is unfocused; focusing clears it.

## Pinning

A service is pinned from its card, or unpinned from the sidebar's right-click
menu, and the rail keeps that order through drag and `Alt` + arrow. Kryvex's
own tools (Lexium, the media player, the emulator, Disk pulse and Kyvex Link)
are not services — they have no URL, category or session — but they answer to
the same rail: each card in **Services → Secret services** carries a pin, and a
pinned tool lands under the pinned services with a shell glyph instead of a
favicon.
The choice lives in `settings.pinnedTools`, so it survives a restart, and only
known tool ids survive a hand-edited state file.

A service can also be dragged from its card in **Services** onto the pinned
rail; the drag carries `application/x-kryvex-service` (`src/lib/service-drag.ts`)
so a text selection or a file from the desktop is ignored, and dropping pins the
service without ever unpinning one. `getData` is unreadable during `dragover`,
so the rail highlights on `types` and reads the id only on drop.

## Options panel

The sliders button on a service card or in a module's toolbar opens the options
panel (`src/components/OptionsPopover.tsx`). It is a popover, not a menu: it
holds switches, so an outside click does not dismiss it — it closes on its own
trigger, on Escape, or on the close button, and only one is open at a time.
While open it sits above the service canvas (`z-index: 70`, toolbar `20`) so a
webview can never paint over the switches that belong to it.

The built-in tools use the same panel (`ToolQuickMenu`). The player offers
Shuffle and the Spotify ad guard, the emulator offers Gamepad and CRT scanlines,
and Lexium, Disk pulse and Kyvex Link — which have no switches of their own —
offer the way into their window instead of invented toggles.

## Secret services are collapsed, and asked about once

The built-in tools sit behind a collapsed **Secret services** section on the
Services page, closed on every visit the way a settings group is. Opening it on
a profile that has never used them asks once — *Enable secret services* or *Not
now* — and the answer is kept in `settings.secretServices`; a profile that
already pins a tool counts as having answered yes. The tools themselves are
unchanged by the question: collapsing hides them from view, not from the app.

One of the five is different in kind. **Kyvex Link** (`#/link`, element x534)
serves a page on the local network for a phone to pair with, so its switch opens
a socket rather than a window: see [LINK.md](LINK.md) for pairing, the security
model and the limits.

## Service presets

`src/lib/catalog.ts` lists web endpoints only: messaging (Discord, Messenger,
WhatsApp, Telegram, Instagram, Gmail, X), work tools (GitHub, Linear, Notion,
Figma, Trello), AI assistants (ChatGPT, Claude, Gemini, Copilot, Perplexity,
Hugging Face, Freebuff), resources (FMHY, Ollama, Internet Archive) and media
(Spotify, YouTube, Reddit). Links that exist only as research material for the
app's own build (the Awesome Electron list, for instance) never appear here.

A preset fills the form; it does not bundle a client, an API key or a bridge.
Kryvex is not affiliated with these services, and their terms still apply. Some
sites refuse to run in any webview, and that is reported honestly instead of
being bypassed.

## Discord specifically

Kryvex can fix the client-side reasons a chat session ends, and it does. If
Discord still asks to log in again:

- sign in once inside the module, using its own **Log in** button, and complete
  any popup/2FA step there;
- do not also open Discord in a second client on the same account at the same
  moment;
- if the account shows "Please log in again", clear that module's session from
  the lock button, then sign in once more.

Server-side token invalidation is Discord's decision. Kryvex does not inject
client mods, scrape tokens or patch the page to defeat it: see
[PLATFORM_PLAN.md](PLATFORM_PLAN.md) for why client injection is deliberately
not shipped.

## Verification

`scripts/verify-service-engine.cjs` drives the built app against a loopback web
app and asserts:

- the guest keeps its marker, cookie and running timer across a view change;
- the persistent partition still holds its cookie after a full restart;
- a service gets `granted` notification permission and a browser tab gets
  `denied`;
- an auth popup opens on the same session and sees the same cookie;
- `(7) Fixture` reaches the toolbar, the sidebar and the window title;
- the toolbar lock button clears the session and the reload has no cookie;
- the guest reports a Chrome user agent with no Electron token on a non-Google
  origin (Google hosts are checked by `scripts/verify-google-signin.cjs`);
- the stage fills the window, with the guest at 1192×770 in a 1440×900 window.

Results are recorded in [TESTING.md](TESTING.md).
