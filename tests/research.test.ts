import { describe, expect, it } from 'vitest';
import { buildResearchQuery, researchReason } from '../src/lib/research';

const OCT_2026 = new Date(2026, 9, 25);

describe('research decision', () => {
  it('flags questions whose answers move', () => {
    expect(researchReason('What are the current Spotify royalties?')).toBe('current');
    expect(researchReason('Who won the latest championship?')).toBe('current');
    expect(researchReason('What is the latest version of Blender?')).toBe('current');
  });

  it('flags a fault even when nothing about it is time-sensitive', () => {
    expect(researchReason('Why does Windows 11 keep showing me the passkey popup?')).toBe(
      'troubleshooting',
    );
    expect(researchReason('My plugin is not working after the update')).toBe('current');
  });

  it('flags manual-shaped questions that are not time-sensitive', () => {
    expect(researchReason('Does Godot support multiplayer networking?')).toBe('software');
    expect(researchReason('How do I install the Krita plugin?')).toBe('software');
  });

  it('leaves stable questions to the model', () => {
    expect(researchReason('What is the capital of Portugal?')).toBeNull();
    expect(researchReason('Who wrote Pride and Prejudice?')).toBeNull();
    expect(researchReason('   ')).toBeNull();
  });
});

describe('search query', () => {
  it('drops the conversational scaffolding and keeps the subject', () => {
    expect(buildResearchQuery('Can you tell me about the Krita plugin?', OCT_2026)).toBe(
      'Krita plugin official documentation',
    );
    expect(buildResearchQuery('search for a new keyboard', OCT_2026)).toBe('a new keyboard');
    expect(buildResearchQuery('Look up Krita release notes', OCT_2026)).toBe(
      'Krita release notes',
    );
  });

  it('keeps technical tokens, versions and product names intact', () => {
    const query = buildResearchQuery(
      'Does the latest version of Krita support this particular plugin?',
      OCT_2026,
    );
    expect(query).toContain('Krita');
    expect(query).toContain('plugin');
    expect(query).not.toMatch(/particular|this/i);
    expect(query).not.toContain('?');
  });

  it('adds the intent the question already states, once', () => {
    const broken = buildResearchQuery('Why does Windows 11 keep showing me the passkey popup?');
    expect(broken).toContain('troubleshooting');
    expect(broken.match(/troubleshooting/g)).toHaveLength(1);
    expect(broken).toContain('Windows 11');

    const docs = buildResearchQuery('Does Godot support multiplayer networking?');
    expect(docs).toContain('official documentation');
    expect(docs).toContain('Godot');
  });

  it('does not repeat a hint the question already contains', () => {
    const query = buildResearchQuery('What is the latest version of Blender?', OCT_2026);
    expect(query.match(/latest version/gi)).toHaveLength(1);
  });

  it('never invents an entity, and returns the question when nothing is left', () => {
    expect(buildResearchQuery('Google Sheets formula for splitting a name')).toBe(
      'Google Sheets formula for splitting a name',
    );
    expect(buildResearchQuery('   ')).toBe('');
    expect(buildResearchQuery('Okay?')).toBe('Okay');
  });

  it('caps the query at a word boundary', () => {
    const query = buildResearchQuery(`Explain ${'verylongword '.repeat(40)}`);
    expect(query.length).toBeLessThanOrEqual(160);
    expect(query.endsWith('verylongword')).toBe(true);
  });
});
