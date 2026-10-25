# Vexium assistant

Vexium is Kryvex's first-party assistant surface. **Vexium Core** is the
supported local stack: the Vexium surface, the llama.cpp CPU runtime included in
the installer, and the reviewed Qwen2.5-3B-Instruct weights, published as
Kryvex's own release asset and fetched once with the user's click. It never
talks to a cloud endpoint. There is no account, no API key, no telemetry, no
bundled weights and no prompt history on disk. Ollama, LM Studio and a custom
GGUF remain available as alternative runtimes.

## Vexium Core

| Part | What it is |
| --- | --- |
| Surface | Vexium at `#/assistant`; the renderer never reaches the model server. |
| Runtime | llama.cpp `b11835` (commit `f64a49819`), CPU build, shipped in `resources/bin`. |
| Weights | `vexium-core-3b-q4_k_m.gguf` (Qwen2.5-3B-Instruct, Q4_K_M), published on `XiONDiGiTaL/Vexium-Core` release `v2`; byte count and SHA-256 pinned in `electron/model-catalogue.ts`. |
| Light core | `qwen2.5-1.5b-instruct.gguf` stays in the catalogue as **Vexium Core Light** for machines without the memory; its id and filename never change, so an existing install keeps working. |
| Licence | Apache-2.0, with the Qwen publisher, repository and licence shown on the card and in the installed list. |
| Default | New state uses the `local` provider at `http://127.0.0.1:8080`; an existing saved provider is preserved. |

**Attribution is not optional.** The card names the product **Vexium Core** and
keeps `Qwen2.5-1.5B-Instruct`, Qwen (Alibaba Cloud), the pinned revision and
Apache-2.0 visible directly under it. Kryvex packages the runtime and verifies
the downloaded file; it does not claim the weights as its own model.

**One-click install.** The Vexium page's core card carries **Install Vexium
Core 3B · 1.96 GiB**: one press downloads the release asset with its progress
bar and checksum check, configures the path and starts the runtime, then points
Vexium at the loopback port it chose (`useVexiumCore().install`). When the light
core is installed instead, the same button reads **Switch to Vexium Core 3B**.
The Settings model manager keeps the separate Download and Start buttons, and a
custom `.gguf` still uses Choose model and Start server.

**First run insists on Vexium Core.** On a machine with no core, the Vexium page
says **Vexium Core is not installed.**, states the one-time size, and offers the
same install action in the empty thread, so the download happens inside the app.
While the core is missing, the generic “no runtime is answering” notice and the
Hugging Face **Get a model** link are suppressed: the app does not send a
first-run user off to find some other local AI. Ollama, LM Studio and a custom
GGUF stay reachable through Runtime settings for people who already run one.
Until the core is installed the built-in responder still answers workspace
tools and offers a web search.

**Configured is not running.** When a file is selected but the local server is
stopped, the Settings **Model** row names that file and offers **Start Vexium
Core** beside the selector, rather than reporting “0 models” as if nothing were
installed. The runtime may report no models until it is started; that is a
stopped process, not a missing model. The Vexium page carries the same action:
its **Vexium Core** card shows what is installed, the active build with its
context size and loopback origin, and the state (RUNNING, STARTING, STOPPED),
with **Start Vexium Core** or **Stop server** beside it.

**On launch.** A started runtime is the default, so Kryvex starts it for you
when the saved provider is `local`, a model file is already configured, and the
server is `stopped` or `idle` (`shouldAutoStartCore` in
`src/lib/vexium-core.ts`). A saved error is left alone: retrying a missing or
broken file on every launch would only hide the reason. Nothing starts when no
file is configured or another provider is selected, and no weights are ever
downloaded at launch.

**One-time move off Ollama.** A profile that never touched the assistant was
stored as `ollama` at Ollama's stock `127.0.0.1:11434` with no model. That is
indistinguishable from untouched defaults, so on the next launch it is switched
to `local` at `127.0.0.1:8080` once, and a `migrated` flag is written; a user
who later chooses Ollama, LM Studio or their own address keeps that choice.

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

Defaults: Vexium Core `http://127.0.0.1:8080` until its server reports the port
it picked, Ollama `http://127.0.0.1:11434`, LM Studio `http://127.0.0.1:1234`.
All three expose an OpenAI-compatible API, so one client covers them:

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

## Identity and sampling

The runtime never receives the conversation bare. `buildMessages()` in
`electron/assistant-rules.ts` puts one system turn in front of it: the
`VEXIUM_SYSTEM_PROMPT` identity (local, concise, allowed to answer ordinary
factual questions, honest when it does not know, never claiming to browse), the
current date, and any verified tool facts. A `system` turn supplied by the
renderer is dropped, so the only system message is the one the main process
wrote.

Sampling is deliberately low for a helper: `temperature 0.3`, `top_p 0.9`,
`max_tokens 768` (`GENERATION` in the same module). Before 0.9.2 the request
carried `temperature: 0.7` and no system turn at all, which is why a 1.5B model
opened ordinary questions by refusing to discuss "copyrighted material"
(docs/VEXIUM_MODELS.md §15 records the measurements that came from).

## Workspace tools

A local model of this size cannot be trusted with arithmetic, units, distances
or dates, so those answers do not come from it. `src/lib/assistant-tools.ts` is
pure and deterministic:

| Tool | Recognises | Source of truth |
| --- | --- | --- |
| `distance` | "how far is X from Y", "distance between X and Y" | great-circle maths over a bundled place table (countries and major cities) |
| `units` | "12 km to miles", "100 f to c", "2 gb to mib" | a factor table with temperature handled separately |
| `arithmetic` | "18% of 240", "(12 + 8) * 3", "12 divided by 4" | a recursive-descent evaluator: no `eval`, no `Function` |
| `datetime` | "what's the date", "days between A and B", "30 days from today" | the local clock and the parsed dates |

A matched answer is sent with the request as a `facts` line, is appended to the
system turn as "Verified by Kryvex's own tools", and is shown in the transcript
with a `WORKSPACE TOOL` label when no model is running. `sanitizeFacts()` allows
one line under 1,200 characters with no control characters, so a fact block can
never turn into instructions. A question no tool recognises reaches the model
unchanged; when the reply still sounds unsure, the existing search button
offers the web instead of a dead end.

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
