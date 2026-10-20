import type { BrowserWindow } from 'electron';
import {
  modelIds,
  normalizeAssistantUrl,
  parseSseData,
  sanitizeChatRequest,
} from './assistant-rules';

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

export interface AssistantDelta {
  requestId: string;
  delta?: string;
  done?: boolean;
  error?: AssistantError;
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
      const response = await fetch(`${request.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          temperature: 0.7,
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
