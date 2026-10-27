/**
 * Renderer-side rules for the in-box dictation engine.
 *
 * The same two decisions as `electron/lexium-speech-rules.ts`, for the same
 * reason the repository keeps `lexium-rules` and `lexium` apart: the renderer
 * is built without the Electron tree. `tests/lexium-dictation.test.ts` runs
 * both implementations over one table, so they cannot drift apart silently.
 *
 * The important one is the language check. A recogniser is language-specific,
 * and the engine does not refuse foreign audio: it answers with confident
 * nonsense in the language it does know. The view asks this before it sends
 * anything, so a Turkish recording on a machine with only `en-US` installed is
 * told that rather than given an English transcript.
 */

export const DICTATION_CONFIDENCE_FLOOR = 0.55;

export type DictationVerdict = 'ok' | 'uncertain' | 'empty';

/** `tr-TR` → `tr`. */
export function cultureLanguage(culture: unknown): string {
  if (typeof culture !== 'string') return '';
  const value = culture.trim().toLowerCase();
  if (!value) return '';
  return value.split(/[-_]/)[0] ?? value;
}

/** The installed recogniser for a requested language, or null. */
export function recognizerFor(cultures: unknown, language: unknown): string | null {
  const installed = (Array.isArray(cultures) ? cultures : [])
    .map(culture => (typeof culture === 'string' ? culture.trim() : ''))
    .filter(Boolean);
  if (installed.length === 0) return null;
  const wanted = cultureLanguage(language);
  if (!wanted || wanted === 'auto' || wanted === 'und') return installed[0] ?? null;
  return installed.find(culture => cultureLanguage(culture) === wanted) ?? null;
}

/** The languages an installed list covers, without duplicates. */
export function installedLanguages(cultures: unknown): string[] {
  const seen = new Set<string>();
  for (const culture of Array.isArray(cultures) ? cultures : []) {
    const language = cultureLanguage(culture);
    if (language) seen.add(language);
  }
  return [...seen].sort();
}

export function assessDictation(input: {
  text?: unknown;
  confidence?: unknown;
}): DictationVerdict {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return 'empty';
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence)) return 'uncertain';
  return confidence < DICTATION_CONFIDENCE_FLOOR ? 'uncertain' : 'ok';
}
