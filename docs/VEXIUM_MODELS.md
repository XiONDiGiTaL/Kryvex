# Vexium local models: Phase 1 survey and proposal

Status: **approved and implemented.** XiØN approved the starter artifact in §5
on 2026-10-22, so Settings → Vexium → **Download models** now fetches exactly
that file (§13). No weights are bundled in the installer, nothing is fetched at
launch, and the inference path is unchanged. On 2026-10-23 the llama.cpp CPU
runtime itself was pinned and made part of the installer, so the local core no
longer depends on the user installing a runtime first (§14). The starter model
was then evaluated against that bundled runtime with a fixed prompt set (§15).
The supported stack is presented in the app as **Vexium Core**: the bundled
llama.cpp runtime plus this reviewed Qwen artifact. The product name never
replaces the upstream attribution; the card keeps Qwen, the publisher, the
pinned revision and Apache-2.0 visible beside it.

A nonfunctional UI sketch lives at
[mockups/vexium-models.html](mockups/vexium-models.html) with a rendered capture
at [media/vexium-models-mockup.png](media/vexium-models-mockup.png). Every control
in it is inert on purpose.

## 1. What "default model" means here

Vexium already runs inference through the user's own llama.cpp `llama-server`
(`electron/local-model.ts`, loopback only). This proposal adds **one** thing to
that path: a way to fetch an existing, pinned GGUF artifact, verify it, and
register it as a model the user may then start.

| Claim | True? |
| --- | --- |
| Kryvex trains a model | **No.** Vexium is an assistant surface, not a model. |
| Kryvex bundles weights | **No.** The installer now carries the runtime (§14), not the model. |
| Any download happens without a click | **No.** No download on first launch, at startup, or in the background. |
| A "default model" exists before approval | **No.** Recommended ≠ installed ≠ running. |
| Inference leaves the machine | **No.** It stays on `127.0.0.1`, unchanged. |

Three ideas stay separate and are not conflated anywhere in this plan:

1. **Installation**: fetch existing weights once, verify, keep them in
   `userData/models`.
2. **Retrieval**: hand approved documents to the model as context at request
   time. No embedding server, no vector database.
3. **Fine-tuning**: a separate, offline training project (§10). Not in the
   desktop installer, not in this release.

## 2. How the evidence below was obtained (2026-10-22)

