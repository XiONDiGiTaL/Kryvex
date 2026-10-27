import { describe, expect, it } from 'vitest';
import {
  assessDictation,
  cultureLanguage,
  installedLanguages,
  recognizerFor,
  DICTATION_CONFIDENCE_FLOOR,
} from '../electron/lexium-speech-rules';
import * as view from '../src/lib/lexium-dictation';

/**
 * The in-box dictation engine, and the two cases that used to go wrong.
 *
 * A Turkish song transcribed on a machine with only `en-US` installed came back
 * as fluent English that was nowhere in the audio, because the engine fell back
 * to the language it had. And a result the engine was unsure of was presented
 * as an ordinary transcript. Both are decided here.
 */

describe('choosing a recogniser', () => {
  it('refuses a language this machine does not have', () => {
    // The regression: Turkish, with only an English recogniser installed.
    expect(recognizerFor(['en-US'], 'tr')).toBeNull();
    expect(recognizerFor(['en-US'], 'tr-TR')).toBeNull();
    expect(view.recognizerFor(['en-US'], 'tr')).toBeNull();
  });

  it('accepts the installed language in any regional spelling', () => {
    expect(recognizerFor(['en-US'], 'en')).toBe('en-US');
    expect(recognizerFor(['en-US'], 'en-GB')).toBe('en-US');
    expect(recognizerFor(['tr-TR'], 'tr')).toBe('tr-TR');
    expect(recognizerFor(['tr-TR'], 'TR')).toBe('tr-TR');
  });

  it('only lets automatic detection pick the first recogniser', () => {
    expect(recognizerFor(['en-US', 'tr-TR'], 'auto')).toBe('en-US');
    expect(recognizerFor(['en-US', 'tr-TR'], '')).toBe('en-US');
    expect(recognizerFor(['en-US', 'tr-TR'], 'und')).toBe('en-US');
    // A specific language never falls back to another one.
    expect(recognizerFor(['en-US', 'tr-TR'], 'de')).toBeNull();
  });

  it('answers null when there is nothing to choose from', () => {
    expect(recognizerFor([], 'en')).toBeNull();
    expect(recognizerFor(null, 'en')).toBeNull();
    expect(recognizerFor([{}, 42, ''], 'en')).toBeNull();
  });

  it('lists the languages without duplicates', () => {
    expect(installedLanguages(['en-US', 'en-GB', 'tr-TR'])).toEqual(['en', 'tr']);
    expect(installedLanguages([])).toEqual([]);
    expect(installedLanguages(undefined)).toEqual([]);
  });

  it('reads a culture as its language', () => {
    expect(cultureLanguage('tr-TR')).toBe('tr');
    expect(cultureLanguage('EN')).toBe('en');
    expect(cultureLanguage('')).toBe('');
    expect(cultureLanguage(undefined)).toBe('');
  });

  it('agrees with the renderer copy on every combination', () => {
    const cultureSets = [['en-US'], ['tr-TR'], ['en-US', 'tr-TR'], ['de-DE', 'fr-FR'], []];
    const languages = ['en', 'tr', 'de', 'fr', 'es', 'auto', '', 'und', 'TR-tr'];
    for (const cultures of cultureSets) {
      for (const language of languages) {
        expect(view.recognizerFor(cultures, language), `${cultures} / ${language}`).toBe(
          recognizerFor(cultures, language),
        );
      }
    }
  });
});

describe('deciding whether to trust the words', () => {
  it('calls silence empty rather than a transcript', () => {
    expect(assessDictation({ text: '   ', confidence: 0.9 })).toBe('empty');
    expect(assessDictation({ text: undefined, confidence: 0.9 })).toBe('empty');
  });

  it('flags a result the engine was not sure of', () => {
    expect(assessDictation({ text: 'bir şeyler', confidence: 0.41 })).toBe('uncertain');
    expect(assessDictation({ text: 'bir şeyler', confidence: 0 })).toBe('uncertain');
    expect(assessDictation({ text: 'bir şeyler', confidence: DICTATION_CONFIDENCE_FLOOR - 0.01 })).toBe(
      'uncertain',
    );
  });

  it('accepts a result at or above the floor', () => {
    expect(assessDictation({ text: 'the quick brown fox', confidence: DICTATION_CONFIDENCE_FLOOR })).toBe(
      'ok',
    );
    expect(assessDictation({ text: 'the quick brown fox', confidence: 0.92 })).toBe('ok');
  });

  it('withholds judgement when no confidence arrived', () => {
    // The engine that writes this always reports one, so its absence means
    // something changed, not that the text is fine.
    expect(assessDictation({ text: 'anything', confidence: undefined })).toBe('uncertain');
    expect(assessDictation({ text: 'anything', confidence: 'not a number' })).toBe('uncertain');
  });

  it('agrees with the renderer copy', () => {
    const cases = [
      { text: 'hello', confidence: 0.9 },
      { text: 'hello', confidence: 0.2 },
      { text: '', confidence: 0.9 },
      { text: 'hello', confidence: undefined },
    ];
    for (const item of cases) {
      expect(view.assessDictation(item)).toBe(assessDictation(item));
    }
    expect(view.DICTATION_CONFIDENCE_FLOOR).toBe(DICTATION_CONFIDENCE_FLOOR);
  });
});
