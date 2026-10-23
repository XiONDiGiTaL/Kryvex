import { describe, expect, it } from 'vitest';
import {
  modelIds,
  normalizeAssistantUrl,
  parseSseData,
  sanitizeAssistantMessages,
  sanitizeChatRequest,
} from '../electron/assistant-rules';
import { normalizeBaseUrl } from '../src/lib/assistant';
import { sanitizeAssistant, sanitizeState } from '../src/lib/store';

describe('loopback URL rule', () => {
  it('accepts loopback origins and strips a trailing /v1', () => {
    expect(normalizeAssistantUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    expect(normalizeAssistantUrl('http://localhost:1234/')).toBe('http://localhost:1234');
    expect(normalizeAssistantUrl('http://localhost:11434/v1')).toBe('http://localhost:11434');
    expect(normalizeAssistantUrl(' http://[::1]:1234/v1 ')).toBe('http://[::1]:1234');
  });

  it('rejects anything that is not plain http on this machine', () => {
    expect(normalizeAssistantUrl('https://127.0.0.1:11434')).toBeNull();
    expect(normalizeAssistantUrl('http://192.168.1.10:11434')).toBeNull();
    expect(normalizeAssistantUrl('http://example.com:11434')).toBeNull();
    expect(normalizeAssistantUrl('http://user:pass@127.0.0.1:11434')).toBeNull();
    expect(normalizeAssistantUrl('http://127.0.0.1:11434/api')).toBeNull();
    expect(normalizeAssistantUrl('http://127.0.0.1:11434/?x=1')).toBeNull();
    expect(normalizeAssistantUrl('file:///c:/models')).toBeNull();
    expect(normalizeAssistantUrl('')).toBeNull();
    expect(normalizeAssistantUrl(null)).toBeNull();
    expect(normalizeAssistantUrl('http://127.0.0.1:11434/' + 'a'.repeat(200))).toBeNull();
  });

  it('agrees with the renderer copy of the rule', () => {
    const cases = [
      'http://127.0.0.1:11434',
      'http://localhost:1234/v1',
      'https://127.0.0.1:11434',
      'http://10.0.0.5:11434',
      'http://127.0.0.1:11434/v2',
      'not a url',
    ];
    for (const value of cases) {
      expect(normalizeBaseUrl(value), value).toBe(normalizeAssistantUrl(value));
    }
  });
});

describe('message sanitizing', () => {
  it('keeps a user-terminated conversation', () => {
    const messages = sanitizeAssistantMessages([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: ' Hello ' },
    ]);
    expect(messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('rejects shapes the runtime should never receive', () => {
    expect(sanitizeAssistantMessages([])).toBeNull();
    expect(sanitizeAssistantMessages([{ role: 'user', content: '' }])).toBeNull();
    expect(sanitizeAssistantMessages([{ role: 'tool', content: 'x' }])).toBeNull();
    expect(sanitizeAssistantMessages([{ role: 'assistant', content: 'hi' }])).toBeNull();
    expect(
      sanitizeAssistantMessages([{ role: 'user', content: 'x'.repeat(8_001) }]),
    ).toBeNull();
    expect(sanitizeAssistantMessages('nope')).toBeNull();
    const tooMany = Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' }));
    expect(sanitizeAssistantMessages(tooMany)).toBeNull();
  });

  it('validates a whole chat request', () => {
    const ok = sanitizeChatRequest({
      requestId: 'req-abc12345',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(ok?.baseUrl).toBe('http://127.0.0.1:11434');
    expect(ok?.model).toBe('llama3.2');

    expect(sanitizeChatRequest({ ...ok, requestId: 'bad id!' })).toBeNull();
    expect(sanitizeChatRequest({ ...ok, baseUrl: 'http://example.com' })).toBeNull();
    expect(sanitizeChatRequest({ ...ok, model: '' })).toBeNull();
    expect(sanitizeChatRequest({ ...ok, model: 'a\u0000b' })).toBeNull();
  });
});

describe('SSE stream parsing', () => {
  it('reads deltas and the terminator', () => {
    expect(
      parseSseData('data: {"choices":[{"delta":{"content":"Hel"}}]}'),
    ).toEqual({ delta: 'Hel' });
    expect(parseSseData('data: [DONE]')).toEqual({ done: true });
  });

  it('ignores keepalives, role-only deltas and malformed lines', () => {
    expect(parseSseData(': keepalive')).toBeNull();
    expect(parseSseData('')).toBeNull();
    expect(parseSseData('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull();
    expect(parseSseData('data: not-json')).toBeNull();
    expect(parseSseData('data: {"error":{"message":"bad"}}')).toBeNull();
  });
});

describe('model listing', () => {
  it('accepts OpenAI and Ollama style bodies', () => {
    expect(modelIds({ data: [{ id: 'qwen3' }, { id: 'llama3.2' }] })).toEqual([
      'llama3.2',
      'qwen3',
    ]);
    expect(modelIds({ models: [{ name: 'llama3.2:latest' }, { model: 'qwen3' }] })).toEqual([
      'llama3.2:latest',
      'qwen3',
    ]);
    expect(modelIds({ data: [{ id: 'a' }, { id: 'a' }] })).toEqual(['a']);
    expect(modelIds(null)).toEqual([]);
    expect(modelIds({ data: 'nope' })).toEqual([]);
  });
});

describe('assistant settings', () => {
  it('falls back to Vexium Core for unknown providers and empty addresses', () => {
    expect(sanitizeAssistant(null)).toEqual({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      model: '',
      migrated: true,
    });
    expect(sanitizeAssistant({ provider: 'cloud', baseUrl: '   ', model: 'x' })).toEqual({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      model: 'x',
      migrated: true,
    });
    expect(sanitizeAssistant({ provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234' })).toEqual({
      provider: 'lmstudio',
      baseUrl: 'http://127.0.0.1:1234',
      model: '',
      migrated: true,
    });
  });

  it('keeps the local model-file provider across a reload', () => {
    // A running GGUF is served on a port picked at launch, so the address must
    // survive with the provider instead of falling back to Ollama's 11434.
    expect(
      sanitizeAssistant({ provider: 'local', baseUrl: 'http://127.0.0.1:51234', model: '' }),
    ).toEqual({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:51234',
      model: '',
      migrated: true,
    });
  });

  it('moves an untouched Ollama default to Vexium Core once', () => {
    const migrated = sanitizeAssistant({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: '',
    });
    expect(migrated).toEqual({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      model: '',
      migrated: true,
    });
    // Once the flag is saved, choosing Ollama again is kept.
    expect(
      sanitizeAssistant({
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        model: '',
        migrated: true,
      }).provider,
    ).toBe('ollama');
  });

  it('strips control characters from a saved model id', () => {
    expect(sanitizeAssistant({ provider: 'ollama', model: 'bad\u0007id' }).model).toBe('');
  });

  it('defaults older saved state to the first-party Vexium Core runtime', () => {
    const state = sanitizeState({ settings: { themeId: 'kryvex-dark' } });
    expect(state.settings.assistant).toEqual({
      provider: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      model: '',
      migrated: true,
    });
  });
});
