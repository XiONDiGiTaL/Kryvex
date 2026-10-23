# Vexium assistant

Vexium is Kryvex's first-party assistant surface. It chats with a language model
that the user already runs on their own machine (Ollama or LM Studio) and it
never talks to a cloud endpoint. There is no account, no API key, no telemetry,
no bundled weights and no prompt history on disk. The llama.cpp CPU runtime is
included, so a downloaded GGUF can be started without a separate install.

## Boundary

| Concern | Where it lives |
| --- | --- |
| UI | `src/views/Assistant.tsx` (route `#/assistant`) |
| Runtime settings | `settings.assistant`: `{ provider, baseUrl, model }` |
| Transport | `electron/assistant.ts` (main process, streaming) |
| Validation | `electron/assistant-rules.ts` (pure, unit-tested) |
| Bridge | `assistantProbe`, `assistantChat`, `assistantCancel`, `onAssistantDelta` |
| Model file | `electron/local-model.ts` + `electron/local-model-rules.ts` |
| Model bridge | `modelStatus`, `modelChoose`, `modelChooseBinary`, `modelStart`, `modelStop`, `modelConfigure` |

The renderer never calls the model server. The main process does, for three
reasons: no CORS negotiation, no chance for a service webview to reach a
loopback port, and one place to enforce the address rule.

## Loopback-only rule

`normalizeAssistantUrl` accepts a plain `http` origin on `127.0.0.1`,
`localhost` or `[::1]`, with an optional trailing slash or `/v1`, and rejects
everything else: other hosts, `https`, credentials, paths, query strings and
fragments. The main process normalizes again on every request, so a saved
setting cannot smuggle in a remote host. `src/lib/assistant.ts` keeps the same
rule for the form; a unit test asserts the two copies agree.

Defaults: Ollama `http://127.0.0.1:11434`, LM Studio `http://127.0.0.1:1234`.
Both expose an OpenAI-compatible API, so one client covers both:

