# Kryvex legal pack

> This is a starting policy for the distributor of Kryvex. It is not legal
> advice. Replace the bracketed placeholders and have a lawyer review it before
> publishing a paid or public distribution.

Last updated: 2026-10-21. Applies to Kryvex 0.8.3.

## Privacy policy

Kryvex is a local desktop application. It has no account system, no analytics,
no crash reporting, no advertising SDK and no cloud sync. The distributor does
not receive usage data from the app.

**What stays on this device**

| Data | Location | Purpose |
| --- | --- | --- |
| Services, bookmarks, history, settings, tabs | `%APPDATA%\Kryvex\kryvex-state.json` | Restore the workspace |
| Download history | `%APPDATA%\Kryvex\kryvex-downloads.json` | Download library |
| Torrent queue (metadata only) | `%APPDATA%\Kryvex\kryvex-torrents.json` | Restore the paused queue |
| Site cookies, storage and caches | `%APPDATA%\Kryvex\Partitions\persist_svc-*` | Keep each service signed in |
| Browsing history of throwaway tabs | `%APPDATA%\Kryvex\Partitions\browser-*` | Discarded when the tab closes |
| Shield filter cache | `%APPDATA%\Kryvex\` | Block ads and trackers offline |

**What leaves the device**

- Requests made by the websites you open, as in any browser. Kryvex does not
  proxy, log or inspect them.
- Filter-list downloads when the shield updates, from the public EasyList and
  uBlock Origin URLs.
- Nothing else. There is no Kryvex server to send anything to.

**Third-party services.** Every installed service is operated by its own
provider under its own privacy policy. Signing in to Discord, Google, Meta,
Microsoft or any other service sends data to that provider, exactly as it would
in a browser. Kryvex does not receive a copy.

**Fingerprinting and ads.** The shield blocks known ad/tracker hosts, upgrades
top-level navigation to HTTPS where possible, trims cross-origin referrers,
sends Global Privacy Control, and adds stable per-site noise to canvas, WebGL
and audio-analysis readouts. These are local protections, not anonymity.

**Children.** Kryvex is not directed at children and does not knowingly collect
personal data from anyone.

**Data deletion.** See "Your data, your choice" below.

## Terms of service

Kryvex is provided **as is**, without warranty of any kind, express or implied,
including fitness for a particular purpose. To the maximum extent permitted by
law, the distributor is not liable for data loss, account action taken by a
third-party service, or any damages arising from use of the app.

**Acceptable use.** You are responsible for what you do with Kryvex and for the
terms of every service you open in it. Do not use Kryvex to break the law,
infringe copyright, harass people, circumvent access controls or violate a
service's terms.

**Third-party services.** Kryvex is not affiliated with, endorsed by, or
sponsored by Discord, Google, Meta, Microsoft, OpenAI, Anthropic, Telegram,
Slack or any other service named in the catalogue. Names and marks identify the
linked service only. Kryvex does not host, index or distribute their content,
and does not grant you any right to it.

**No piracy.** Kryvex provides a browser and a BitTorrent client. It ships no
media, no ROMs, no keys and no links to infringing material. Downloading or
sharing content without permission may be illegal where you live.

**Client mods.** Kryvex does not inject BetterDiscord, Vencord, AyuGram or any
other patched client. Doing so is against several services' terms and can end
an account; that risk is not transferred to Kryvex.

**Changes.** These terms may change with a release. The version in the installed
app is the one that applies.

## Cookie policy

Kryvex sets **no first-party cookies** for analytics, advertising or tracking.

Cookies you encounter come from the websites you open. Service modules keep
theirs in a persistent partition so you stay signed in; browser tabs keep theirs
in a disposable in-memory partition that disappears when the tab closes.

Because Kryvex sets no tracking cookies, there is no first-party consent banner
to accept. Sites that show their own consent dialog are handled by the site or
hidden by the EasyList Cookie filter, at your choice. Clearing a service's
cookies is available from the lock button in its toolbar.

## Refund policy

Kryvex is free and sells nothing: there is no checkout, subscription, licence
key, in-app purchase or donation prompt inside the app. No refund policy
applies. If a store or distributor charges for a build, that transaction is
between you and them.

## Accessibility

- Every interactive control is a real button, link or labelled input.
- Icon-only buttons carry an `aria-label` and a tooltip.
- Status is never colour-only: unread counts, errors and states have text.
- The interface is keyboard reachable: `Ctrl 1–4` for views, `Ctrl K` for the
  palette, `Escape` to close dialogs, `Tab`/`Enter`/`Space` for controls.
- Themes are contrast-checked against the surface they sit on; the light theme
  is not an inverted afterthought.
- Density and zoom are adjustable; the window scales with the system DPI.

Known gaps: some third-party sites bring their own inaccessible controls, and
screen-reader coverage of a webview is limited by Chromium, not Kryvex.

## Licences

| Asset | Licence |
| --- | --- |
| Kryvex source | MIT (see `LICENSE`) |
| Brand icons | Simple Icons, CC0-1.0; trademarks belong to their owners |
| Filter lists | uBlock Origin / EasyList, downloaded at runtime, not redistributed |
| Ad-block engine | `@ghostery/adblocker`, MPL-2.0 |
| Runtime | Electron, Chromium, Node.js, React, WebTorrent: see their licences |
| Fonts | System UI and system monospace; no font files are redistributed |

## Your data, your choice

- **Reset workspace:** Settings → Data → Reset removes services, bookmarks,
  history and preferences.
- **Clear one service:** the lock button in a service toolbar deletes that
  service's cookies, storage and cache only.
- **Delete everything:** close Kryvex and delete `%APPDATA%\Kryvex`. Nothing is
  left on the device, and nothing was ever sent to the distributor.
- **Uninstall:** Settings → Apps → Kryvex. The installer does not remove your
  data unless you delete the folder above.

## Business details

Distributor: [legal name]
Address: [registered address]
Contact: [support email]
Responsible for content: [name]

No VAT number, company registration or address is invented here; these fields
must be filled by the distributor before a public release.
