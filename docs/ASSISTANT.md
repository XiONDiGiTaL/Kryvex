# Vexium assistant

Vexium is Kryvex's first-party assistant surface. It chats with a language model
that the user already runs on their own machine — Ollama or LM Studio — and it
never talks to a cloud endpoint. There is no account, no API key, no telemetry,
no bundled weights and no prompt history on disk.

## Boundary

| Concern | Where it lives |
| --- | --- |
| UI | `src/views/Assistant.tsx` (route `#/assistant`) |
| Runtime settings | `settings.assistant` — `{ provider, baseUrl, model }` |
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

- `GET /v1/models` — model list (also accepts Ollama's `{ models: [{ name }] }`).
- `POST /v1/chat/completions` with `stream: true` — SSE deltas.

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
- The runtime is the user's choice, then `<userData>/bin`, then `resources/bin`,
  then PATH. A `.js`/`.mjs`/`.cjs` path runs on Electron's own Node with
  `ELECTRON_RUN_AS_NODE=1`, which covers launcher wrappers.
- `Stop server`, quitting the app and switching files all kill the child; the
  config (path, runtime, context, GPU layers) is stored in
  `kryvex-local-model.json` beside the other state, never in the renderer.
- When a start succeeds the renderer points `settings.assistant` at the new
  loopback origin and switches the provider to `local`, so the existing probe,
  model list and streaming path are reused unchanged.

Model weights are never downloaded, bundled or uploaded. **Get models** only
opens Hugging Face's GGUF catalogue, Ollama's library and LM Studio's models.

## What stays private

Conversations live in React state for the current window only. Closing the app
or opening **New chat** discards them: no transcript file, no state entry, no
telemetry. The settings that persist are the runtime address and the chosen
model.

## Failure states

- **Offline** — no runtime answers on the port: the view explains how to start
  Ollama or LM Studio and offers **Check again** and **Runtime settings**.
- **Desktop only** — the web preview has no bridge and no loopback access, so
  the panel says so instead of pretending to be offline.
- **HTTP / unauthorized** — surfaced with the status code and a hint to disable
  key requirements for loopback.
- **Stop** — cancels the request; whatever streamed so far stays on screen.

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
  reply arrives, and `stop()` ends the process. Inference speed still depends
  on the user's llama.cpp build and hardware and was not measured here.

## Reviewed model downloads

Settings → Vexium → **Download models** fetches exactly one artifact: the pinned
Qwen2.5-1.5B-Instruct Q4_K_M GGUF recorded in
[VEXIUM_MODELS.md](VEXIUM_MODELS.md). No weights are bundled, no request is made
at launch, and inference is unchanged — the file is handed to the existing
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

Not verified: a real `llama-server` start against the downloaded file, and an
end-to-end 1.1 GB transfer on a slow or dropping connection. The redirect hop
was measured once with a `HEAD` request, not under every CDN region.
