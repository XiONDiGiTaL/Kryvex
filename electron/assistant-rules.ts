/**
 * Vexium talks to a model runtime the user already runs. Everything here is
 * pure so the loopback-only rule, message shaping and stream parsing can be
 * tested without a model, a network or Electron.
 */

/** The only hosts a model runtime may live on. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const MAX_MESSAGES = 40;
export const MAX_CONTENT = 8_000;
export const MAX_TOTAL_CONTENT = 24_000;
export const MAX_MODEL_ID = 120;
export const REQUEST_ID = /^[a-z0-9-]{8,64}$/;

export type AssistantRole = 'system' | 'user' | 'assistant';

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export interface AssistantChatRequest {
  requestId: string;
  baseUrl: string;
  model: string;
  messages: AssistantMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accepts an origin such as `http://127.0.0.1:11434`, optionally written with
 * a trailing `/v1` or slash, and returns the bare origin. Anything that is not
 * plain http on loopback (another host, credentials, a path, https) is
 * rejected so this channel can never become a general outbound request.
 */
export function normalizeAssistantUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 200) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  if (!LOOPBACK.has(url.hostname.toLowerCase())) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '' && path !== '/v1') return null;
  if (url.port && !/^\d{1,5}$/.test(url.port)) return null;
  return url.origin;
}

export function providerUrl(provider: unknown): string {
  return provider === 'lmstudio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434';
}

/** Rejects untrusted message arrays: roles, lengths and shape are all fixed. */
export function sanitizeAssistantMessages(raw: unknown): AssistantMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const messages: AssistantMessage[] = [];
  let total = 0;
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const role = item.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null;
    if (typeof item.content !== 'string') return null;
    const content = item.content.trim();
    if (!content || content.length > MAX_CONTENT) return null;
    total += content.length;
    if (total > MAX_TOTAL_CONTENT) return null;
    messages.push({ role, content });
  }
  if (messages[messages.length - 1]?.role !== 'user') return null;
  return messages;
}

export function sanitizeChatRequest(raw: unknown): AssistantChatRequest | null {
  if (!isRecord(raw)) return null;
  const requestId = typeof raw.requestId === 'string' ? raw.requestId : '';
  if (!REQUEST_ID.test(requestId)) return null;
  const baseUrl = normalizeAssistantUrl(raw.baseUrl);
  if (!baseUrl) return null;
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  if (!model || model.length > MAX_MODEL_ID || /[\u0000-\u001f]/.test(model)) return null;
  const messages = sanitizeAssistantMessages(raw.messages);
  if (!messages) return null;
  return { requestId, baseUrl, model, messages };
}

export interface SseEvent {
  delta?: string;
  done?: boolean;
}

/**
 * OpenAI-compatible streaming sends `data: {...}` lines separated by blank
 * lines, ending with `data: [DONE]`. Ollama's `/v1` shim speaks the same.
 */
export function parseSseData(line: string): SseEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload) return null;
  if (payload === '[DONE]') return { done: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.error) return null;
  const choices = parsed.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  const delta = first.delta;
  if (isRecord(delta) && typeof delta.content === 'string' && delta.content) {
    return { delta: delta.content };
  }
  return null;
}

/** Reads model ids from either an OpenAI `/v1/models` body or Ollama's tags. */
export function modelIds(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const ids: string[] = [];
  const list = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.models) ? raw.models : [];
  for (const item of list) {
    if (ids.length >= 200) break;
    const id = isRecord(item)
      ? typeof item.id === 'string'
        ? item.id
        : typeof item.name === 'string'
          ? item.name
          : typeof item.model === 'string'
            ? item.model
            : ''
      : '';
    const clean = id.trim().slice(0, MAX_MODEL_ID);
    if (clean && !ids.includes(clean)) ids.push(clean);
  }
  return ids.sort((a, b) => a.localeCompare(b));
}