- `GET /v1/models`: model list (also accepts Ollama's `{ models: [{ name }] }`).
- `POST /v1/chat/completions` with `stream: true`, SSE deltas.

## Streaming

`Assistant.chat()` validates a `{ requestId, baseUrl, model, messages }` request,
posts it, reads the SSE body with a `TextDecoder`, and forwards each
`choices[0].delta.content` to the window as `kryvex:assistant:delta`. The
promise resolves when the stream ends, the user cancels (`assistantCancel`) or
the runtime goes quiet for two minutes. Probe requests time out after four
seconds.

Limits are enforced before anything leaves the app: at most 40 messages, 8,000
characters per message, 24,000 total, the last message must be `user`, and a
model id must be a non-empty string without control characters.

## Run a model file

A runtime is not the only route. **Run a model file** takes a `.gguf` the user
already downloaded and starts llama.cpp's `llama-server` against it:

- `local-model-rules.ts` is pure: `isGgufPath`, `buildServerArgs`,
  `clampContext`, `clampGpuLayers`, `binaryCandidates`, `tailLog`. Arguments
  always bind `--host 127.0.0.1`, so the server is never exposed to the LAN.
- `local-model.ts` owns the process: it asks the OS for a free port, spawns the
  runtime with piped output, polls `/v1/models` every 700 ms for up to three
  minutes (a large GGUF loads slowly), and reports `starting → running` or an
  error with the last lines of output.
- The runtime is the user's choice, then `<userData>/bin`, then the bundled
  `resources/bin` (or `runtime/bin` in a source checkout), then PATH. A
  `.js`/`.mjs`/`.cjs` path runs on Electron's own Node with
  `ELECTRON_RUN_AS_NODE=1`, which covers launcher wrappers.
- `Stop server`, quitting the app and switching files all kill the child; the
  config (path, runtime, context, GPU layers) is stored in
  `kryvex-local-model.json` beside the other state, never in the renderer.
- When a start succeeds the renderer points `settings.assistant` at the new
  loopback origin and switches the provider to `local`, so the existing probe,
  model list and streaming path are reused unchanged.

Model weights are never downloaded, bundled or uploaded. **Get models** only
opens Hugging Face's GGUF catalogue, Ollama's library and LM Studio's models.

### Bundled runtime

The installer carries llama.cpp `b11835` (commit `f64a49819`) for the build's
architecture, extracted from the official Windows CPU release. It is a CPU
build, so it starts on a machine with no GPU runtime; `--n-gpu-layers` is
accepted and ignored as llama.cpp reports `no usable GPU found`. Pointing the
panel at a Vulkan, CUDA or Metal build remains the route to acceleration.

- **Build-time fetch:** `scripts/fetch-runtime.mjs` pins the release tag, asset
  name, byte size and SHA-256, verifies the archive before extraction, refuses
  paths and non-allowlisted files, and writes `runtime/bin/runtime.json` with
  the release and per-file sizes. `package:dir` and `package:win` run it first.
- **What ships:** `llama-server.exe`, `llama-server-impl.dll`, `llama-common`,
  `llama`, `ggml`, `ggml-base`, the `ggml-cpu-*` backends, `mtmd`, `libomp`,
  and both license files, about 45 MB unpacked. The other llama.cpp tools in
  the ZIP (benchmark, quantize, server-RPC and the rest) are not shipped.
- **Source checkouts:** run `npm run fetch:runtime` once. `runtime/` is
  gitignored, and the main process falls back to it while `app.isPackaged` is
  false. A packaged build never looks at the source directory.
- **Status:** `LocalModelStatus.bundled` and `runtimeVersion` report where the
  executable came from; the Settings row says it is included and shows the
  llama.cpp release next to the path.

The runtime runs only against the chosen GGUF on a loopback port, exactly as a
user-supplied build did. It opens no listener on a LAN interface, receives no
configuration from the renderer, and is killed with the app.

## What stays private

Conversations live in React state for the current window only. Closing the app
or opening **New chat** discards them: no transcript file, no state entry, no
telemetry. The settings that persist are the runtime address and the chosen
model.

## Failure states

- **Offline**, no runtime answers on the port: the view explains how to start
  Ollama or LM Studio and offers **Check again** and **Runtime settings**.
- **Desktop only**: the web preview has no bridge and no loopback access, so
  the panel says so instead of pretending to be offline.
- **HTTP / unauthorized**: surfaced with the status code and a hint to disable
  key requirements for loopback.
- **Stop**: cancels the request; whatever streamed so far stays on screen.

## Verification

- Unit tests: `tests/assistant.test.ts` (address rule parity, message
  sanitizing, SSE parsing, model listing, settings defaults).
- End-to-end: a stand-in OpenAI-compatible server on `127.0.0.1:11434` was used
  to drive the built app; it received `{ model: 'llama3.2', messages, stream: true }`
  and the reply streamed into the view. Remote and `https` addresses were
  refused by the main process. No real model runtime was installed on the test
  machine, so model quality and speed were not measured.
- Model file: `pnpm run verify:model` drives the real `LocalModel` manager
  against `scripts/fake-llama-server.mjs` and a placeholder `.gguf`. It checks
  the path and runtime are stored, a non-GGUF path is refused, the server
  starts on loopback, `/v1/models` reports the file's name, a streamed chat
  reply arrives, and `stop()` ends the process.
- Bundled runtime, measured on 2026-10-23: the downloaded starter GGUF
  (`qwen2.5-1.5b-instruct-q4_k_m.gguf`, 1,117,320,736 B, SHA-256 verified) was
  started through `dist-electron/local-model.js` in Electron with no runtime
  path configured. `modelStatus()` reported
  `runtime/bin/llama-server.exe`, `bundled: true`, `runtimeVersion: b11835` and
  `binaryFound: true`; the server was ready in about 1.2 s, a 41-token prompt
  produced 31 tokens at 34.7 tokens/s, and a streamed chat reply arrived in
  647 ms and 741 ms on two runs. `stop()` left phase `stopped` and no process.
  This is CPU inference on the build machine; other hardware will differ.
- Packaged app, same day: the unpacked build carried 24 runtime files in
  `resources/bin`, its `llama-server.exe --version` reported build 11835, and a
  CDP-driven run with a disposable profile showed `Included with Kryvex`,
  `llama.cpp b11835` and the included-runtime sentence in Settings. `modelStart()`
  launched the copy under `resources`, a streamed reply arrived through the real
  assistant IPC, and `modelStop()` ended it. The standard packaging script
  needed a temporary `pnpm` shim and the existing unpacked Electron in this
  environment; the shipped configuration itself is what was tested.
- Settings UI end to end, same day: **Download** moved `8.60 MiB` to `1.01 GiB`,
  showed `Verifying the checksum…`, and installed the pinned 1,117,320,736-byte
  file. **Use this model** and **Start server** reached `running` with
  `bundled: true` and `runtimeVersion: b11835`; Vexium showed `RUNTIME ONLINE`,
  answered `I am an AI assistant created by Alibaba Cloud to help with various
  tasks and provide information on various topics.`, and **Stop server** left
  the phase `stopped`. A first capture read only the first delta (`I am a`)
  because it stopped when the typing dots disappeared; the corrected wait used
  the request ending, not the dots, and read the full streamed answer.

Not verified: arm64 packaging on real hardware, GPU acceleration through a
user-supplied build, and inference on a memory-constrained machine.

## Reviewed model downloads

Settings → Vexium → **Download models** fetches exactly one artifact: the pinned
Qwen2.5-1.5B-Instruct Q4_K_M GGUF recorded in
[VEXIUM_MODELS.md](VEXIUM_MODELS.md). No weights are bundled, no request is made
at launch, and inference is unchanged: the file is handed to the existing
`LocalModel` path only when the user presses **Start server**.

| Concern | Where it lives |
| --- | --- |
| Catalogue | `electron/model-catalogue.ts` (compiled in, one entry) |
| Policy | `electron/model-rules.ts` (pure: URL, host, redirect, size, hash, path) |
| Transfer | `electron/model-download.ts` (main process only) |
| Library | `userData/kryvex-models.json`, written after verification only |
| Bridge | `modelsCatalogue`, `modelsInstalled`, `modelsDownload`, `modelsCancel`, `modelsDelete`, `onModelProgress` |
| UI | `src/components/ModelManager.tsx`, helpers in `src/lib/local-models.ts` |

The renderer sends a **catalogue id**; the main process owns every URL, host,
byte count and path:

- one pinned revision and filename per entry, so a branch name cannot shift the
  artifact underneath the catalogue;
- HTTPS only, no credentials, no fragment; hosts are `huggingface.co` and
  `.hf.co` subdomains (the measured hop was `us.aws.cdn.hf.co`);
- redirects are followed by hand, re-validated per hop and capped at three;
- the response must match the pinned byte count; the body is streamed to
  `<id>.part` under `userData/models`, capped at the pinned size;
- the finished file is re-hashed from disk and must match the pinned SHA-256
  before an atomic rename; a failure or cancel deletes the part file;
- free space is checked first (`statfs`), and a `.part` left by a crash is
  swept on the next launch;
- deletion resolves an id from the library, requires confirmation, refuses a
  model the running server is serving, and never touches an imported file;
- installing never stops, replaces or restarts a model.

The card discloses publisher, source, revision, filename, exact bytes, SHA-256,
licence, quantisation, architecture, estimated memory (labelled an estimate),
languages, capabilities and limits, plus whether `llama-server` was found.

### What was verified in the built app

Driving the built Electron app through CDP on 2026-10-22:

- the panel rendered the pinned facts (`1,117,320,736` B and the full SHA-256)
  with a single **Download** action, and no request was made before it;
- after the click the progress bar reported `264 MiB of 1.04 GiB` / `24%`;
- the install finished with `1,117,320,736` bytes on disk and a locally
  recomputed SHA-256 of
  `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`, matching
  the catalogue; only the `.gguf` remained, no `.part`;
- **Use this model** pointed `modelStatus().path` at the installed file and left
  it `stopped` (no `llama-server` on that machine);
- **Delete → Remove** emptied `kryvex-models.json`, removed the file and showed
  “The model file was deleted.”

A real `llama-server` start against this exact downloaded file is now covered
in **Verification** above. Still not verified: an end-to-end 1.1 GB transfer on
a slow or dropping connection, and the redirect hop under every CDN region (it
was measured once with a `HEAD` request).
