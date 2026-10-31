/**
 * Deciding whether Vexium has to look something up.
 *
 * The old behaviour was "say you cannot browse" because there was nothing to
 * browse with. Now there is, so the honest rule changes: a factual question
 * that changes over time gets a search, a question the model genuinely knows
 * gets a direct answer, and a URL gets read. That decision is made by the model
 * itself in one short, non-streamed turn that must return a single JSON object
 * — small models follow a schema far more reliably than a policy sentence.
 *
 * The planner is separate from the answer on purpose:
 *
 * - The planning turn can be cheap (few tokens, temperature 0) while the answer
 *   streams with the user's own settings.
 * - A model that ignores the schema fails safely: `parsePlan` returns `answer`,
 *   and the turn proceeds exactly as it did before this feature existed.
 * - No tool name, URL or query the planner produces is trusted: the caller
 *   re-validates them (see `vexium-tools.ts`), so a prompt-injected page cannot
 *   turn the planner into a general fetcher.
 *
 * Everything here is pure, so it is tested without a model.
 */
import { sanitizeChannel, sanitizeTarget } from './vexium-channels';
import type { ChannelId, ChannelRead } from './vexium-channels';
import type { PageRead, WebResult } from './vexium-tools';

/** Local shape, so this module can be imported by the rules it feeds. */
export interface PlannerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type VexiumAction = 'answer' | 'search' | 'fetch' | 'channel';

export interface VexiumPlan {
  action: VexiumAction;
  query?: string;
  url?: string;
  /** Which read-only channel, when the action is `channel`. */
  channel?: ChannelId;
  /** A repository, an arXiv id, a discussion phrase or a story number. */
  target?: string;
}

export const PLAN_MAX_QUERY = 200;
export const PLAN_TIMEOUT_MS = 20_000;
export const MAX_TOOL_CONTEXT = 6_000;

/**
 * The planner's own instructions.
 *
 * Deliberately separate from the answer prompt: this turn is not allowed to
 * write prose, so there is nothing for a chatty model to hide a refusal in.
 */
export const PLAN_PROMPT = [
  'You are the routing step of a desktop assistant. Decide whether the question needs a lookup before it can be answered.',
  'Reply with exactly one JSON object and no other text, no code fences and no explanation.',
  '{"action":"answer"}',
  '{"action":"search","query":"a short web query"}',
  '{"action":"fetch","url":"https://..."}',
  '{"action":"channel","channel":"github","target":"owner/name"}',
  'Choose "search" when the answer depends on facts that change or that you cannot know for certain: news, prices, releases, dates, schedules, scores, weather, who currently holds a position, a product specification, a place’s hours, a person’s recent work, or anything after your training data.',
  'Choose "fetch" only when the user supplied a URL and asks about what is on it.',
  'Choose "channel" when a web page is not enough and the answer lives in one of three places: a GitHub repository, issue or pull request (channel "github", target "owner/name", "owner/name#12" or a phrase to search); a Hacker News discussion (channel "discussion", target a search phrase or a story number); or a research paper (channel "paper", target an arXiv id or a phrase).',
  'Prefer "channel" over "search" for exactly those three, because the search results would only describe them while the channel reads them.',
  'Choose "answer" for arithmetic you can do reliably, definitions, code, opinions, creative writing, translation, or when the user is talking about their own machine.',
  'Never choose "answer" merely to avoid work, and never answer a time-sensitive question from memory.',
  'Write the query in the language the user used, short enough to search (2–12 words).',
].join(' ');

/** The planner sees only what it needs: the last few turns and the date. */
export function planMessages(
  messages: PlannerMessage[],
  now: Date = new Date(),
): PlannerMessage[] {
  const recent = messages.slice(-6);
  return [
    { role: 'system', content: PLAN_PROMPT },
    ...recent,
    {
      role: 'user',
      content: `Today is ${now.toISOString().slice(0, 10)}. Output the JSON object only.`,
    },
  ];
}

/** The first balanced `{...}` in a string, so code fences do not defeat it. */
export function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Read the planner's answer. Anything malformed becomes `answer`, which is the
 * pre-tool behaviour and never an error the user has to see.
 */
