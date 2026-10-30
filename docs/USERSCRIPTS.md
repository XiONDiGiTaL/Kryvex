# User scripts

Kryvex runs Greasemonkey- and Tampermonkey-style `.user.js` files in its browser
tabs. This is the Tampermonkey feature set reduced to what a desktop app can
honestly promise: install a script, see where it applies, switch it off, remove
it.

There is no store, no account and no sync. A script is a file on this machine,
and the only copy of it is the one Kryvex wrote.

## Where it lives

| Surface | What it does |
| --- | --- |
| Browser toolbar | The script icon opens a panel listing every installed script with a switch, a marker when a script runs on the page in front, **Install from file**, and a link to Settings |
| **Settings → User scripts** | The full list, per-script switches and removal, install from a file, paste the source, fetch from an address, and the libraries scripts are published to |
| Main process | `electron/userscripts.ts` stores and injects them; `electron/userscript-rules.ts` parses and matches them |
| IPC | `kryvex:userscripts:list`, `:install-file`, `:install-text`, `:install-url`, `:enabled`, `:remove` — each refused for a sender that is not the shell |

**Settings → Browser** links straight to the block, and the browser panel's
**All scripts and sources** entry does the same through
`#/settings?section=userscripts`.

## What a script has to contain

The metadata block is the whole contract:

```js
// ==UserScript==
// @name         Example
// @namespace    https://example.com/kryvex
// @version      1.0.0
// @description  What it changes
// @match        *://*.example.com/*
// @include      https://example.org/*
// @exclude      *://*.example.com/checkout*
// @run-at       document-end
// ==/UserScript==
```

- `@match` is a Chrome match pattern: `*` as the scheme means http and https,
  `*.example.com` covers the bare domain and its subdomains, and the path is a
  glob that includes the query string. `<all_urls>` is accepted.
- `@include` is a Tampermonkey glob over the whole URL, or `/regex/`.
- `@exclude` wins over both.
- A file with no header, no `@name`, or no `@match`/`@include` is refused: a
  script with no page to run on would otherwise run everywhere.
- `@grant`, `@require`, `@resource` and `@icon` are read and ignored. Nothing is
  loaded from a remote URL to satisfy them.

A script is re-installed in place when the same `@name` and `@namespace` arrive
again, so updating one does not leave two copies behind.

## How it runs

Injection happens in the main process on each guest's `dom-ready`, one
`executeJavaScript` per script, wrapped in its own function scope with a
`try`/`catch` and a `sourceURL` so the DevTools console names the file. A script
that throws does not stop the next one, and a syntax error fails only its own
evaluation.

Consequences worth stating plainly:

- **It runs on `dom-ready`, whatever `@run-at` says.** `document-start` is
  treated as `document-end`: the page's own scripts have already run by then, so
  a script cannot intercept a page's startup the way Tampermonkey can.
- **It gets the page's own world and access.** That is what makes scripts
  useful and it is also why installing one is a trust decision.
- **Browser tabs only.** A service module keeps a persistent signed-in profile,
  so a third-party script is never injected into one. A sign-in popup is a
  window rather than a webview and is not reached either.
- **Matching is per page load.** A single-page app that changes its URL without
  reloading keeps the scripts that matched when the document loaded.

## Limits

| Limit | Value |
| --- | --- |
| Scripts installed | 60 |
| One script's size | 512 KB |
| Address that can be fetched | http or https only, and the reply must contain `==UserScript==` |
| Duplicate installation | Same `@name` + `@namespace` replaces the stored file |

## Files on disk

| Path | Contents |
| --- | --- |
| `userData/userscripts/<key>.user.js` | The script exactly as it arrived |
| `userData/kryvex-userscripts.json` | Metadata and the enabled switch for each script |

Removing a script deletes its file. The stored source is never rewritten, so a
script can always be read back or copied out.

## Where to find scripts

The Settings block links to [Greasy Fork](https://greasyfork.org/),
[OpenUserJS](https://openuserjs.org/), GitHub's `userscript` topic and the
Tampermonkey documentation. They open in the system browser, not inside Kryvex:
browsing a library is a browsing job, and a library inside a signed-in webview
would be a different thing to maintain.

Kryvex hosts none of these libraries and audits none of them. The install path
fetches whatever address you give it, and a page that is HTML rather than a
script is rejected with an explanation instead of being stored.

## What was checked

[`scripts/verify-userscripts.cjs`](../scripts/verify-userscripts.cjs) drives the
built app and checks, against a live tab: the script installs through the
bridge, is listed, runs in the tab but never in the shell, follows an in-tab
navigation, stops when disabled, and is removed cleanly. It also holds the
address bar to the two rules below.

## The address bar, which this batch also fixed

Two things made the address bar feel broken on a site that keeps changing its
URL, which is how Google behaved:

1. **A click placed a caret instead of selecting the address.** Typing then
   spliced the new address into the old one — `https://www.google.com/?zx=…`
   followed by what you typed — so Enter loaded a broken URL instead of going
   anywhere. Clicking the field now selects the whole address, the way every
   other browser does, while a second click inside it still places a caret
   where you clicked.
2. **A page could rewrite the box you were typing in.** `did-navigate-in-page`
   was treated as a page change, so a site calling `pushState` on its own — a
   search box updating its query, a feed updating as you scroll — replaced the
   text with the page's URL. The webview now reports the two kinds of
   navigation separately, and an in-page change never edits the field while it
   is focused. A real load still updates it, and switching tabs still resets it
   to the tab you moved to.
