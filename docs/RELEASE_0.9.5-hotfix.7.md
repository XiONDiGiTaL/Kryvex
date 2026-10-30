# Kryvex 0.9.5-hotfix.7: a catalogue worth exploring, and a Vexium that takes sources

Prepared 2026-10-30 for the `v0.9.5-hotfix.7` tag. This is a feature batch, so
the version line stays at **0.9.5** and the build wears the `-hotfix.7` suffix
([UPDATES.md](UPDATES.md)). Everything in 0.9.5 through 0.9.5-hotfix.6 is
included.

This batch turns Kryvex from a workspace with a service list into one with a
catalogue, and gives the modules a way to hand what they find to Vexium instead
of making the user copy and paste it.

- **Send to Vexium works from every module.** A selection or the whole visible
  page in any embedded service, a Lexium transcript, passage, OCR text or
  translation, and a typed note all arrive as separate, labelled sources with
  their name, address and capture time intact.
- **The catalogue is 143 presets across 15 categories.** It was 41 across 7.
  Career, education, language, finance, design, music, utilities and news are
  now real categories rather than a growing pile under *other*.
- **The palette is 21 named tones plus a custom picker.** Orange is its own
  colour, so Reddit no longer borrows a yellow.
- **Every preset has a bundled brand mark**, checked by a build gate, and the
  address bar names the country a page is served from.

## What changed

### Send to Vexium

- **One validated source model (`src/lib/vexium-transfer.ts`,
  `tests/vexium-transfer.test.ts`).** Every producer builds the same record:
  name, kind, address, capture time and text. Eight sources per request, 12,000
  characters each, with the limits checked in one place so a future producer
  cannot invent its own. Empty, oversized, duplicate and unreadable content are
  rejected with a reason the panel can show, instead of being attached silently.
- **Producers in the browser and in Lexium.** `src/lib/vexium-capture.ts` reads
  the selection or the page from an embedded module; Lexium hands over the
  finished transcript, a selected passage, OCR text or a translation it already
  produced. Nothing is transcribed, OCR'd or translated a second time.
- **Context management in the panel (`src/views/Assistant.tsx`).** Attached
  sources appear above the composer with a preview and a remove control each,
  plus clear-all, the count against the limit, and a line that says what is sent
  and where. Sources are never submitted for inference on arrival: the user
  still sends the message.
- **Ten contextual actions on the existing runtime.** Explain, summarize,
  analyze, translate, extract key points, identify important details, simplify,
  compare sources, identify contradictions and generate questions are entries in
  one table, each with its own instruction. They call the model the user already
  configured; there is no second AI path.
- **Entry points.** A right-click menu on the page and a toolbar button in any
  embedded service, a source button beside each Lexium output (transcript,
  passage, OCR, translation), a command-palette command for the page in front,
  and attaching the current draft as a note.
- **Security.** A source is treated as untrusted data, never as an instruction:
  the instruction lives in the action, not in the text, and the panel says so.
  Only text, name, address and time move. No cookie, token, password or session
  is read or forwarded, and an external provider is only reached through the
  provider the user configured.

### The catalogue

- **102 new presets (`src/lib/catalog.ts`).** Career and employment
  (Novorésumé, LinkedIn, Indeed, Glassdoor), AI and audio (ElevenLabs, Suno,
  Udio, Canva, Adobe Express), software and technology (Ninite, XDA, GitHub,
  SourceForge, AlternativeTo, Proton, Internet Archive), education (Alison,
  Coursera, edX, Khan Academy, MIT OCW, freeCodeCamp), language (Tandem,
  InterPals, HelloTalk, WordReference, Reverso), finance (Coinbase, Kraken,
  Binance, TradingView, CoinGecko, CoinMarketCap), publishing (Blogger, Medium,
  Substack, Tumblr, WordPress, Reddit), and international news from the US, UK,
  Turkey, Germany, France, Spain, Italy and Asia — plus the configuration,
  design, music, travel, conversion and privacy tools that were missing
  entirely.
