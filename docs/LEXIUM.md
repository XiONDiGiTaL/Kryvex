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

Open **Engines and languages** at the bottom of the page. Three request shapes
are supported, and nothing is contacted until you press a button.

### local-whisper (default)

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
  a browser blocked the request. A page served over **HTTPS cannot call a plain
  `http://` engine on your LAN**; only `http://localhost` is exempt. Run the
  client locally, put the engine behind HTTPS, or use a tunnel.
- **HTTP 4xx/5xx**: the server answered but rejected the request. Check the
  engine path (`/transcribe`, `/inference`, `/v1/audio/transcriptions`) and the
  model name.
- **Empty transcript**: the engine heard nothing usable. Check the language
  setting and whether the recording actually has speech.
- **Decode error**: the file is DRM-protected or uses a codec this Chromium
  build cannot decode. Export it as WAV or MP3 and retry.

## Privacy

Audio is sent only to the address in the engine panel, over the URL you typed.
The original file, the transcript, the translation and the image are never
uploaded to Kryvex. Translation text goes to the configured server, or to
MyMemory only when that server is unreachable. Nothing is written to the state
file or to `localStorage`; leaving the page clears the working set.
