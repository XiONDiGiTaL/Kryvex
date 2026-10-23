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

## Unread badges

`unreadFromTitle` in `src/lib/unread.ts` recognises the formats the major web
clients already publish:

- `(3) Discord`, `(12+) Slack`, `[4] Element`, `WhatsApp (2)`
- a leading `*` or `•` counts as one unread item

Four-digit years in parentheses are ignored, counts are capped at 999, and the
window title mirrors the total. The renderer also flashes the taskbar button
when a count rises while the window is unfocused; focusing clears it.

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
[PLATFORM_PLAN.md](PLATFORM_PLAN.md) for why BetterDiscord-style injection is
deliberately not shipped.

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
- the guest reports a Chrome user agent with no Electron token;
- the stage fills the window, with the guest at 1192×770 in a 1440×900 window.

Results are recorded in [TESTING.md](TESTING.md).
