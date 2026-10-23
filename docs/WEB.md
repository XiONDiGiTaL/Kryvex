# Kryvex Web: the non-Electron client

Kryvex Web is the same React renderer as the desktop app, built for a normal
browser and installed as a PWA. It is a real client, not a screenshot gallery:
the workspace, service registry, themes, Home board, weather, command palette,
tasks, wallpaper, bookmarks, history UI, Vexium's offline answers and search
fallback all run in the browser. State is kept in `localStorage` under
`kryvex.state.v1` instead of the desktop JSON file.

What it cannot do is the part that only a desktop process can provide:
embedding a service in a persistent Chromium partition, the Shield's network
filtering, Chrome extensions, a full Chromium tab engine, torrents, OpenVPN,
local model processes, system tray/default-browser integration, self-updates
and screen sharing. In the web client a service opens in its own browser tab;
the desktop app is still the place for isolated sessions, notifications and
sign-in popups.

## Live deployment

**[https://xiondigital.net/Kryvex/](https://xiondigital.net/Kryvex/)** is the
current build, served by GitHub Pages from the `gh-pages` branch of
`XiONDiGiTaL/Kryvex`. The branch contains only the built `dist-web/` files and a
`.nojekyll` marker; it is force-pushed from a clean build, so it never carries
source, secrets or caches.

To publish a new build after changing the client:

```bash
pnpm build:web
git worktree add --detach ../Veyra-pages origin/gh-pages
git -C ../Veyra-pages rm -rf .
cp -a dist-web/. ../Veyra-pages/
touch ../Veyra-pages/.nojekyll
git -C ../Veyra-pages add -A
git -C ../Veyra-pages commit -m "Publish Kryvex Web"
git -C ../Veyra-pages push origin HEAD:gh-pages
```

GitHub Pages serves the site over HTTPS, which is what makes the service worker
and the install prompt available on a phone. The URL is under the same domain as
the project's Pages site, so no extra host or DNS record is needed.

## Build

```bash
pnpm build:web
```

The result is `dist-web/`, a static directory. `scripts/check-web-build.cjs`
fails the build if the manifest, service worker, icons or JavaScript bundle are
missing. The same build is produced by `pnpm build` under `dist/`, because the
`public/` directory is copied for both clients.

## Run it locally

```bash
python -m http.server 4173 -d dist-web --bind 127.0.0.1
```

Or with any static file server. Hash routing means the server needs no rewrite
rules: `#/services`, `#/browser` and `#/settings` are all the same `index.html`.

A service worker only runs in a secure context. `http://localhost` and
`http://127.0.0.1` count; a plain `http://192.168.x.x` address does not, so the
install offer and offline cache will be unavailable over a LAN without TLS.

## Install on an Android phone (S23 Ultra)

1. Put `dist-web/` behind HTTPS. Any static host works (GitHub Pages, Cloudflare
   Pages, Netlify, Vercel, or a local TLS proxy).
2. Open the URL in Chrome on the phone.
3. Use **Install app** in the page banner, or Chrome's menu → **Add to Home
   screen** → **Install**.
4. It opens standalone, without browser chrome; the bottom bar is the phone
   navigation.

For a USB-only test, `adb reverse tcp:4173 tcp:4173` makes the PC's server
appear as `http://localhost:4173` on the phone, which is a secure context. The
phone must be connected and USB debugging enabled.

## What works in the web client

| Area | Web/PWA |
| --- | --- |
| Workspace, sidebar/bottom bar, command palette | Yes |
| Service registry: add, edit, pin, remove, categories, presets | Yes |
| Themes, density, custom theme, theme gallery | Yes |
| Home board: clock, tasks, guide | Yes |
| Weather | Yes, direct Open-Meteo request (CORS, keyless) |
| Wallpaper | Yes, stored as a downscaled data URL in `localStorage` |
| Browser bookmarks, history, start page | Yes; pages open in the browser |
| Vexium | Offline app answers and search fallback; a local model needs the desktop app |
| Languages (en/es/de/fr) | Yes |
| 8-bit emulator | Yes, if the EmulatorJS CDN is reachable |
| Lexium translation | Yes: LibreTranslate if reachable, otherwise the labelled MyMemory fallback |
| Lexium OCR | Yes, if the Tesseract CDN is reachable the first time |
| Lexium transcription | Yes, when a Whisper engine is reachable from that device; an HTTPS page cannot call a plain `http://` engine on the LAN |
| Media player | Yes: local audio/video, direct media links, repeat/shuffle, docked transport bar |
| Offline shell | Yes, after the first visit |
| Install to home screen | Yes, on HTTPS/localhost |

## What needs the desktop app

| Area | Why |
| --- | --- |
| Embedded service apps | Each desktop service gets a persistent Chromium partition, popups and notifications; a browser cannot provide those across origins. |
| Kryvex Shield and extensions | Network filtering and extension loading run in Electron's session layer. |
| Browser engine, downloads, torrents | A page cannot host Chromium or write to the filesystem the way the desktop shell does. |
| VPN | The desktop app starts an OpenVPN process you provide. |
| Local models | Vexium's Ollama/LM Studio/GGUF path talks to loopback from the main process; the web client does not proxy it. |
| Rooms screen share | Display capture is granted to the desktop shell. |
| Platform playback in the player | YouTube, Spotify, Twitch, SoundCloud and Vimeo are pages, not media files; they open in their own tab. |
| Updates and default browser | Windows integration, not a web API. |

The web client says **Web** in the header and shows a desktop-only note where a
panel needs the bridge, rather than pretending the feature works.

## Data and privacy

There is no Kryvex server. The static files can be hosted anywhere, and the
client makes no analytics or telemetry request. State, tasks, bookmarks and the
wallpaper live in the origin's `localStorage`; clearing site data removes them.
Weather is the one network call the client makes on its own, and it sends only
the chosen city or coordinates to Open-Meteo. Services and search results leave
the origin only when you open them.

The service worker caches only same-origin GET requests. It never caches a
cross-origin service page, so signing in to a service in another tab is
unaffected by the Kryvex cache.

## Rebuilding the release zip

`dist-web/` is ignored by Git. To hand the client to a phone without a host,
zip that directory and transfer it, then serve it with any static server. The
desktop release assets remain the Windows Setup and Portable EXEs; the web
client is versioned with the repository and built on demand.
