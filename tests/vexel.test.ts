import { describe, expect, it } from 'vitest';
import { VEXEL_GREETING, looksUnsure, offlineReply } from '../src/lib/vexel';

describe('offline Vexium', () => {
  it('greets without pretending a model is loaded', () => {
    expect(VEXEL_GREETING).toMatch(/No model is loaded/i);
    expect(VEXEL_GREETING).toMatch(/Settings → Vexium/);
    expect(offlineReply('hello').kind).toBe('greeting');
    expect(offlineReply('hello').text).toBe(VEXEL_GREETING);
  });

  it('answers questions about Kryvex without a search link', () => {
    const model = offlineReply('How do I load a local model?');
    expect(model.kind).toBe('answer');
    expect(model.text).toMatch(/127\.0\.0\.1:11434/);
    expect(model.search).toBeUndefined();

    expect(offlineReply('what can you do?').text).toMatch(/resource monitor/i);
    expect(offlineReply('where are my notes stored?').search).toBeTruthy();
  });

  it('turns an unknown question into an honest search fallback', () => {
    const reply = offlineReply('Who won the 1994 world cup?');
    expect(reply.kind).toBe('fallback');
    // The query is the useful part of the question, not the raw sentence.
    expect(reply.search).toBe('Who won the 1994 world cup');
    expect(reply.text).toMatch(/do not know/i);
    expect(reply.text).toMatch(/cannot check the web/i);
    expect(reply.text).toMatch(/search/i);
  });

  it('offers an explicit search when asked to browse', () => {
    const reply = offlineReply('search for a new keyboard');
    expect(reply.search).toBe('a new keyboard');
    expect(reply.kind).toBe('answer');
  });

  it('detects uncertainty in a model answer', () => {
    expect(looksUnsure('I do not know that one.')).toBe(true);
    expect(looksUnsure("I'm not sure which version you mean.")).toBe(true);
    expect(looksUnsure('Open Settings and choose Vexium.')).toBe(false);
  });
});
