import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeI18n } from '../src/lib/i18n';

/**
 * Translation coverage.
 *
 * English is the catalogue key, so a missing translation silently renders the
 * English string. This walks the renderer sources, collects every literal passed
 * to `t(...)`, and counts the ones a language does not translate.
 *
 * Kryvex has a historical backlog here (the app predates this audit), so the
 * assertion is a ratchet: the count may fall but never rise. Adding an English
 * string without its translations fails this test, which keeps the backlog from
 * growing while it is worked off. Current numbers live in docs/I18N.md.
 */

const ROOT = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'plugins') continue;
      out.push(...files(path));
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every `t('literal')` / `t("literal")` in the renderer, unescaped. */
export function translatedKeys(source: string): string[] {
  const keys = new Set<string>();
  // `[^]` matches any character, so a quote inside the string does not end the
  // match early; the backreference keeps the closing quote of the same kind.
  const pattern = /\bt\(\s*(['"])((?:\\.|(?!\1)[^])*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const key = (match[2] ?? '')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    if (key.length > 0) keys.add(key);
  }
  return [...keys];
}

const sources = files(ROOT).map(path => readFileSync(path, 'utf8'));
const keys = [...new Set(sources.flatMap(translatedKeys))].sort();

/** Measured when the audit landed; only lower these numbers. */
const BACKLOG: Record<'es' | 'de' | 'fr', number> = { es: 383, de: 408, fr: 395 };

const ADDED = [
  'VISUALIZER',
  'Visualizer',
  'Visualizer level',
  'Loading the video…',
  'Open it there',
  'That video is private or no longer available.',
  'Live streams are not supported in this player.',
  'Spotify does not publish a preview for this track. Open the full track in Spotify.',
  'Could not reach the playlist. Check the link and your connection.',
  'SPOTIFY PREVIEW',
  'SPOTIFY · NO PREVIEW',
  'Typography',
  'Text size',
  'Text style',
  'Share stopped.',
  'Mute shared audio',
  'Unmute shared audio',
  'Play it here',
  'Shared stream volume',
  'Stream size',
  'Fullscreen',
  'Pop out',
  'CHAT OVERLAY',
  'Overlay opacity',
  'Show chat',
  'TODAY',
  'YESTERDAY',
  'Waiting for a share…',
  'REMOTE CONTROL',
  'Ask to control',
  'Give control back',
  'Allow',
  'Take control back',
  '{name} is asking to control this share.',
  '{name} can control this share.',
  'You have control. Click the stream, then use the mouse and keyboard.',
  'Waiting for the host to allow control…',
  'Viewing is not controlling. Ask the host before your input is sent.',
  'A viewer can ask to control this app. Nothing is granted until you allow it.',
  'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.',
  'The server answered {status}: {detail}',
  'The health check could not run.',
  'Search a currency',
  'The reference source does not quote {code}.',
  'Keep running, muted',
  'Save states',
  'Quick save',
  'Quick load',
];

describe('translation coverage', () => {
  it('collects the strings the renderer asks for', () => {
    expect(keys.length).toBeGreaterThan(300);
    expect(keys).toContain('Rooms');
  });

  it.each(['es', 'de', 'fr'] as const)('never grows the untranslated set in %s', language => {
    const { t } = makeI18n(language);
    const missing = keys.filter(key => t(key) === key);
    expect(
      missing.length,
      `${language} backlog ${missing.length} (limit ${BACKLOG[language]})`,
    ).toBeLessThanOrEqual(BACKLOG[language]);
  });

  it('translates every string this release added', () => {
    for (const language of ['es', 'de', 'fr'] as const) {
      const { t } = makeI18n(language);
      const missing = ADDED.filter(key => t(key) === key);
      expect(missing, `${language} is missing ${missing.join(' | ')}`).toEqual([]);
    }
  });
});