- **Eight new categories.** `news`, `education`, `career`, `finance`,
  `language`, `design`, `music` and `utilities` join the seven that existed.
  The filter chips, the add-service dialog and the tests read one list.
- **Aliases and a searchable picker.** "Blogspot" finds Blogger, "MIT OCW"
  finds MIT OpenCourseWare, and a preset already installed is marked rather than
  offered twice. Duplicate detection still works on the host, so two presets
  cannot point at one site.
- **Explicit metadata and capabilities.** A preset now declares its category,
  colour, icon, note, aliases and capabilities (`open-url`, `send-selection`,
  `send-page`) and its integration kind, which is `website` for every shipped
  preset. Nothing in the catalogue is presented as a native integration: these
  are links that open in a hardened session.

### Colour and identity

- **Twenty-one tones in spectrum order (`src/lib/services.ts`).** Red, orange,
  amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet,
  purple, magenta, pink, rose, brown, neutral gray, light neutral and dark
  neutral, with a custom picker beside them.
- **Brand-inspired defaults, user choice preserved.** Reddit is orange,
  Coinbase blue, Kraken purple, Binance yellow, Spotify green, GitHub dark,
  ElevenLabs dark neutral. Saved colours are untouched: the store accepts any
  valid hex, so the wider palette never rewrites a profile.
- **59 bundled brand marks (`public/brand-icons/`, `src/lib/brand-icons.ts`).**
  Served from the app rather than fetched from the site, so the grid works
  offline and a blocked host does not leave a blank tile. Marks that are dark by
  design get a light plate on dark themes.
- **The build refuses an unreadable mark (`scripts/check-brand-icons.cjs`,
  `pnpm check:icons`).** It decodes every bundled file, measures its contrast
  against the tile it sits on, and fails on a missing, undecodable or
  unreferenced file.

### The browser

- **The serving country in the address bar (`src/lib/origin.ts`,
  `electron/origin.ts`, `src/components/ServerOrigin.tsx`).** The main process
  resolves the page's host and reads a keyless registry, and a chip beside the
  address shows the flag; the card behind it carries the address, network, edge
  node, local time at the node and coordinates, with a re-lookup and a copy
  button. Flags are bundled, so the chip works offline.
- **Translations for it (`src/lib/i18n-origin.ts`).** The chip shipped with
  English-only copy in the previous commit; Spanish, German and French now have
  it, Turkish has it, and the provider's hostname is rendered literally rather
  than treated as translatable copy.

### Fixes and maintenance

- **Three stale destinations.** A link audit of all 143 presets replaced
  `notion.so` with `notion.com`, `zoom.us` with `zoom.com` and
  `copilot.microsoft.com` with `copilot.com` — all three hosts the brands have
  moved off, and all three still answered, which is exactly why they were missed.
  The starter set's Notion entry moved with them.
- **Turkish, second pass.** The whole browser surface — tab strip, address bar,
  downloads, torrents, history and the bookmarks library — plus the Kryvex Start
  page with its feed reader and Shield counters, 154 strings in all. The ratchet
  drops from 1,291 to **1,128**.
- **Version 0.9.5-hotfix.7.** `package.json` and the web worker's cache name
  (`kryvex-web-0.9.5-hotfix.7-v1`) move together.

## Artifacts