export function parsePlan(raw: unknown): VexiumPlan {
  if (typeof raw !== 'string') return { action: 'answer' };
  const json = firstJsonObject(raw);
  if (!json) return { action: 'answer' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { action: 'answer' };
  }
  if (!parsed || typeof parsed !== 'object') return { action: 'answer' };
  const record = parsed as Record<string, unknown>;
  // `tool` is what a model trained on other schemas reaches for; accept it.
  const action = record.action ?? record.tool ?? record.type;
  if (action === 'search') {
    const query = typeof record.query === 'string' ? record.query.trim() : '';
    if (!query || query.length > PLAN_MAX_QUERY) return { action: 'answer' };
    return { action: 'search', query };
  }
  if (action === 'fetch') {
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    if (!url) return { action: 'answer' };
    return { action: 'fetch', url };
  }
  if (action === 'channel') {
    const channel = sanitizeChannel(record.channel ?? record.site ?? record.source);
    const target = sanitizeTarget(record.target ?? record.repo ?? record.url ?? record.query);
    if (!channel || !target) return { action: 'answer' };
    return { action: 'channel', channel, target };
  }
  return { action: 'answer' };
}

/**
 * Which language the answer should be in, from the question.
 *
 * A local model matches the language it is addressed in, but Turkish is only
 * honoured when the prompt is unambiguous about it — and a short "fiyat?" has
 * no characters that give it away. The answer prompt names the language
 * explicitly instead of hoping.
 */
export function detectLanguage(text: string): 'tr' | 'en' {
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return 'tr';
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const turkish = new Set([
    've', 'bir', 'bu', 'için', 'ne', 'nasıl', 'neden', 'hangi', 'mi', 'mı', 'mu', 'mü',
    'bugün', 'şimdi', 'fiyat', 'haber', 'hava', 'kaç', 'nerede', 'kim', 'türkçe',
    'merhaba', 'selam', 'teşekkürler', 'lütfen', 'çok', 'daha', 'var', 'yok',
  ]);
  const hits = words.filter(word => turkish.has(word)).length;
  return hits >= 2 || (words.length <= 6 && hits >= 1) ? 'tr' : 'en';
}

/** Results as the answer turn sees them: numbered, quoting, bounded. */
export function formatSearchResults(results: WebResult[], limit = 4): string {
  if (results.length === 0) return '';
  const lines = results.slice(0, limit).map((result, index) => {
    const snippet = result.snippet.replace(/\s+/g, ' ').trim();
    return `[${index + 1}] ${result.title}\n${result.url}${snippet ? `\n${snippet}` : ''}`;
  });
  return clampContext(`SEARCH RESULTS\n${lines.join('\n\n')}`);
}

export function formatPage(page: PageRead): string {
  const body = page.text.replace(/\s+/g, ' ').trim();
  return clampContext(`PAGE TEXT\n${page.title || page.url}\n${page.url}\n${body}`);
}

/**
 * A channel read as the answer turn sees it: the facts, then numbered sources.
 *
 * The numbering matters: `toolInstructions()` asks the model to cite `[1]`, and
 * a repository read is one source, not a list of search snippets.
 */
export function formatChannel(read: ChannelRead): string {
  const sources =
    read.sources.length > 0
      ? `\n\nSOURCES\n${read.sources
          .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`)
          .join('\n')}`
      : '';
  return clampContext(`${read.text}${sources}`);
}

function clampContext(text: string): string {
  return text.length > MAX_TOOL_CONTEXT ? `${text.slice(0, MAX_TOOL_CONTEXT)}…` : text;
}

/**
 * The answer turn's instructions about tools.
 *
 * Stated as rules the model can follow in one pass: what was read, how to cite
 * it, and what to do when the lookup came back empty. This is added beside the
 * existing Vexium system prompt, not instead of it.
 */
export function toolInstructions(language: 'tr' | 'en', usedTool: boolean): string {
  const lines = [
    language === 'tr'
      ? 'Kullanıcı Türkçe yazdı: yanıtı Türkçe ver, Türkçe harfleri (ç, ğ, ı, İ, ö, ş, ü) doğru kullan.'
      : 'The user wrote in English: answer in English.',
    'You have web tools: Kryvex runs them for you and hands back the results below. You may say you searched or read a page, because a tool actually ran.',
    'When results or page text are supplied, answer from them and cite each claim with its bracketed number, like [1]. Never cite a source that is not in the list.',
    'If the lookup returned nothing useful, say in one sentence what you could not verify, then give the best general answer you can and mark it as uncertain.',
    'Never invent a URL, a price, a date or a quotation to fill a gap.',
  ];
  if (!usedTool) {
    lines.push(
      'No lookup was run for this turn. If the question needs current facts, say which fact you would check rather than guessing.',
    );
  }
  return lines.join(' ');
}
