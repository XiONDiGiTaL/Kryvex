/**
 * Vexium talks to a model runtime the user already runs. Everything here is
 * pure so the loopback-only rule, message shaping and stream parsing can be
 * tested without a model, a network or Electron.
 */
import { detectLanguage, toolInstructions } from './vexium-planner';

/** The only hosts a model runtime may live on. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const MAX_MESSAGES = 40;
export const MAX_CONTENT = 8_000;
export const MAX_TOTAL_CONTENT = 24_000;
export const MAX_MODEL_ID = 120;
export const MAX_FACTS = 1_200;
export const REQUEST_ID = /^[a-z0-9-]{8,64}$/;

/**
 * Vexium's standing instructions.
 *
 * Without a system turn a small local model has no identity, no brevity and
 * no licence to answer plainly: the shipped 1.5B opened ordinary questions
 * with "I'm unable to provide information as it pertains to copyrighted
 * material", because that refusal is the only register it had. These rules
 * are deliberately short; a 3B model follows a page, not a policy document.
 */
export const VEXIUM_SYSTEM_PROMPT = [
  'You are Vexium, the assistant built into Kryvex, a desktop browser app.',
  'You run locally on this machine: no account, no cloud, nothing leaves the device.',
  'Answer the question directly in the first sentence, then add only the detail that helps.',
  'You can answer ordinary factual, technical and everyday questions, including',
  'geography, maths, units, dates and how software works. Never refuse a question',
  'like that, and never mention copyright unless the user asks about it.',
  'Keep replies under 150 words unless the user asks for more. Use short paragraphs,',
  'plain words and lists only when they genuinely help. No preamble, no restating',
  'the question, no "as an AI".',
  'If Kryvex gives you verified facts below, use those numbers exactly and do not',
  'recompute or contradict them.',
  'If you do not know something, or it depends on current information you cannot',
  'see, say so in one sentence and suggest a web search rather than inventing it.',
  'Never claim to have browsed, searched or run code.',
].join(' ');

/**
 * What Vexium may say about the person behind Kryvex.
 *
 * These are product facts, not model guesses. A 3B model asked "who made you"
 * will otherwise invent a founder, a studio and a discography, so the only
 * statements it is allowed to make about XiØN are written here. The block
 * carries no scheme-qualified URLs on purpose: a small model handed a link
 * starts claiming it opened it, and every link the UI shows is built by the
 * app from `CREATOR_LINKS` in `src/lib/creator.ts`.
 */
export const CREATOR_PROFILE = [
  'Kryvex and Vexium were created by XiØN, also known as XiONDiGiTaL.',
  'He is an independent musician, songwriter, producer and software developer whose work spans music production, browser-based games, digital utilities and AI-assisted development.',
  'His broader goal is an independent creative and technology business built from original music, software projects and digital products.',
  'Player529 is a collaborative partner of his on various projects.',
  'Grease & Gold Records is an entity that has collaborated with various artists and has no affiliation with anyone outside its current roster.',
  'He is a native English speaker who understands Puerto Rican Spanish and Jamaican Patois, and is learning Turkish at a beginner level.',
].join(' ');

/**
 * How to answer about him without a browsing tool. The rule is narrower than
 * "be helpful": a wrong song title or studio name is worse than an honest
 * "I cannot open that page".
 */
export const CREATOR_RULES = [
  'Those are the only facts you may state about XiØN. Never invent a song, album, release date, studio, collaborator, price, address or project detail.',
  'You cannot open his GitHub, Spotify or YouTube pages. When a question needs one, say so in one sentence instead of guessing; the app will offer a search.',
  'For any other personal question about him, answer only: Visit xiondigital.net for more information.',
].join(' ');

/** Sampling for a helper that should be useful, not creative. */
export const GENERATION = {
  temperature: 0.3,
  top_p: 0.9,
  max_tokens: 768,
} as const;

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
  /** Verified lines from Kryvex's own tools, never model output. */
  facts?: string;
  /**
   * Whether this turn may look things up. Off is the old behaviour: answer
   * from the model alone. On lets the main process run the planner and the web
   * tools before the answer streams.
   */
  tools?: boolean;
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
  const facts = sanitizeFacts(raw.facts);
  return {
    requestId,
    baseUrl,
    model,
    messages,
    ...(facts ? { facts } : {}),
    ...(raw.tools === true ? { tools: true } : {}),
  };
}

/**
 * Tool answers are one controlled line each. Anything longer, multi-line or
 * carrying control characters is dropped rather than trimmed: a malformed
 * fact block must never become instructions for the model.
 */
export function sanitizeFacts(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_FACTS) return '';
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return '';
  return trimmed;
}

/**
 * The message list the runtime receives: one system turn that carries the
 * identity, the date and any verified facts, then the conversation as typed.
 */
export function buildMessages(
  messages: AssistantMessage[],
  options: {
    facts?: string;
    now?: Date;
    /** Numbered search results or one page's text, already formatted. */
    toolContext?: string;
    /** What the user's last message is written in. */
    language?: 'tr' | 'en';
    /** True when a tool actually ran this turn. */
    usedTool?: boolean;
  } = {},
): AssistantMessage[] {
  const now = options.now ?? new Date();
  const today = `${now.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`;
  const facts = sanitizeFacts(options.facts);
  const system = [
    VEXIUM_SYSTEM_PROMPT,
    `About your creator: ${CREATOR_PROFILE}`,
    CREATOR_RULES,
    `Today is ${today} on the user's machine.`,
    facts ? `Verified by Kryvex's own tools, use exactly: ${facts}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const toolContext = options.toolContext?.trim() ?? '';
  const language =
    options.language ??
    detectLanguage(messages.filter(message => message.role === 'user').at(-1)?.content ?? '');
  const tools = toolInstructions(language, options.usedTool === true);
  const composed = [system, tools, toolContext].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: composed },
    ...messages.filter(message => message.role !== 'system'),
  ];
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
