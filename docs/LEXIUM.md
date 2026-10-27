# Lexium: x530

Lexium is Kryvex's in-house language tool, opened from **Services → Secret
services**. It is a real client for engines you run, not a wrapper around an AI
chat: every step is deterministic, visible, and can be inspected.

| Tab | What it does | Where the work happens |
| --- | --- | --- |
| **Transcribe** | Imports an audio file, decodes it, sends 16 kHz mono WAV to a Whisper server you configured, and returns an editable transcript with optional timed segments, `.txt` and `.srt` export. | Engine on your machine or network. |
| **Translate** | Text-to-text translation in both directions, with automatic language detection, word count, swap and copy. | A LibreTranslate server; a keyless public fallback when that server is unreachable. |
| **From image** | Reads text out of a screenshot or photo and hands it to the translator. | Tesseract (WASM) in the renderer; the image never leaves the device. |

The element tile reads **Lx / x530**, continuing the fictional Kx series that
numbers the shell itself as x529.

## Speech engines

Open **Engines and languages** at the bottom of the page. Four engines are
supported, and nothing is contacted until you press a button.

### This PC (default in the desktop app)

Windows already ships a speech recogniser, reachable through .NET's
`System.Speech`. The desktop build runs it in the main process, so the first
transcription works with **no download, no server and no account**: a fresh
profile starts here instead of pointing at port 8000.

- The renderer produces the same 16 kHz mono PCM WAV it would upload, and the
  main process writes it to a temporary file for the recogniser to read.
- It is a *dictation* engine: best on clear speech by one speaker. For accents,
  music or several speakers a Whisper server is far more accurate, and the panel
  says so rather than pretending otherwise. **A song is not a dictation source:**
  the engine is a speech recogniser, and sung, mixed or noisy audio should go to
  Whisper.
- It covers the languages installed in Windows. The check reports which ones
  (`This PC is listening (en-US)`); with none installed it says so and points at
  the server options.