- **Catalogue metadata**: Hugging Face REST API,
  `GET https://huggingface.co/api/models/<repo>?blobs=true`, read at the
  repository's own commit (`sha`), which is the revision quoted in §4. That
  response carries the `gated` flag, the card's `license` field, each file's
  exact byte `size`, and for LFS files the LFS `sha256` (Git LFS stores the
  content hash as the pointer oid, so this is the file's SHA-256).
- **Artifact identity**: the first 8 MiB of each GGUF were read with an HTTP
  `Range` request and the GGUF header parsed directly. That yielded
  `general.architecture`, block count, head counts, key/value lengths, context
  length, quantisation version and `general.file_type` **from the file itself**.
  No repository code was executed; nothing was downloaded in full.
- **Licence text**: `LICENSE` (or the card's embedded licence, for the Llama
  quant) fetched at the same pinned revision.
- **Runtime support**: `MODEL_ARCH` entries in
  `https://raw.githubusercontent.com/ggml-org/llama.cpp/master/gguf-py/gguf/constants.py`
  (`qwen2`, `qwen3`, `llama`, `gemma3`, `lfm2` all present on 2026-10-22).
- **ModelScope**: its public file API
  (`/api/v1/models/<repo>/repo/files?Revision=master&Recursive=true`) returns a
  per-file `Sha256`, so an integrity interface does exist. It is **deferred**,
  not integrated: its CDN redirect behaviour and any auth requirements were not
  verified. See §8.

Facts not verified by the above are marked **unverified** in place. Nothing here
is copied from memory: every size, hash, licence id and architecture string was
read from the pinned revision or the artifact header.

## 3. Comparison: three practical candidates

| | **A. Qwen2.5-1.5B-Instruct** | **B. Llama 3.2 3B Instruct** | **C. Qwen3-1.7B** |
| --- | --- | --- | --- |
| Publisher / repo | Qwen · `Qwen/Qwen2.5-1.5B-Instruct-GGUF` | Meta weights, quantised by bartowski · `bartowski/Llama-3.2-3B-Instruct-GGUF` | Qwen · `Qwen/Qwen3-1.7B-GGUF` |
| Commit | `91cad51170dc346986eccefdc2dd33a9da36ead9` | `5ab33fa94d1d04e903623ae72c95d1696f09f9e8` | `90862c4b9d2787eaed51d12237eafdfe7c5f6077` |
| File | `qwen2.5-1.5b-instruct-q4_k_m.gguf` | `Llama-3.2-3B-Instruct-Q4_K_M.gguf` | `Qwen3-1.7B-Q8_0.gguf` |
| Bytes (MiB / GiB) | 1,117,320,736 (1,065.6 / 1.041) | 2,019,377,696 (1,925.8 / 1.881) | 1,834,426,016 (1,749.4 / 1.708) |
| SHA-256 | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` | `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff` | `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a` |
| Licence | Apache-2.0 | Llama 3.2 Community Licence | Apache-2.0 |
| Commercial use | Yes, no threshold | Yes, under 700M MAU; attribution + naming duties | Yes, no threshold |
| Auth / gate | None | Repo is open; the licence is accepted by use | None |
| Arch in artifact | `qwen2` | `llama` | `qwen3` |
| Quantisation | Q4_K_M (`file_type` 15) | Q4_K_M (`file_type` 15) | Q8_0 (`file_type` 7): the only quant Qwen ships here |
| Est. RAM, 4k ctx | **≈1.5–1.7 GB** | ≈2.6–2.9 GB | ≈2.5–2.7 GB |
| CPU-first | **Yes** | Needs a comfortable 8 GB machine | Heavier KV cache than its size suggests |

The byte sizes, hashes, commit ids, licence ids and architecture strings are
read directly (§2); memory figures are estimates and say so.

Screened out before the table:

| Candidate | Why not |
| --- | --- |
| `google/gemma-3-1b-it-qat-q4_0-gguf` (commit `d1be121d36172a4b0b964657e2ee859d61138593`, 1,003,541,152 B, `gemma` licence, SHA-256 `95e5b8d891cd6a794f66c2a6fb59a41e9562b4660560b854274eceffb628b22a`) | `gated: "manual"`: an account, a gate acceptance and an access token are required, so it cannot be a one-click starter that works anonymously. The card itself returned HTTP 401 to this survey. |
| `LiquidAI/LFM2-1.2B-GGUF` (commit `5399e76c648f4eb8c053feb1ab747277dea5bf8b`, `LFM2-1.2B-Q4_K_M.gguf`, 730,893,248 B, SHA-256 `55175400e3f509a9616227afeffd58d87e80b9f628a5d3d54ada884d85221fed`, `lfm1.0`) | Smallest and fastest option, but the LFM Open Licence is a bespoke licence with a commercial revenue threshold, and `lfm2` is a very new architecture: an older user `llama-server` would refuse the file. Kept as a later "fast lane" candidate, not the starter. |
| `microsoft/Phi-3.5-mini-instruct-gguf` | The repository answered HTTP 401 to this survey, so its gate, licence file and artifact metadata could not be verified. Not considered further. |

## 4. Candidate detail

### A. Qwen2.5-1.5B-Instruct: **recommended starter**

| Field | Value |
| --- | --- |
| Publisher | Qwen (Alibaba Cloud), first-party GGUF repository |
| Repository | [`Qwen/Qwen2.5-1.5B-Instruct-GGUF`](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF) |
| Revision | `91cad51170dc346986eccefdc2dd33a9da36ead9` (repo `sha`, last modified 2024-09-20) |
| Base model | `Qwen/Qwen2.5-1.5B-Instruct` (instruction-tuned; GGUF made by the publisher, not a third-party re-quant) |
| File | `qwen2.5-1.5b-instruct-q4_k_m.gguf` |
| Size | 1,117,320,736 B = 1,065.6 MiB = 1.041 GiB |
| SHA-256 | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` (HF LFS metadata at the pinned revision; the downloader re-hashes) |
| Licence | Apache-2.0: `LICENSE` at the same revision opens "Apache License Version 2.0, January 2004" |
| Commercial use | Permitted; keep the licence and notices, state changes, no trademark grant, patent grant included. Kryvex distributes no weights, so its own obligation is to link the licence. |
| Auth / gate | None; anonymous download |
| Architecture | `qwen2`, 28 blocks, hidden 1,536, 12 Q heads / 2 KV heads, key/value length 128, native context 32,768 (all from the GGUF header) |
| llama.cpp | `qwen2` is a long-standing architecture; any 2024-or-later `llama-server` build knows it |
| Languages | Card: "**Multilingual support** for over 29 languages, including Chinese, English, French, Spanish, Portuguese, German, Italian, Russian, Japanese, Korean…", the four Kryvex languages are claimed. Tested on 2026-10-23 (§15): English is usable for short structural tasks, Spanish and French are fluent but drift on content and sentence count, and German produced broken grammar and false claims in this pass. |
| Context for first test | **4096**, which is already `DEFAULT_CONTEXT`; 8,192 is reasonable on a 16 GB machine, and the app clamps at 131,072 |
| Memory estimate | ≈1.04 GiB weights + 112 MiB KV @ 4k (f16, 2×28×2×128×2 B/token) + 0.3–0.6 GB runtime overhead ⇒ **≈1.5–1.7 GB resident**. Assumes CPU inference, f16 KV, no mmap savings counted, batch ≤512. Measured on 2026-10-23 (§15): 1.80 GB after load and 1.91 GB after the prompt set, slightly above this estimate. |
| Known limits | 1.5B instruction-following is shallow: unreliable multi-step reasoning, weak arithmetic (measured 14 instead of 18 in §15, hence the deterministic tools in §9), invented app specifics without provided context, and it drifts on long inputs. Useful for short conversational replies, rewriting, formatting and extraction from supplied text; not for analysis, and translation output needs review, especially German. |
| Unverified | Whether the 32,768 native context is stable beyond 8k on CPU. Tokens/s, resident memory and the four-language quality were measured in §15; one fixed run is not a broad benchmark. |

### B. Llama 3.2 3B Instruct: stronger option

| Field | Value |
| --- | --- |
| Publisher | Meta (weights) / bartowski (quantiser, `quantized_by: bartowski`) |
| Repository | [`bartowski/Llama-3.2-3B-Instruct-GGUF`](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) |
| Revision | `5ab33fa94d1d04e903623ae72c95d1696f09f9e8` |
| Base model | `meta-llama/Llama-3.2-3B-Instruct` (the card names it as `base_model`) |
| File | `Llama-3.2-3B-Instruct-Q4_K_M.gguf` |
| Size | 2,019,377,696 B = 1,925.8 MiB = 1.881 GiB |
| SHA-256 | `6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff` |
| Licence | Llama 3.2 Community Licence (`llama3.2`); the card embeds the agreement text |
| Commercial use | Permitted below 700 million MAU; above it a Meta licence is required (clause 2). Duties when distributed or exposed: provide the agreement, "prominently display 'Built with Llama'", keep the Notice file with "Llama 3.2 is licensed under the Llama 3.2 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.", and prefix a derived model's name with "Llama". Kryvex links to a file rather than redistributing it, but the model manager must show these duties before install. |
| Auth / gate | This quant repo is readable anonymously; Meta's own repo is gated. The licence is accepted by use. |
| Architecture | `llama`, 28 blocks, hidden 3,072, 24 Q / 8 KV heads, key/value length 128, trained context 131,072 (from the GGUF header) |
| llama.cpp | `llama` architecture, universally supported |
| Languages | Card front matter lists `en, de, fr, it, pt, hi, es, th`; GGUF `general.languages` holds 8 entries. Kryvex's four are covered on paper. **Not tested.** |
| Context for first test | 4096 (do not start at 131k; KV cost grows linearly) |
| Memory estimate | ≈1.88 GiB + 448 MiB KV @ 4k (f16, 2×28×8×128×2) + 0.3–0.6 GB overhead ⇒ **≈2.6–2.9 GB resident** |
| Known limits | Better at instructions and longer answers than A, still not a reasoning model; more RAM and roughly half the speed on the same CPU. The quantiser is a third party, so provenance is "Meta weights, bartowski quant", not "publisher GGUF". |
| Unverified | Tokens/s; whether 3B quality justifies double the download on an 8 GB machine. |

### C. Qwen3-1.7B: newer, but the wrong shape for a starter

| Field | Value |
| --- | --- |
| Publisher | Qwen, first-party GGUF |
| Repository | [`Qwen/Qwen3-1.7B-GGUF`](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF) |
| Revision | `90862c4b9d2787eaed51d12237eafdfe7c5f6077` |
| Base model | `Qwen/Qwen3-1.7B` |
| File | `Qwen3-1.7B-Q8_0.gguf`: the only quant in the repo |
| Size | 1,834,426,016 B = 1,749.4 MiB = 1.708 GiB |
| SHA-256 | `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a` |
| Licence | Apache-2.0 |
| Commercial use | Permitted on the same terms as A |
| Auth / gate | None |
| Architecture | `qwen3`, 28 blocks, hidden 2,048, 16 Q / 8 KV heads, key/value length 128, native context 40,960 |
| llama.cpp | `qwen3` is present in current llama.cpp; a build predating Qwen3 support would reject the file. The **exact minimum build was not verified here**: treat it as unverified. |
| Languages | Card: "Support of 100+ languages and dialects"; stronger multilingual claim than A. |
| Context for first test | 4096 |
| Memory estimate | ≈1.71 GiB + 448 MiB KV @ 4k (8 KV heads, not 2) + overhead ⇒ **≈2.5–2.7 GB** |
| Known limits | Twice the download and ~1.6× the RAM of A for the same parameter count, because only Q8_0 exists and its KV cache is four times larger. Thinking mode must be suppressed (`/no_think`) or a starter chat opens with reasoning dumps. Newer architecture, so older runtimes fail. |
| Unverified | Tokens/s; `/no_think` behaviour in `llama-server`'s chat template for this exact artifact; minimum runtime build. |

## 5. Recommendation and the approval request

**Recommendation: A, Qwen2.5-1.5B-Instruct, `qwen2.5-1.5b-instruct-q4_k_m.gguf`.**

Why: it is the only candidate that is simultaneously first-party, Apache-2.0
with no commercial threshold, ungated, quantised by its publisher, on an
architecture every recent `llama-server` already knows, and small enough that a
4 GB-free machine can hold it next to the app. It is also the only one whose KV
cache (2 KV heads) makes 8k context affordable on CPU. The tradeoff is honest:
Llama 3.2 3B writes better prose and follows harder instructions, at 1.8× the
download and roughly double the RAM; Qwen3-1.7B is newer and better at
languages but ships only Q8_0 and costs more memory than its parameter count
suggests.

Approval, if granted, covers **exactly** this artifact and nothing else:

| Item | Value |
| --- | --- |
| Repository | `Qwen/Qwen2.5-1.5B-Instruct-GGUF` |
| Revision | `91cad51170dc346986eccefdc2dd33a9da36ead9` |
| File | `qwen2.5-1.5b-instruct-q4_k_m.gguf` |
| Bytes | 1,117,320,736 |
| SHA-256 | `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` |
| Licence | Apache-2.0 |
| Source host | `huggingface.co` (+ the CDN host it redirects to, to be measured before the allowlist is fixed) |

Approval was granted for exactly this list and nothing wider: one artifact,
one revision, one hash. The shipped implementation is recorded in §13; the
sketch in [mockups/vexium-models.html](mockups/vexium-models.html) stays inert.

## 6. Phase 2: approved model manager (plan, not code)

Only after approval. Settings → Vexium → **Download models**.

Files, following the existing split of pure rules + main-process side effects:

| File | Role |
| --- | --- |
| `electron/model-catalogue.ts` | The reviewed catalogue: id, publisher, repo, revision, filename, bytes, sha256, licence id + link, arch, context, notes. **Compiled in**, not fetched. |
| `electron/model-rules.ts` | Pure, unit-tested: catalogue schema validation, eligibility (licence/commercial/arch/size), ranking, filename generation, redirect policy, size bounds, `sha256` formatting. |
| `electron/model-download.ts` | Main process only: HTTPS stream, allowlist, redirect validation, byte cap, hashing while streaming, `.part` file, atomic rename, cancel, cleanup, disk check. |
| `electron/local-model.ts` | **Unchanged** except a `configure({ path })` call after install. Inference path stays as it is. |
| IPC | `modelsCatalogue()`, `modelsInstalled()`, `modelsDownload(id)`, `modelsCancel(id)`, `modelsDelete(id, confirm)`. Ids, never URLs or paths. |
| `model-library.json` (userData) | `{ id, filename, bytes, sha256, installedAt, licence, revision }` per installed model. Written only after verification. |
| `src/views/Settings.tsx` + `src/lib/local-models.ts` | The panel and its view helpers; all strings via `t()` in en/es/de/fr. |

Flow, exactly as specified:

1. The card shows one artifact: publisher, repo + revision, filename, bytes,
   licence, quantisation, estimated memory (**labelled an estimate**),
   capabilities and limits, and whether a runtime is available.
2. **Download** is an explicit click on that one card. No download starts on
   launch; the only thing that may start by itself is the server for a model the
   user already installed, when the local provider is selected
   (`docs/ASSISTANT.md`, "On launch").
3. Progress shows bytes transferred and total, with **Cancel**.
4. The stream is hashed; completion requires exact byte count **and** SHA-256
   match. Only then is the `.part` renamed into `userData/models`.
5. **Use this model** calls the existing `modelConfigure({ path })`; **Start
   server** stays a separate button. A combined **Download and run** is allowed
   only with that second action disclosed in the same dialog.
6. A running model is never stopped, replaced or switched by an install.

Deletion: confirmation dialog, path resolved from `model-library.json`, and a
refusal for anything outside `userData/models`, for a running model, or for a
file the user imported by hand. Imported files are never deleted by the app.

## 7. Threat model

| # | Threat | Mitigation |
| --- | --- | --- |
| 1 | Renderer asks for an arbitrary URL or path | IPC accepts a catalogue **id** only; every URL, filename and size comes from the compiled catalogue. |
| 2 | Redirect to an unapproved host | Explicit host allowlist for the first hop **and** every redirect; redirect count bounded (≤3); final URL re-validated. |
| 3 | HTTPS downgrade | `http:` refused outright; no fallback on failure. |
| 4 | Credentials, loopback or private-network target | Reject URLs with userinfo, and any host resolving to loopback, link-local, RFC1918 or CGNAT ranges: the same guard `electron/assistant-rules.ts` applies to assistant URLs, extended to downloads. |
| 5 | Oversized or endless response | `Content-Length` must equal the pinned size; hard byte cap; abort on overflow; truncation detected and deleted. |
| 6 | Wrong or tampered bytes | SHA-256 pinned at the catalogue level, computed during the stream, compared before rename. Mismatch deletes the `.part`. |
| 7 | Path traversal via a filename | Filenames are generated (`<id>.gguf`); the remote name is never used as a path. Verified with `path.resolve` containment. |
| 8 | Symlink / TOCTOU on rename | Write inside `userData/models` with exclusive creation, then `rename` within the same directory; refuse to follow a symlink target. |
| 9 | Disk exhaustion | Stat the target volume, require free space ≥ size + margin, report the shortfall instead of failing mid-stream. |
| 10 | Partial file treated as installed | Install state comes from `model-library.json` + a re-stat of the file; `.part` files are never listed and are swept on launch. |
| 11 | Model silently replaces a running one | Install only writes the library; starting is a separate, explicit action. |
| 12 | Model output tries to run a tool | Structured tool requests validated by schema + allowlist against real app state (§9); no command, JS, IPC or path execution. |
| 13 | Model-card text carries instructions | All remote metadata is data, never prompt or code; it is displayed, escaped, and never fed to the model automatically. |
| 14 | Hardware fingerprint sent out | Recommendations computed locally; no hardware detail leaves the machine unless the user explicitly asks for a remote check, and then only a plain metadata GET (§8). |
| 15 | Token/credential leakage | The starter needs no HF token; the downloader has no auth header support in Phase 2. |
| 16 | Runtime supply chain | The installer now carries a pinned llama.cpp CPU build: tag, byte size and SHA-256 are fixed in `scripts/fetch-runtime.mjs`, the archive is verified before extraction, only `llama-server` and its DLLs are kept, and both license texts ship beside them. A user-selected or PATH runtime still takes precedence; model downloads and inference stay separate boundaries. |

## 8. Phase 3: discovery, deferred

Start with the reviewed catalogue compiled into the app (Phase 2). Remote
discovery, if added, is an explicit user action: one metadata request to the
Hugging Face API, no prompts, transcripts, documents, usernames or workspace
content, catalogue metadata cached only, an offline catalogue that always works,
and discovered candidates displayed **separately** from installable ones until
licence, provenance, compatibility, exact size, revision and integrity are all
verified. Popularity and benchmark claims are signals, not proof.

Ranking order: (1) runtime/arch compatibility, (2) licence eligibility,
(3) fit in a conservative memory budget, (4) download/storage footprint,
(5) task and language fit, (6) quality evidence and its limits. File size is
never presented as runtime memory use.

ModelScope: its file API does expose per-file `Sha256` (observed for
`Qwen/Qwen2.5-1.5B-Instruct-GGUF` and `Qwen/Qwen3-1.7B-GGUF`), so it is a
plausible second source. It stays a **source link + deferred adapter** until its
download redirects and CDN hosts are documented and measured: no scraping, no
unverified download path.

## 9. Assistant behaviour and tools

The starter handles short conversational replies, rewriting, formatting and
summaries of text the user pastes. The 2026-10-23 evaluation (§15) found that it
does not reliably follow strict sentence or bullet counts, performs weak
arithmetic, invents app facts without retrieval, and is not production quality
in German. It must not be sold as frontier reasoning, and it cannot know
current facts without a retrieval step.

Deterministic tools stay in the app and never go through the model: safe
arithmetic, local date/time, unit conversion, allowlisted navigation/search.
A model may *propose* a structured request; the app validates it against a
strict schema and allowlist, resolves targets from real state, confirms
state-changing actions and rejects destructive or unknown ones. The model never
reads services, tabs, files or page content on its own; "use this text" is a
future feature that requires an explicit selection and a visible scope.

Web search stays user-triggered and discloses that the query leaves the machine;
an entire conversation is never uploaded as a query.

## 10. Optional future fine-tuning (design note only)

Approved base model + licence-compatible data; never collect conversations
silently; separate consent for any contributed example; evaluate the tuned model
against its base on a fixed prompt set; keep base-model attribution and licence
duties; state hardware and cost explicitly; no training dependency in the
desktop installer. Kryvex's changing app facts are handled by retrieval of
maintained docs, not by fine-tuning.

## 11. Tests planned for Phase 2 (none written yet)

Catalogue schema and pinned-artifact validation; licence/arch/compatibility
eligibility; ranking against synthetic hardware profiles; confirmation and
cancellation paths; redirect allowlisting and HTTPS enforcement; rejection of
private/loopback destinations and arbitrary paths; size bounds, truncated
responses, hash mismatch and cleanup; **no network request before consent**; a
`.part` file never listed as installed; correct handoff to the existing
`LocalModel`; no transcript persistence; i18n audit and assistant regressions.

## 12. Not verified / open questions

1. Tokens/s, resident memory and the four-language quality for the starter:
   measured on 2026-10-23 against the bundled runtime (§15). The 3B and Qwen3
   candidates remain unmeasured.
2. The exact `llama.cpp` build that first supported `qwen3` (and `lfm2`); only
   the architecture strings in current master were confirmed.
3. Hugging Face CDN redirect hosts and their stability: the allowlist must be
   measured before implementation, not guessed.
4. The starter's en/es/de/fr quality has one fixed-set measurement (§15); it is
   not a broad language benchmark. The other candidates remain untested.
5. Gemma 3 1B's licence text: the repository is gated, so only its licence id
   and gate flag were read.
6. ModelScope download redirects, rate limits and auth behaviour.
7. Whether a 1.5B model is good enough for Kryvex help without retrieval: the
   plan assumes retrieval is required for app-specific facts. The 2026-10-23
   run supports that assumption; without the supplied sentence the model
   invented a description of Kryvex, and with it the answer was correct.

## 13. Phase 2 as built

The approved artifact is the only entry in `electron/model-catalogue.ts`, with
`productName: "Vexium Core"` and `name: "Qwen2.5-1.5B-Instruct"` kept separate.
The panel lives inside the existing Settings → Vexium block
(`src/components/ModelManager.tsx`), so it reuses the panel's scroll position,
theme tokens and focus styles instead of adding a second settings surface.

| File | What it does |
| --- | --- |
| `electron/model-catalogue.ts` | The pinned entry: repository, revision, filename, bytes, SHA-256, licence + link, quantisation, architecture, context, languages, capability/limit ids, memory estimate. |
| `electron/model-rules.ts` | Pure policy: host and URL allowlist, one-hop redirect resolution, catalogue validation, generated filenames, path containment, size/hash verdict, delete guard, free-space margin. |
| `electron/model-download.ts` | Main-process transfer: pinned URL, manual redirects, byte cap, streamed `.part`, re-hash from disk, atomic rename, library JSON, cancel, delete, `.part` sweep. |
| `electron/main.ts` | Five IPC handlers, all guarded by `isShellSender`, taking an id only. |
| `electron/preload.ts`, `src/types.ts` | `modelsCatalogue`, `modelsInstalled`, `modelsDownload`, `modelsCancel`, `modelsDelete`, `onModelProgress`. |
| `src/components/ModelManager.tsx`, `src/lib/local-models.ts` | The card, progress bar (`role="progressbar"`, `aria-valuenow`), cancel, use, confirm-delete, size/memory formatting and failure-key mapping. |
| `src/lib/i18n-models.ts` | English keys plus es/de/fr copy, merged in `i18n.tsx` after the tool copy. |
| `tests/model-rules.test.ts` | 17 deterministic tests: catalogue shape and pinned facts, host/URL policy, redirects, path containment, delete guard, size/hash verdicts, progress clamping, panel formatting. |

Host allowlist, measured rather than guessed: `HEAD` on the pinned resolve URL
returned `302` to `us.aws.cdn.hf.co` (Xet bridge) with
`content-length: 1117320736` and `accept-ranges: bytes`. The policy therefore
allows `huggingface.co` plus `.hf.co` subdomains, which covers
`us.aws.cdn.hf.co` and the classic `cdn-lfs.hf.co` while rejecting
`huggingface.co.evil.test` and `evil-hf.co`.

### Evidence from the built app (2026-10-22)

- The panel rendered `Qwen2.5-1.5B-Instruct`, the exact
  `1,117,320,736` B size, the full SHA-256, `Apache-2.0` and an estimate label,
  with **Download** as its only action.
- Pressing Download produced `Downloading 264 MiB of 1.04 GiB` / `24%` on the
  progress bar; the transfer completed, and the file on disk was
  `1,117,320,736` bytes whose locally recomputed SHA-256 equalled
  `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
  `models/` held only the `.gguf`; the library JSON recorded the revision.
- **Use this model** set the existing model path and left the runtime `stopped`
  (no `llama-server` on the test machine).
- **Delete → Remove** emptied the library, deleted the file and reported it.
- A first pass exposed a real bug: deletion was refused after **Use this model**
  because the guard treated a *selected* model as running. The guard now asks the
  runtime's phase, and the retest passed.

A transfer over a flaky connection and CDN behaviour outside the measured region
remain unverified. Starting a real runtime against this file is now covered in
§14.

## 14. The bundled runtime (2026-10-23)

The missing half of the local core was the executable, not the weights. The
app could download a model but still needed a separately installed
`llama-server`; on a machine without one, **Start server** failed. The installer
now carries the official llama.cpp Windows CPU build.

| Field | Value |
| --- | --- |
| Release | `b11835` (commit `f64a49819`), published 2026-10-23 |
| x64 asset | `llama-b11835-bin-win-cpu-x64.zip`, 24,081,155 B, SHA-256 `256e606f93b7f7dfb440e8d78bdbac34184c3b45ae4defead4e072a84afe63e4` |
| arm64 asset | `llama-b11835-bin-win-cpu-arm64.zip`, 12,706,478 B, SHA-256 `3e3695e4004d5e1d8d0d142e6e665172503e03c15df32f26b7442dc36a498011` |
| Shipped files | `llama-server.exe`, `llama-server-impl.dll`, `llama-common.dll`, `llama.dll`, `ggml.dll`, `ggml-base.dll`, `ggml-cpu-*.dll`, `libomp.dll`, `mtmd.dll`, plus `LICENSE-llama.cpp`, `LICENSE-LLVM-OpenMP` and `runtime.json` |
| Unpacked size | about 45 MB (24 files) |
| Licence | llama.cpp and ggml are MIT; the bundled OpenMP runtime is Apache-2.0 WITH LLVM-exception |
| Fetch | `node scripts/fetch-runtime.mjs` (`npm run fetch:runtime`), run by `package:dir` and `package:win` |
| Install location | `resources/bin` in the packaged app, `runtime/bin` in a source checkout |

Why the CPU build: it starts on any modern Windows machine, including one with
no Vulkan, CUDA or ROCm runtime. The tradeoff is honest: this build reports
`no usable GPU found, --gpu-layers option will be ignored`, so acceleration
requires pointing Settings → Vexium at a Vulkan, CUDA or Metal build. The GPU
layers setting still applies to such a build and remains harmless here.

The 45 MB is the reason only the server is shipped. The full archive is 62 MB
unpacked and includes `llama-cli`, `llama-bench`, `llama-quantize`, the RPC
server and several other tools that this app never starts. The fetch script
allowlists by exact filename, rejects separators and duplicate writes, and
extracts only those entries; the rest stays in the build cache.

Selection order in `electron/local-model.ts`: the user's chosen executable, a
binary they dropped into `<userData>/bin`, the bundled `resources/bin`, the
source-checkout `runtime/bin` while `app.isPackaged` is false, then PATH. The
status reports `bundled` and the release tag from `runtime.json`, so the panel
can say the runtime is included rather than asking the user to find one.

### Evidence, measured on 2026-10-23

- `fetch-runtime.mjs` downloaded the x64 asset, matched the pinned 24,081,155
  bytes and SHA-256, and wrote 24 files totalling 45.1 MB. A second run
  reported `b11835 already in runtime/bin` and fetched nothing.
- `runtime/bin/llama-server.exe --version` printed
  `version: 0.7.0-dev (build 11835, commit f64a49819)`.
- The real starter GGUF (1,117,320,736 B, SHA-256
  `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`)
  started through `dist-electron/local-model.js` with no runtime path set. The
  manager reported the bundled executable, `bundled: true`,
  `runtimeVersion: "b11835"` and `binaryFound: true`, and the server answered
  `/v1/models` in about 1.2 s.
- A non-streamed 41-token prompt produced 31 tokens at 34.7 tokens/s. Streamed
  replies arrived in 647 ms and 741 ms on two runs, and `stop()` ended the
  process. That short-run figure is not representative: the broader 14-request
  set in §15 measured 18.3 to 21.7 tokens/s weighted across two runs. These are
  CPU numbers on the build machine, not a general promise.
- `pnpm run verify:model` (run directly with Electron in this environment, as
  `pnpm` was not on PATH) still passes against the fake runtime, so the existing
  start, health, stream and stop path is unchanged.
- A full unpacked build was produced with Electron Builder. It placed the 24
  runtime files in `resources/bin` (44 MB); the packaged
  `resources/bin/llama-server.exe --version` reported the same build. In that
  packaged app, driven through CDP with a disposable profile, Settings showed
  `Included with Kryvex`, `llama.cpp b11835` and `The llama.cpp runtime is
  included with Kryvex`; `modelStart()` launched `resources/bin`, a streamed
  assistant reply through the real IPC bridge arrived, and `modelStop()` left
  the phase `stopped`.
- The Settings UI itself was then driven through the whole first-run path in a
  disposable profile: **Download** reported `Downloading 8.60 MiB of 1.04 GiB`
  through `1.01 GiB`, then `Verifying the checksum…`; the installed file was
  `1,117,320,736` bytes with the pinned SHA-256. **Use this model** set the path,
  **Start server** reached `running` on the bundled `b11835`, Vexium showed
  `RUNTIME ONLINE` and answered `I am an AI assistant created by Alibaba Cloud
  to help with various tasks and provide information on various topics.`, and
  **Stop server** left the phase `stopped`. This is the end-to-end path a user
  takes, not a direct API call.
- The standard `package:dir` script could not be run as written on this host
  because `pnpm` is not on PATH; the same build used a temporary `pnpm` shim to
  Corepack and the existing `node_modules/electron/dist`, so the packaging
  configuration itself is verified. The Windows Electron extraction step also
  hit a local `EPERM` on renaming its `.tmp` directory; using the existing
  unpacked Electron distribution bypassed that host lock. Neither workaround is
  part of the shipped configuration.

Not verified: arm64 packaging on real hardware, GPU acceleration through a
user-supplied build, inference on a memory-constrained machine, and context
beyond 8k. The 4k prompt set is §15, not a long-context test. The runtime's
`security: no API key is set and CORS allows all origins` warning is why the
process binds `127.0.0.1` and is never exposed on the LAN.

## 15. Starter model evaluation on the shipped runtime (2026-10-23)

The fixed prompt set in
[eval-model-quality.cjs](../scripts/eval-model-quality.cjs) was run against the
runtime installed by the 0.8.8 Setup, not a development copy. The raw answers,
token counts and timings are in
[qwen-0.8.8.json](media/evals/qwen-0.8.8.json).

```bash
node scripts/eval-model-quality.cjs \
  --runtime "C:\Kryvex\resources\bin\llama-server.exe" \
  --model "X:\KryvexData\models\qwen2.5-1.5b-instruct.gguf" \
  --out docs/media/evals/qwen-0.8.8.json --port 8099
```

| Field | Value |
| --- | --- |
| Runtime | `C:\Kryvex\resources\bin\llama-server.exe`, `b11835` (`f64a49819`), CPU x64 |
| Model | `qwen2.5-1.5b-instruct.gguf`, 1,117,320,736 B, SHA-256 `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e` |
| Host | Windows 11 Pro 10.0.26100, Ryzen 7 5700X3D (8 cores / 16 threads), 31.9 GB RAM |
| Context | 4,096 tokens, the app default; `--n-gpu-layers 999` as the app passes it, ignored by the CPU build |
| Sampling | temperature 0, seed 42, no prompt cache, one user message per turn, no system prompt (the current Vexium request shape) |
| Requests | 14 completions across 13 prompts; 1,204 prompt tokens, 1,154 generated tokens |
| Load | 1,578 ms to `/v1/models` |
| Memory | 1,803,083,776 B (1.68 GiB) after load; 1,911,336,960 B (1.78 GiB) after the prompts. One sample, not a peak. |
| Generation speed | 18.3 tokens/s weighted in the saved run; an earlier full-budget run (not saved) measured 21.7. Per request 10.4 to 27.3 tokens/s, median 20.9. |
| Prompt processing | 146.4 tokens/s weighted in the saved run (92.6 to 175.3); the earlier full-budget run measured 159.1. |

The JSON above is the second full-budget run. Its answers are byte-identical to
the previous full-budget run, so the quality result is stable under greedy
decoding; the speed difference is machine load, not a model or runtime change.
The harness is not part of CI: it needs the 1 GB model and a real runtime on
disk.

### Scoring

Each prompt is worth two points: **2** means correct and followed the
instructions, **1** means fluent or partly correct with a clear failure, and
**0** means wrong, broken or fabricated. This is a smoke test with 13 prompts,
not a benchmark score comparable to MMLU or similar suites.

| Prompt | Score | Finding |
| --- | --- | --- |
| English chat | 0/2 | Two sentences, but defines a local model as one "trained on a specific language" and gives avoiding a weight download as the benefit. |
| Rewriting | 2/2 | One clear sentence; the Tuesday release and the network-drop bug both survive. |
| Grounded summary | 1/2 | The four bullets are accurate and short, but the request was exactly three. |
| Uncertainty | 1/2 | Four sentences, and "Yes, you can run ... comfortably" contradicts the two following statements that performance cannot be known. |
| Conversation memory | 1/2 | The second turn keeps the museum preference and uses two sentences, but the first turn repeats a museum three times and is cut at the token limit; several Berlin museum names are unverified. |
| Spanish reply | 1/2 | Fluent Spanish, but six sentences and two numbered blocks instead of exactly two sentences; the advantages are generic latency and resource claims. |
| German reply | 0/2 | Broken German ("Faster Reaktionszeit", "wenn ein Sprachmodell ... auszuführen ist") and false claims that model servers cannot use context. |
| French reply | 1/2 | Exactly two fluent sentences, but claims local execution improves precision and reliability without support. |
| Arithmetic | 0/2 | Answered 14; the correct total is 18. |
| App help without retrieval | 1/2 | Begins with "I cannot verify", then invents Kryvex as a model-deployment tool and suggests buttons that may not exist. |
| App help with retrieval text | 2/2 | Correctly takes "Start server" in Vexium from the supplied sentence. |
| Current facts | 1/2 | Says it cannot know the 2026 winner and does not guess, but uses two sentences instead of one and calls a past tournament a future event. |
| Formatting | 2/2 | Exactly three short bullets, no introduction or conclusion. |

**Result: 13/26.** Three prompts pass, seven are partial and three fail. The
useful core is narrow: rewriting, formatting, and extraction when the answer is
in the prompt. The failures are exactly the ones §9 already plans around:
arithmetic, app facts without retrieval, factual precision, and strict output
constraints. German is weaker than the model card's language claim suggests, so
"supports en/es/de/fr" should be read as "attempts all four", not "all four are
production quality".

No runtime regression was observed: the server started in about 1.6 s, every
request completed, and the same server produced identical answers twice. The
failures are model behaviour, not the bundled `b11835` build. The run used no
system prompt because Vexium currently sends only the conversation; a fixed
system prompt is a separate experiment that could improve format and refusal
behaviour, but it was not tested here and is not part of 0.8.8.

The run changes no product behavior. It confirms three decisions: keep
arithmetic deterministic, keep app facts behind retrieval, and do not market a
1.5B starter as a reasoning model. It also adds a reason to evaluate a larger
model before claiming production-quality German.