Built by the Release workflow on the `v0.9.5-hotfix.7` tag (`windows-latest`,
Node 22, pnpm 10) and attached to
[the release](https://github.com/XiONDiGiTaL/Kryvex/releases/tag/v0.9.5-hotfix.7):

| File | Size | SHA-256 |
| --- | --- | --- |
| `Kryvex-Setup-0.9.5-hotfix.7-x64.exe` | recorded after the tag | recorded after the tag |
| `Kryvex-Portable-0.9.5-hotfix.7-x64.exe` | recorded after the tag | recorded after the tag |

`SHA256SUMS.txt` travels with them. **The digests above are filled in by the
follow-up commit that records the published assets**, the way 0.9.5-hotfix.6's
were: at the time this record was written the tag had not run. Both EXEs are
**unsigned**.

**Web client.** The same tag rebuilds and force-pushes `gh-pages`, so the
published worker at `https://xiondigital.net/Kryvex/sw.js` names
`kryvex-web-0.9.5-hotfix.7-v1` and the site reports this version.

## Install

1. Run `Kryvex-Setup-0.9.5-hotfix.7-x64.exe`, or update an installed 0.9.5
   through **Settings → Updates** — the updater ranks a hotfix above the release
   it patches.
2. The wizard offers the existing per-user installation in `C:\Kryvex` and
   upgrades it in place. Shortcuts stay and the profile in `%APPDATA%\Kryvex` is
   untouched, so services stay signed in, the board keeps its layout and every
   saved service colour is preserved.
3. The Portable EXE runs without installing.

## Verification performed

- `pnpm typecheck`: exit 0 for the renderer and `electron/`.
- `pnpm test`: **1136/1136** across 96 files, including the new
  `tests/vexium-transfer.test.ts` (source kinds, metadata, limits, duplicates,
  untrusted-text handling) and the extended `tests/services.test.ts` (unique ids
  and hosts, category coverage, palette with a true orange, bundled marks) plus
  `tests/origin.test.ts` (18 tests for the country chip).
- `pnpm check:icons`: 59 bundled images, 7 light-plate checks, every file
  referenced and legible on the tile it sits on.
- `pnpm build:web`: exit 0, 5.2 MiB, with the manifest, service worker and
  bundle checks passing.
- **All 143 preset URLs requested.** 121 answered directly; 22 answered with a
  bot-protection status (`403`, `418`, `400`) to a client without a browser
  fingerprint, which is not a dead destination; no preset failed to resolve
  after a second attempt. Three hosts redirect permanently and were corrected.
- CI on the preceding commit (`46bfaf8`): Windows job and all six harness
  batches green.

The packaged-app harnesses (`pnpm verify:*`) were **not** re-run for this
record; the gates above, and CI, are what this commit was verified with.

## Wizard capture

The installer is a native Windows dialog, so its pages appear in no screenshot of
the app. **This capture has not been recorded for this version yet.** It is
produced by [`scripts/verify-self-update.cjs --wizard --archive`](verify-self-update.cjs)
against a locally built installer (`pnpm package:win`), and that run installs
over the existing `C:\Kryvex` to photograph the upgrade path — so it is the one
step of this record that touches the machine it runs on, and it has to be run
deliberately.

`scripts/check-release-record.cjs` fails a tag whose record has no capture
committed under `docs/media/releases/0.9.5-hotfix.7-wizard/`, which is the point:
the tag for this note cannot cut until that capture exists.

## Known limitations

- The artifacts are **unsigned**; Windows SmartScreen may warn about an unknown
  publisher.
- **The catalogue is links, not integrations.** No preset holds a token, calls a
  site's API or acts on an account. The exchange presets are shortcuts to those
  sites; Kryvex is not a wallet and stores no exchange credential.
- **Twenty-two presets cannot be checked from a script.** They answer `403`,
  `418` or `400` to any client that is not a browser, so the audit proves they
  resolve, not that they render. The same is true of the two Google-hosted
  entries that redirect to a sign-in when signed out.
- **The country chip asks a public registry.** The page's own address is never
  sent, but the IP it resolves to is sent to `ipwho.is`, and that lookup is what
  the card shows. Nothing is cached beyond the tab.
- **Turkish is still partial.** 1,128 of 2,002 strings fall back to English;
  settings prose, release notes and error explanations are the bulk of what is
  left.
- **Rendering of the new catalogue was verified by tests and the web build, not
  by a screenshot pass** over every category.
