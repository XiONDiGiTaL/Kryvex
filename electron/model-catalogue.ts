/**
 * The reviewed catalogue that ships with the app.
 *
 * One entry, one artifact. Every value here was read from the pinned revision
 * or from the GGUF header itself on 2026-10-22 (see docs/VEXIUM_MODELS.md):
 * the commit, the byte size, the SHA-256 in Hugging Face's LFS metadata, the
 * licence file and the architecture string. Nothing is fetched at runtime and
 * nothing is added without the same evidence.
 *
 * `capabilities` and `limitations` are stable ids translated by the renderer;
 * the model card's own sentences are never shown as untrusted copy.
 */
import type { CatalogueEntry } from './model-rules';

export const STARTER_MODEL_ID = 'qwen2.5-1.5b-instruct';

/**
 * The first-party name for the supported local stack. It is deliberately not
 * the model's own name: the weights are Qwen's, and the panel keeps that
 * attribution beside the product name.
 */
export const VEXIUM_CORE_NAME = 'Vexium Core';

export const MODEL_CATALOGUE: CatalogueEntry[] = [
  {
    id: STARTER_MODEL_ID,
    name: 'Qwen2.5-1.5B-Instruct',
    productName: VEXIUM_CORE_NAME,
    publisher: 'Qwen (Alibaba Cloud)',
    repository: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    revision: '91cad51170dc346986eccefdc2dd33a9da36ead9',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    bytes: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    licence: 'Apache-2.0',
    licenceUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/blob/91cad51170dc346986eccefdc2dd33a9da36ead9/LICENSE',
    quantisation: 'Q4_K_M',
    architecture: 'qwen2',
    contextLength: 32_768,
    languages: ['en', 'es', 'de', 'fr'],
    capabilities: ['conversation', 'rewriting', 'summaries', 'explanations'],
    limitations: ['reasoning', 'arithmetic', 'current-facts'],
    memory: {
      minBytes: 1_500_000_000,
      maxBytes: 1_700_000_000,
      contextTokens: 4096,
    },
    commercialUse: true,
  },
];

export function catalogueEntry(id: unknown): CatalogueEntry | undefined {
  return MODEL_CATALOGUE.find(entry => entry.id === id);
}
