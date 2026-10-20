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
