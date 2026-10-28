/**
 * The reviewed catalogue that ships with the app.
 *
 * Two artifacts, both pinned. Every value was read from the pinned revision or
 * from the GGUF header itself (see docs/VEXIUM_MODELS.md): the commit, the byte
 * size, the SHA-256, the licence file and the architecture string. Nothing is
 * fetched at runtime and nothing is added without the same evidence.
 *
 * `capabilities` and `limitations` are stable ids translated by the renderer;
 * the model card's own sentences are never shown as untrusted copy.
 */
import type { CatalogueEntry } from './model-rules';

/** The supported core: installed by default and offered on the Vexium page. */
export const STARTER_MODEL_ID = 'vexium-core-3b';

/** A smaller core for machines that cannot spare the 3B's memory. */
export const LIGHT_MODEL_ID = 'qwen2.5-1.5b-instruct';

/**
 * The flagship core: the biggest model the panel offers, for machines with a
 * discrete GPU. It is not installed by default and nothing selects it without
 * the user choosing it.
 */
export const FLAGSHIP_MODEL_ID = 'vexium-1-12b';

/**
 * The first-party name for the supported local stack. It is deliberately not
 * the base model's own name: the weights are Qwen's, and the panel keeps that
 * attribution beside the product name.
 */
export const VEXIUM_CORE_NAME = 'Vexium Core';

export const MODEL_CATALOGUE: CatalogueEntry[] = [
  {
    id: STARTER_MODEL_ID,
    name: 'Vexium Core 3B',
    productName: VEXIUM_CORE_NAME,
    publisher: 'Qwen (Alibaba Cloud) · packaged by XiONDiGiTaL',
    repository: 'XiONDiGiTaL/Vexium-Core',
    // The base model's commit, kept as provenance. `url` is the exact asset
    // Kryvex downloads, so the two are not the same thing.
    revision: '7dabda4d13d513e3e842b20f0d435c732f172cbe',
    url: 'https://github.com/XiONDiGiTaL/Vexium-Core/releases/download/v2/vexium-core-3b-q4_k_m.gguf',
    filename: 'vexium-core-3b-q4_k_m.gguf',
    bytes: 2_104_932_768,
    sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    licence: 'Apache-2.0',
    licenceUrl: 'https://github.com/XiONDiGiTaL/Vexium-Core/blob/main/LICENSE',
    quantisation: 'Q4_K_M',
    architecture: 'qwen2',
    contextLength: 32_768,
    languages: ['en', 'es', 'de', 'fr'],
    capabilities: ['conversation', 'rewriting', 'summaries', 'explanations'],
    limitations: ['arithmetic', 'current-facts'],
    memory: {
      minBytes: 2_600_000_000,
      maxBytes: 3_200_000_000,
      contextTokens: 4096,
    },
    commercialUse: true,
  },
  {
    // The id stays the installed filename, so a machine that already verified
    // the 1.5B keeps it and does not download anything again.
    id: LIGHT_MODEL_ID,
    name: 'Qwen2.5-1.5B-Instruct',
    productName: 'Vexium Core Light',
    publisher: 'Qwen (Alibaba Cloud)',
    repository: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    revision: '91cad51170dc346986eccefdc2dd33a9da36ead9',
    filename: 'qwen2.5-1.5b-instruct.gguf',
    bytes: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    licence: 'Apache-2.0',
    licenceUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/blob/main/LICENSE',
    quantisation: 'Q4_K_M',
    architecture: 'qwen2',
    contextLength: 32_768,
    languages: ['en', 'es', 'de', 'fr'],
    capabilities: ['conversation', 'rewriting', 'summaries'],
    limitations: ['reasoning', 'arithmetic', 'current-facts'],
    memory: {
      minBytes: 1_500_000_000,
      maxBytes: 1_700_000_000,
      contextTokens: 4096,
    },
    commercialUse: true,
  },
  {
    // Vexium-1 is Mistral-Nemo-Instruct-2407 (Apache-2.0) with Kryvex's own
    // metadata and chat template. The weights were not retrained, merged or
    // fine-tuned, and the model card says so; the size and hash here were read
    // from the uploaded artifact, not from the base model's repository.
    id: FLAGSHIP_MODEL_ID,
    name: 'Vexium-1 12B',
    productName: 'Vexium-1',
    publisher: 'Mistral AI (base weights) · packaged by XiONDiGiTaL',
    repository: 'XiONDiGiTaL/Vexium-1',
    revision: '87c83243356e47dac7cfe5c06b9b2f34126ce500',
    filename: 'vexium-1-12b-q4_k_m.gguf',
    bytes: 7_477_209_792,
    sha256: '26b5ad94d602c462cfdbe9f005cbdab8e66d60718d1054afc7060d42065b6ecb',
    licence: 'Apache-2.0',
    licenceUrl: 'https://huggingface.co/XiONDiGiTaL/Vexium-1/blob/main/NOTICE',
    quantisation: 'Q4_K_M',
    architecture: 'llama',
    // 128k native; the estimate below assumes the 4k Kryvex runs it at.
    contextLength: 128_000,
    languages: ['en', 'tr', 'es', 'de', 'fr'],
    capabilities: ['conversation', 'explanations', 'summaries', 'rewriting', 'web-tools'],
    limitations: ['arithmetic', 'current-facts'],
    memory: {
      minBytes: 8_400_000_000,
      maxBytes: 10_200_000_000,
      contextTokens: 4096,
    },
    commercialUse: true,
  },
];

export function catalogueEntry(id: unknown): CatalogueEntry | undefined {
  return MODEL_CATALOGUE.find(entry => entry.id === id);
}
