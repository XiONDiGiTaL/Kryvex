/**
 * Rules for the speech engine Windows already has.
 *
 * Two decisions live here because both used to go wrong silently:
 *
 * 1. **Which recogniser to use.** The engine is language-specific. Asking a
 *    Turkish recording of a Turkish song with only an `en-US` recogniser
 *    installed does not fail: it returns confident-looking English nonsense,
 *    which reads as a bad transcript rather than as a missing language. The
 *    language is therefore matched exactly, and a mismatch is refused instead
 *    of falling back to English.
 * 2. **Whether the result is worth presenting.** The recogniser reports a
 *    confidence per phrase. A mean below the floor means the engine was not
 *    sure enough to be quoted as a transcript, so the interface says that
 *    rather than dressing the guess up as text.
 *
 * Pure, so the main process, the harness and the tests share one definition.
 */

/** Below this mean confidence the result is flagged rather than trusted. */
export const DICTATION_CONFIDENCE_FLOOR = 0.55;

export type DictationVerdict = 'ok' | 'uncertain' | 'empty';

/** `tr-TR` → `tr`. A culture without a region keeps its own name. */
export function cultureLanguage(culture: unknown): string {
  if (typeof culture !== 'string') return '';
  const value = culture.trim().toLowerCase();
  if (!value) return '';
  return value.split(/[-_]/)[0] ?? value;
}

/**
 * The installed recogniser for a requested language, or null.
 *
 * `auto` (and an empty value) uses the first installed recogniser: the user
 * asked the engine to decide. A specific language must match the installed
 * two-letter code, because a near-miss produces a fluent-looking transcript in
 * the wrong language.
 */
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

/**
 * `empty` when nothing was heard, `uncertain` when the engine was not sure of
 * what it heard, `ok` otherwise. A missing confidence is treated as judgement
 * withheld: the engine that wrote this always reports one, so its absence
 * means something changed, not that the text is trustworthy.
 */
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
