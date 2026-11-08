
# Kryvex Legal Policies

**Last updated:** November 7, 2026

## Privacy Policy

Kryvex is a local desktop application designed with privacy and user control in mind. The application does not operate an account system, analytics, crash reporting, advertising SDKs, or cloud synchronization. Kryvex does not collect or transmit user activity data to its distributor.

### Data Stored Locally

The following information is stored locally on the user's device:

| Data | Storage Location | Purpose |
|---|---|---|
| Services, bookmarks, browsing history, settings, and tabs | `%APPDATA%\Kryvex\kryvex-state.json` | Workspace persistence |
| Download history | `%APPDATA%\Kryvex\kryvex-downloads.json` | Download management |
| Torrent queue metadata | `%APPDATA%\Kryvex\kryvex-torrents.json` | Queue restoration |
| Service cookies, storage, and caches | `%APPDATA%\Kryvex\Partitions\persist_svc-*` | Persistent service sessions |
| Temporary browser-tab data | `%APPDATA%\Kryvex\Partitions\browser-*` | Temporary browsing sessions |
| Shield filter cache | `%APPDATA%\Kryvex\` | Local ad and tracker filtering |

### Data Transmission

Kryvex does not operate servers that collect or store user activity. Information leaves the device only through the following operations:

- Standard network requests made directly by websites and services accessed through Kryvex.
- Filter-list downloads from publicly available EasyList and uBlock Origin sources when Shield updates its filtering rules.

Kryvex does not proxy, log, or independently inspect ordinary website traffic.

### Third-Party Services

Services accessed through Kryvex are operated independently by their respective providers and are subject to those providers' privacy policies and terms of service.

When users sign in to third-party services, including Discord, Google, Meta, Microsoft, or other providers, information is transmitted directly to those providers in accordance with their own systems and policies. Kryvex does not receive or retain copies of that information.

### Privacy and Tracking Protection

Kryvex Shield incorporates privacy protections designed to reduce exposure to advertising and tracking technologies. These include:

- Blocking known advertising and tracking domains.
- Upgrading eligible top-level navigation requests to HTTPS.
- Limiting cross-origin referrer information.
- Sending Global Privacy Control signals.
- Applying consistent, per-site noise to selected canvas, WebGL, and audio-analysis readouts.

These measures provide additional privacy protection but do not guarantee anonymity or complete protection against tracking or fingerprinting.

### Children's Privacy

Kryvex is not designed or marketed specifically for children. The application does not knowingly collect personal information from children.

### Data Deletion

Users retain control over locally stored application data. Available deletion and reset options are described in the [Your Data and Privacy Controls](#your-data-and-privacy-controls) section of this document.

## Terms of Service

### General Terms

Kryvex is provided on an **"as is" and "as available"** basis, without warranties or guarantees of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement, to the maximum extent permitted by applicable law.

To the maximum extent permitted by law, the distributor shall not be liable for data loss, account restrictions or actions taken by third-party service providers, service interruptions, or damages arising from the installation, access, or use of Kryvex.

### Acceptable Use

Users are responsible for their activities while using Kryvex and for complying with all applicable laws, regulations, and third-party service terms.

Kryvex must not be used to facilitate unlawful activity, copyright infringement, harassment, unauthorized access, circumvention of access controls, or violations of third-party terms of service.

### Third-Party Services and Trademarks

Kryvex is an independent application and is not affiliated with, endorsed by, or sponsored by Discord, Google, Meta, Microsoft, OpenAI, Anthropic, Telegram, Slack, or any other third-party service referenced within the application.

Third-party names, logos, and trademarks are used solely to identify their respective services. All trademarks remain the property of their respective owners.

Kryvex does not claim ownership of, or grant rights to, third-party content. Access to external services and their content remains subject to the applicable provider's terms and policies.

### Copyright and Prohibited Content

Kryvex includes browser functionality and a BitTorrent client. It does not bundle or distribute media files, game ROMs, encryption keys, or links to unauthorized copyrighted material.

Users are solely responsible for ensuring that any content they download, access, share, or distribute is legally obtained and used in accordance with applicable copyright laws.

### Third-Party Client Modifications

Kryvex does not inject modified clients, unauthorized patches, or third-party modifications into external services. Users are responsible for any modifications they independently introduce and for any resulting consequences, including restrictions or termination imposed by third-party providers.

### Policy Changes

These policies may be revised as Kryvex develops. Updated policies may accompany new application releases. The latest published version supersedes previous versions.

## Cookie Policy

Kryvex does not set first-party cookies for analytics, advertising, or user tracking.

Cookies and similar storage technologies encountered while using Kryvex originate from the websites and services accessed through the application.

Service modules use persistent storage partitions to maintain login sessions and preferences. Standard browser tabs use temporary storage partitions that are discarded when the respective tab is closed.

Because Kryvex does not use first-party tracking cookies, it does not require an application-level tracking consent banner. Third-party websites may display their own consent notices and manage their own cookie preferences. The EasyList Cookie filter may also hide supported consent elements according to the user's filtering settings.

Users can clear an individual service's cookies, storage, and cache through the lock control in that service's toolbar.

## Refund Policy

Kryvex is provided free of charge and does not include subscriptions, paid licenses, in-app purchases, checkout functionality, or integrated donation prompts.

As the application itself does not process payments, no refund obligation arises from its use.

Any payment collected by an independent store, distributor, or third-party platform is governed by that provider's applicable purchase and refund policies.

## Accessibility

Kryvex is designed with accessibility and usability in mind.

- Interactive controls use appropriate buttons, links, or labelled input elements.
- Icon-only controls include accessible labels and tooltips.
- Important statuses, notifications, and errors are communicated through text rather than color alone.
- Keyboard navigation is supported throughout the interface, including `Ctrl + 1–4` for views, `Ctrl + K` for the command palette, and `Escape` for closing dialogs.
- Themes are designed with attention to contrast and readability.
- Interface density and zoom can be adjusted, and the application window scales with system DPI settings.

**Known limitations:** Some third-party websites contain controls that may not meet accessibility standards. Screen-reader compatibility within embedded webviews is also subject to limitations imposed by Chromium and the individual websites being accessed.

## Third-Party Licences and Attribution

Kryvex incorporates or references the following open-source projects and resources:

| Component | Licence / Attribution |
|---|---|
| Kryvex source code | MIT License (see `LICENSE`) |
| Brand icons | Simple Icons, CC0-1.0. Trademarks remain the property of their respective owners. |
| Filter lists | uBlock Origin and EasyList. Downloaded at runtime and not redistributed. |
| Ad-blocking engine | `@ghostery/adblocker`, MPL-2.0 |
| Emulator | EmulatorJS, GPL-3.0. Retrieved at runtime from its official CDN within a sandboxed frame; not bundled, modified, or redistributed. See `docs/ATTRIBUTION.md`. |
| Runtime and application dependencies | Electron, Chromium, Node.js, React, and WebTorrent. Each remains subject to its respective licence. |
| Fonts | System UI and system monospace fonts. No font files are redistributed. |

All third-party software remains subject to its respective licence terms. Additional attribution and licence information is available in the project repository.

## Your Data and Privacy Controls

Kryvex provides users with controls to manage and remove locally stored application data.

- **Reset Workspace:** Settings → Data → Reset removes services, bookmarks, browsing history, and preferences.
- **Clear Individual Service Data:** The lock control in a service toolbar removes that service's cookies, storage, and cache without affecting other services.
- **Delete All Application Data:** Closing Kryvex and deleting `%APPDATA%\Kryvex` removes the application's locally stored data.
- **Uninstall:** Kryvex can be uninstalled through Settings → Apps → Kryvex. Uninstallation does not automatically remove the application's data directory.

Kryvex does not maintain a remote user-data repository. Application data remains under the user's control on their device.

## Business Information

**Distributor:** [xiondigital](https://github.com/xiondigital)

**Contact:** [info@xiondigital.net](mailto:info@xiondigital.net)
