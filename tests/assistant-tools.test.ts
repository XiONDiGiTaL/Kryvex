import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  greatCircleKm,
  runWorkspaceTool,
} from '../src/lib/assistant-tools';

const clock = new Date(2026, 9, 25, 14, 30);

describe('arithmetic', () => {
  it('evaluates what people actually type', () => {
    expect(runWorkspaceTool('2 + 2', clock)?.sentence).toBe('2+2 = 4.');
    expect(runWorkspaceTool('What is 18% of 240?', clock)?.sentence).toBe('18% of 240 is 43.2.');
    expect(runWorkspaceTool('calculate (12 + 8) * 3', clock)?.sentence).toBe('(12+8)*3 = 60.');
    expect(runWorkspaceTool('12 divided by 4 plus 1', clock)?.sentence).toBe('12/4+1 = 4.');
    expect(runWorkspaceTool('2 ^ 10', clock)?.sentence).toBe('2^10 = 1,024.');
  });

  it('refuses a sentence with words or a division by zero', () => {
    expect(runWorkspaceTool('what is the meaning of 7 * 6 in life', clock)).toBeNull();
    expect(runWorkspaceTool('5 / 0', clock)).toBeNull();
    expect(runWorkspaceTool('the 2026 release of 3 apps', clock)).toBeNull();
  });
});

describe('units', () => {
  it('converts within one dimension', () => {
    expect(runWorkspaceTool('convert 12 km to miles', clock)?.sentence).toBe(
      '12 km is 7.46 miles.',
    );
    expect(runWorkspaceTool('100 f to c', clock)?.sentence).toBe('100°F is 37.78°C.');
    expect(runWorkspaceTool('2 gb to mib', clock)?.sentence).toBe('2 gb is 1,907.35 mib.');
  });

  it('refuses a cross-dimension conversion', () => {
    expect(runWorkspaceTool('convert 12 km to kg', clock)).toBeNull();
    expect(runWorkspaceTool('convert 12 km to', clock)).toBeNull();
  });
});

describe('distance', () => {
  it('measures the pair from the report', () => {
    const answer = runWorkspaceTool('how far is Switzerland from Tampa, FL', clock);
    expect(answer?.id).toBe('distance');
    // 7,800 km is the real great-circle gap between Switzerland and Tampa.
    expect(answer?.sentence).toMatch(/^Switzerland and Tampa are about 7,8\d\d km \(4,8\d\d mi\) apart/);
  });

  it('accepts the other phrasings and a possessive', () => {
    expect(runWorkspaceTool("what's the distance between London and Tokyo", clock)?.id).toBe(
      'distance',
    );
    expect(runWorkspaceTool('distance from Paris to Berlin', clock)?.id).toBe('distance');
    expect(runWorkspaceTool("Switzerland's distance to New York", clock)).toBeNull();
  });

  it('leaves an unknown place to the model', () => {
    expect(runWorkspaceTool('how far is Narnia from Tampa', clock)).toBeNull();
  });

  it('computes a great-circle distance both ways round', () => {
    const a: [number, number] = [46.82, 8.23];
    const b: [number, number] = [27.95, -82.46];
    expect(greatCircleKm(a, b)).toBeCloseTo(greatCircleKm(b, a), 5);
    expect(greatCircleKm(a, a)).toBe(0);
  });
});

describe('dates', () => {
  it('answers the clock question with local time', () => {
    expect(runWorkspaceTool("what's the date", clock)?.sentence).toContain('2026');
    expect(runWorkspaceTool('what time is it', clock)?.sentence).toContain('14:30');
  });

  it('counts days between two dates', () => {
    expect(runWorkspaceTool('days between 2026-01-01 and 2026-10-25', clock)?.sentence).toBe(
      '2026-01-01 to 2026-10-25 is 297 days.',
    );
    expect(runWorkspaceTool('how many days until 2026-10-31', clock)?.sentence).toBe(
      '6 days remain between today (2026-10-25) and 2026-10-31.',
    );
  });

  it('offsets from today', () => {
    expect(runWorkspaceTool("what's the date 30 days from today", clock)?.sentence).toBe(
      'That date is 2026-11-24.',
    );
  });
});

describe('formatting', () => {
  it('groups thousands and drops float noise', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(43.2)).toBe('43.2');
    expect(formatNumber(1 / 3, 3)).toBe('0.333');
    expect(formatNumber(Number.NaN)).toBe('n/a');
  });
});

describe('no match', () => {
  it('returns null for ordinary conversation', () => {
    expect(runWorkspaceTool('draft a short release note', clock)).toBeNull();
    expect(runWorkspaceTool('', clock)).toBeNull();
    expect(runWorkspaceTool('x'.repeat(600), clock)).toBeNull();
  });
});