- **The language is matched exactly, and never substituted.** The engine is
  language-specific and does not refuse foreign audio: an English recogniser
  reading a Turkish recording answers with confident English that is nowhere in
  the audio. So a language this machine has no recogniser for is refused before
  anything runs ("This PC has a dictation engine for en-US only, so it cannot
  hear Turkish…"), and the fix is either the Windows language pack or a Whisper
  server. `auto` still lets the engine use whichever recogniser it has.
- **A result the engine was not sure of is labelled as such.** Each phrase comes
  back with a confidence; below `DICTATION_CONFIDENCE_FLOOR` (0.55) the
  transcript is shown with a warning that says the engine was not confident and
  points at Whisper, instead of being presented as settled text. A confident
  dictation carries a one-line note saying it was dictated on this PC.
- It exists in the desktop app only. The web client has no such engine and keeps
  the server default.

**Vexium Core cannot fill this gap** — it is a text model, so it can read and
write, but it cannot hear audio. Speech to text needs a speech model, which is
what this engine or one of the three servers below is.

### Setting up a server instead

The first run is not a dead end either way. The Transcribe tab carries a **Set
up a server** panel that:

1. says what the engine is for and why Vexium Core is not it,
2. lists one copyable command per engine, and
3. has a **Scan this machine** button that probes `127.0.0.1:8080`
   (whisper.cpp), `127.0.0.1:8000` (local-whisper) and `127.0.0.1:8001`
   (OpenAI-compatible). If one answers, **Use this server** writes it into the
   settings and the next check reports READY.

The panel also appears inside **Engines and languages**. Opening Lexium checks
the configured engine once, so a server that is already running shows READY
without looking for the button.

### One click: Whisper on this machine

The first row of that panel is now the shortest path, and it needs no command.
**Download and start** fetches the whisper.cpp server and one speech model into
app data, checks both against their SHA-256, unpacks the archive and runs the
server on `127.0.0.1`. Lexium is pointed at it as soon as it answers, so the
next transcription works. Nothing is uploaded and no account is involved.

| Model | Size | Notes |
| --- | --- | --- |
| Whisper tiny | 74 MB | The smallest multilingual conversion |
| **Whisper base** (default) | 141 MB | The one worth spending |
| Whisper small | 465 MB | Slower, more accurate |

- The three are **multilingual conversions**, never the `*.en` files: an
  English-only model answers a Turkish recording with confident English, which
  is exactly the failure this feature exists to prevent.
- This is the engine for **accents, music and singing**, where the PC dictation
  engine cannot follow. It is a real Whisper model, not a dictation grammar.
- The button is one action: download what is missing, then start. **Stop the
  engine** stops it, **Start the engine** brings it back with the model selected,
  and a downloaded model can be removed again to free its space.
- Files live under `<userData>/speech`: `bin/whisper-server.exe` with its DLLs,
  `models/<id>.bin`, and `kryvex-speech.json` recording what was installed and
  verified. The archive, the staging folder and any partial download are removed
  as soon as the install finishes or fails.
- **Start with Kryvex** keeps the engine across launches. The switch is stored
  in `kryvex-speech.json` and read by the main process, so the engine comes up
  at launch before Lexium is ever opened and goes down with the app; turning the
  switch on starts it at once, and turning it off stops it rather than leaving a
  server running behind a switch that says otherwise. A fresh profile has
  nothing installed, so an on switch starts nothing until the download exists.
  Lexium adopts the address of an engine Kryvex started for it (a model still
  loading at launch is waited for), so the next transcription works without a
  press; an engine started by hand is still selected by the user.
- The server binds **loopback only**, on port 8129 (or an OS-assigned port if
  that one is taken). Quitting waits for the child to be gone rather than only
  for the kill to be sent, so a restart does not find a server holding the port.
- It is Windows x64 only, because that is the release build measured here. The
  web client, and other platforms, keep the server options below.

The versions are pinned, not followed: `whisper-bin-x64.zip` from the
`ggml-org/whisper.cpp` release `b5454`
(`6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb`, 8,928,640
bytes) and the GGML models from `ggerganov/whisper.cpp` on Hugging Face, each
with its byte count and SHA-256 recorded in `electron/speech-catalogue.ts`. A
changed upstream file fails the check instead of being installed.

Licences: whisper.cpp is MIT, and the model files are OpenAI's Whisper weights
(MIT), converted by the same project. Kryvex adds no licence text of its own to
redistribute, because nothing is bundled: both are downloaded from their own
release pages on request. See [ATTRIBUTION.md](ATTRIBUTION.md).

Anything else on the page still works: the manual commands below are for anyone
who already runs their own server.

### local-whisper

The [local-whisper](https://github.com/neromorph/local-whisper) app exposes
`POST /transcribe` on port 8000 and accepts `.mp3` and `.wav` directly.

```bash
git clone https://github.com/neromorph/local-whisper
cd local-whisper
docker compose up --build
# or, in a Python environment with the project's dependencies:
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Fields sent: multipart `file`, `model` (`tiny` … `turbo`), `language` (`auto`
by default) and `task=transcribe`.

### whisper.cpp server

Best when you already keep GGUF models around. It reads WAV only, which is
exactly what Lexium uploads.

```bash
./build/bin/whisper-server -m models/ggml-base.bin --host 127.0.0.1 --port 8080
```

Endpoint: `POST /inference` with `file`, `language` and
`response_format=verbose_json`. The server sends `Access-Control-Allow-Origin: *`,
so the renderer can call it directly. The model is chosen at launch, not by the
app.

### OpenAI-compatible

Any server that implements `POST /v1/audio/transcriptions` (faster-whisper
server, LocalAI, a hosted gateway) works. Set the base URL, for example
`http://localhost:8080`, and the model name.

### Why a server at all

Kryvex bundles no weights. A speech model is hundreds of megabytes, changes per
release, and belongs to whoever runs it. The app does the part it can do well:

- decode any format Chromium can read (MP3, M4A, AAC, WAV, OGG, Opus, FLAC,
  WebM, MP4) with the Web Audio API,
- downmix to mono and resample to 16 kHz,
- encode a 16-bit PCM WAV in memory,
- upload that to the engine and parse the transcript out of every supported
  envelope.

That means the server never needs `ffmpeg` for an imported MP3, and the original
file is not uploaded in its original format.

## Translation engines

The primary target is a [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)
server:

```bash
docker run -ti --rm -p 5000:5000 libretranslate/libretranslate
```

`POST /translate` with `q`, `source` (`auto` allowed), `target`, `format=text`
and an optional `api_key`. A hosted instance needs the key; a local one does
not.

If the configured server cannot be reached, Lexium falls back to the keyless
[MyMemory](https://mymemory.translated.net/) API and labels the answer in the
result header (`MyMemory`) plus a warning under the button. Source language is
the local guess when it is specific, and the API's own `autodetect` only when
the text is ambiguous. Long text is split at sentence boundaries for that API's
500-byte limit.

The fallback can be avoided entirely by pointing at your own server and keeping
it running. There is no Kryvex proxy and no account.

## Image reading

Tesseract is fetched once from jsDelivr, as a `<script crossorigin="anonymous">`.
The UMD build is used deliberately: a dynamic `import()` of the same URL is
blocked by Chromium's third-party cookie rules the first time the CDN answers
with a cookie (`ERR_BLOCKED_BY_RESPONSE.NotSameSite`). Language packs are
downloaded on demand and cached by the browser.

Supported packs are listed in the UI (English, Turkish, German, French, Spanish,
Italian, Portuguese, Dutch, Russian, Ukrainian, Polish, Romanian, Greek, Arabic,
Hebrew, Hindi, Japanese, Korean, Chinese simplified/traditional, Vietnamese,
Thai, Indonesian, Swedish, Danish, Finnish, Norwegian, Czech, Hungarian,
Bulgarian, Serbian, Croatian, Slovak).

The CDN needs to be reachable the first time. After that the browser cache is
usually enough; a fully offline machine cannot run the reader.

## Limits and failure modes

| Limit | Value |
| --- | --- |
| Audio file | 150 MB, any decodable format |
| Image file | 20 MB, PNG/JPEG/WebP/BMP/GIF |
| Translation text | 20,000 characters |
| Transcript history | None: the transcript lives in the page until you leave it |

- **No answer / offline**: the engine is not running, the address is wrong, or
  a browser blocked the request. The failure now expands **Set up a server**
  in the Transcribe tab, so the engine Kryvex can install itself, and the command
  to start one by hand, are both one click away. A page served over **HTTPS cannot call a plain
  `http://` engine on your LAN**; only `http://localhost` is exempt. Run the
  client locally, put the engine behind HTTPS, or use a tunnel.
- **A download that did not work**: the panel names the cause rather than
  guessing — unreachable, out of disk space, a checksum that did not match, an
  archive that would not unpack, or a server that would not start (with its own
  last lines of output behind **What the server said**).
- **The PC engine**: four separate answers, because they need four different
  fixes — this build cannot run one (the web client), this machine has no
  recogniser installed (add a language with speech in Windows settings), the
  chosen language has no recogniser here (add that language, or use Whisper; the
  engine will not answer in another language), or the recogniser could not be
  started (start a server instead).
- **The PC engine was not sure**: a low-confidence dictation is flagged in the
  result rather than silently quoted. Music, singing, an accent or several
  speakers is the usual cause; a Whisper server is the answer.
- **HTTP 4xx/5xx**: the server answered but rejected the request. Check the
  engine path (`/transcribe`, `/inference`, `/v1/audio/transcriptions`) and the
  model name.
- **Empty transcript**: the engine heard nothing usable. Check the language
  setting and whether the recording actually has speech.
- **Decode error**: the file is DRM-protected or uses a codec this Chromium
  build cannot decode. Export it as WAV or MP3 and retry.

## Verification

`pnpm verify:lexium-speech` (Windows) synthesises a WAV with the same Windows
speech stack, converts it to the 16 kHz mono payload the renderer sends, and
runs the real main-process module and proxy: probe, transcription, the reported
confidence and verdict, the proxy path, the refusal of an empty upload, and the
refusal of a language this machine has no recogniser for (Turkish first). It
needs no network and no model. Last run: confidence `0.844`, verdict `ok`,
culture `en-US`, and `tr is not installed (en-US)` refused with no text.

`pnpm verify:lexium-language` (Windows) drives the built **app**: it loads a real
WAV through the real file input, with Turkish selected on a machine whose only
recogniser is English. The request is refused in milliseconds with the message
above and no transcript; switching to English then transcribes the same file and
labels the result as dictated on this PC. Last run: **12/12 PASS**.

`pnpm verify:speech` exercises the one-click engine end to end on the real
network and the real CPU: it downloads the pinned build and model with the real
module, hashes the model that landed on disk against the pinned SHA-256, checks
that no partial, archive or staging file survived, starts the server, synthesises
a phrase with the Windows speech stack, transcribes it through the same proxy the
renderer calls (`language=en`, `auto` and `tr`, plus timed segments for `.srt`),
then stops the engine, proves the listener is gone, removes the model and proves
it cannot be started again. `--model=base` selects the default model, `--root`
reuses an install and `--keep` keeps the profile. Last run: **PASS** on `base`
(147,951,465 bytes verified, `The quick brown fox jumps over the lazy dog.`, 1
segment, Turkish accepted, listener gone after stop).

`pnpm verify:speech-bridge` drives the built **app** and downloads nothing: it
checks that the shell window exposes the bridge, that the reviewed catalogue
arrives intact, that a model id outside it is refused before anything is
downloaded, that opening Lexium renders the card with the three models and the
**Download and start** button, and that merely opening the panel installs
nothing. Last run: **PASS**.

## Privacy

With the PC engine nothing leaves the machine at all: the audio is recognised on
this device. With a server engine, audio is sent only to the address in the engine panel, over the URL you typed.
The original file, the transcript, the translation and the image are never
uploaded to Kryvex. Translation text goes to the configured server, or to
MyMemory only when that server is unreachable. Nothing is written to the state
file or to `localStorage`; leaving the page clears the working set.
