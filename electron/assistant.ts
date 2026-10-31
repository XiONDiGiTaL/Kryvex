import type { BrowserWindow } from 'electron';
import {
  GENERATION,
  buildMessages,
  modelIds,
  normalizeAssistantUrl,
  parseSseData,
  sanitizeChatRequest,
} from './assistant-rules';
import {
  PLAN_TIMEOUT_MS,
  detectLanguage,
  formatChannel,
  formatPage,
  formatSearchResults,
  parsePlan,
  planMessages,
  type VexiumPlan,
} from './vexium-planner';
import { readChannel } from './vexium-channels';
import type { ChannelId } from './vexium-channels';
import { fetchPage, searchWeb } from './vexium-tools';

export type AssistantError =
  | 'invalid-url'
  | 'offline'
  | 'timeout'
  | 'unauthorized'
  | 'http'
  | 'bad-response'
  | 'aborted'
  | 'invalid-request';

export interface AssistantProbeResult {
  ok: boolean;
  models: string[];
  error?: AssistantError;
  status?: number;
}

export interface AssistantChatResult {
  ok: boolean;
  error?: AssistantError;
  status?: number;
}

export interface AssistantSource {
  title: string;
  url: string;
}

export interface AssistantToolEvent {
  phase: 'start' | 'done';
  name: 'search' | 'fetch' | 'channel';
  /** The query, URL or channel target, so the panel can say what it is doing. */
  detail: string;
  /** Which read-only channel ran, when the tool was a channel. */
  channel?: ChannelId;
  count?: number;
  failed?: boolean;
}

export interface AssistantDelta {
  requestId: string;
  delta?: string;
  done?: boolean;
  error?: AssistantError;
  /** Live tool activity, so a search is visible while it runs. */
  tool?: AssistantToolEvent;
  /** Every result the tools actually returned, for the panel's own links. */
  sources?: AssistantSource[];
}

const PROBE_TIMEOUT = 4_000;
const IDLE_TIMEOUT = 120_000;

/**
 * Local model chat for the Vexium view. The renderer never talks to the
 * runtime directly: requests are validated here, sent from the main process
 * (no CORS, no service webview can reach the loopback port) and streamed back
 * as small deltas.
 */
export class Assistant {
  private window: BrowserWindow | null = null;
  private active = new Map<string, { controller: AbortController; cancelled: boolean }>();

  attachWindow(win: BrowserWindow): void {
    this.window = win;
  }

  dispose(): void {
    for (const entry of this.active.values()) {
      entry.cancelled = true;
      entry.controller.abort();
    }
    this.active.clear();
    this.window = null;
  }

  cancel(requestId: unknown): boolean {
    if (typeof requestId !== 'string') return false;
    const entry = this.active.get(requestId);
    if (!entry) return false;
    entry.cancelled = true;
    entry.controller.abort();
    this.active.delete(requestId);
    return true;
  }

  async probe(rawUrl: unknown): Promise<AssistantProbeResult> {
    const baseUrl = normalizeAssistantUrl(rawUrl);
    if (!baseUrl) return { ok: false, models: [], error: 'invalid-url' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          models: [],
          error: response.status === 401 || response.status === 403 ? 'unauthorized' : 'http',
          status: response.status,
        };
      }
      return { ok: true, models: modelIds(await response.json()) };
    } catch (error) {
      return { ok: false, models: [], error: describe(error, controller.signal) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streams one completion. The promise resolves when the stream ends, the
   * user cancels, or the runtime goes quiet for two minutes; text arrives
   * through `kryvex:assistant:delta` events in between.
   */
  async chat(raw: unknown): Promise<AssistantChatResult> {
    const request = sanitizeChatRequest(raw);
    if (!request) return { ok: false, error: 'invalid-request' };
    if (this.active.has(request.requestId)) return { ok: false, error: 'invalid-request' };

    const controller = new AbortController();
    const entry = { controller, cancelled: false };
    this.active.set(request.requestId, entry);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const armIdle = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT);
    };

    try {
      armIdle();

      // Look things up before answering, when the turn may use tools. A
      // planner failure is not a failure of the answer: it falls back to the
      // plain completion this app has always sent.
      let toolContext = '';
      let usedTool = false;
      const lastUser = [...request.messages].reverse().find(message => message.role === 'user');
      const language = detectLanguage(lastUser?.content ?? '');
      if (request.tools) {
        const plan = await this.plan(request, controller.signal);
        const outcome = await this.runPlan(plan, request.requestId, controller.signal);
        toolContext = outcome.context;
        usedTool = outcome.used;
      }

      const response = await fetch(`${request.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          model: request.model,
          messages: buildMessages(request.messages, {
            facts: request.facts,
            toolContext,
            language,
            usedTool,
          }),
          stream: true,
          ...GENERATION,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          error: response.status === 401 || response.status === 403 ? 'unauthorized' : 'http',
          status: response.status,
        };
      }
      if (!response.body) return { ok: false, error: 'bad-response' };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        armIdle();
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const event = parseSseData(line);
          if (!event) continue;
          if (event.delta) this.emit({ requestId: request.requestId, delta: event.delta });
          if (event.done) {
            done = true;
            break;
          }
        }
      }

      this.emit({ requestId: request.requestId, done: true });
      return { ok: true };
    } catch (error) {
      const failure = entry.cancelled ? 'aborted' : describe(error, controller.signal);
      this.emit({ requestId: request.requestId, error: failure });
      return { ok: false, error: failure };
    } finally {
      if (idle) clearTimeout(idle);
      this.active.delete(request.requestId);
    }
  }

  /**
   * One short, non-streamed turn that decides whether to look something up.
   *
   * Temperature 0 and a 96-token cap: this is a routing decision, not prose.
   * Any error, refusal or malformed answer becomes `answer`.
   */
  private async plan(
    request: { baseUrl: string; model: string; messages: Parameters<typeof buildMessages>[0] },
    signal: AbortSignal,
  ): Promise<VexiumPlan> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLAN_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort);
    try {
      const response = await fetch(`${request.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          model: request.model,
          messages: planMessages(request.messages),
          stream: false,
          temperature: 0,
          max_tokens: 96,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return { action: 'answer' };
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      return parsePlan(typeof content === 'string' ? content : '');
    } catch {
      return { action: 'answer' };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  /** Runs the planned tool and returns the context the answer turn receives. */
  private async runPlan(
    plan: VexiumPlan,
    requestId: string,
    signal: AbortSignal,
  ): Promise<{ context: string; used: boolean }> {
    if (plan.action === 'search' && plan.query) {
      this.emit({ requestId, tool: { phase: 'start', name: 'search', detail: plan.query } });
      try {
        const results = await searchWeb(plan.query, { signal });
        this.emit({
          requestId,
          tool: { phase: 'done', name: 'search', detail: plan.query, count: results.length },
          sources: results.map(result => ({ title: result.title, url: result.url })),
        });
        return { context: formatSearchResults(results), used: results.length > 0 };
      } catch {
        this.emit({
          requestId,
          tool: { phase: 'done', name: 'search', detail: plan.query, count: 0, failed: true },
        });
        return { context: '', used: false };
      }
    }
    if (plan.action === 'fetch' && plan.url) {
      this.emit({ requestId, tool: { phase: 'start', name: 'fetch', detail: plan.url } });
      try {
        const page = await fetchPage(plan.url, { signal });
        this.emit({
          requestId,
          tool: { phase: 'done', name: 'fetch', detail: plan.url, count: 1 },
          sources: [{ title: page.title || page.url, url: page.url }],
        });
        return { context: formatPage(page), used: page.text.length > 0 };
      } catch {
        this.emit({
          requestId,
          tool: { phase: 'done', name: 'fetch', detail: plan.url, count: 0, failed: true },
        });
        return { context: '', used: false };
      }
    }
    if (plan.action === 'channel' && plan.channel && plan.target) {
      this.emit({
        requestId,
        tool: { phase: 'start', name: 'channel', detail: plan.target, channel: plan.channel },
      });
      try {
        const read = await readChannel({ channel: plan.channel, target: plan.target }, { signal });
        this.emit({
          requestId,
          tool: {
            phase: 'done',
            name: 'channel',
            detail: plan.target,
            channel: plan.channel,
            count: read.sources.length,
          },
          sources: read.sources,
        });
        return { context: formatChannel(read), used: true };
      } catch {
        this.emit({
          requestId,
          tool: {
            phase: 'done',
            name: 'channel',
            detail: plan.target,
            channel: plan.channel,
            count: 0,
            failed: true,
          },
        });
        return { context: '', used: false };
      }
    }
    return { context: '', used: false };
  }

  private emit(event: AssistantDelta): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send('kryvex:assistant:delta', event);
  }
}

function describe(error: unknown, signal: AbortSignal): AssistantError {
  if (signal.aborted) return 'timeout';
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  return 'offline';
}

export const assistant = new Assistant();
