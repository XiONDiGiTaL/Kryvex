import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantChannel, AssistantMessage, AssistantProbe, AssistantSettings } from '../types';

/**
 * The brand a channel read came from, for the panel's status line.
 *
 * Brand names rather than translated nouns: "GitHub" reads the same in every
 * locale, and the sentence around it is the part that gets translated.
 */
export function channelSourceName(channel: AssistantChannel | undefined): string {
  if (channel === 'github') return 'GitHub';
  if (channel === 'discussion') return 'Hacker News';
  if (channel === 'paper') return 'arXiv';
  return 'the web';
}

/** Mirrors `electron/assistant-rules.ts`; the main process is the real gate. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const ASSISTANT_PROVIDER_URL: Record<AssistantSettings['provider'], string> = {
  ollama: 'http://127.0.0.1:11434',
  lmstudio: 'http://127.0.0.1:1234',
  // A model file is served by llama.cpp on a port picked at launch; this is
  // only the address used until that server reports its real one.
  local: 'http://127.0.0.1:8080',
};

export const MODEL_SOURCES = {
  huggingface: 'https://huggingface.co/models?library=gguf&sort=trending',
  ollama: 'https://ollama.com/library',
  lmstudio: 'https://lmstudio.ai/models',
  runtime: 'https://github.com/ggml-org/llama.cpp/releases',
} as const;

/**
 * Accepts a plain http origin on loopback, with or without a trailing slash or
 * `/v1`, and returns the bare origin. Everything else is rejected so a typo
 * cannot turn the assistant into a request to some other machine.
 */
export function normalizeBaseUrl(raw: unknown): string | null {
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

export interface AssistantRuntime {
  status: 'idle' | 'checking' | 'online' | 'offline' | 'unavailable';
  models: string[];
  error?: string;
  refresh: () => void;
}

/**
 * Probes the configured runtime whenever the address changes. Desktop only:
 * the web preview has no bridge and no loopback access, so it reports
 * `unavailable` instead of pretending to be offline.
 */
export function useAssistantRuntime(settings: AssistantSettings): AssistantRuntime {
  const bridge = typeof window !== 'undefined' ? window.kryvex : undefined;
  const [status, setStatus] = useState<AssistantRuntime['status']>(
    bridge ? 'checking' : 'unavailable',
  );
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!bridge) {
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    const timer = setTimeout(() => {
      void bridge
        .assistantProbe(settings.baseUrl)
        .then((result: AssistantProbe) => {
          if (cancelled || !alive.current) return;
          setModels(result.models);
          setError(result.error);
          setStatus(result.ok ? 'online' : 'offline');
        })
        .catch(() => {
          if (cancelled || !alive.current) return;
          setModels([]);
          setError('offline');
          setStatus('offline');
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bridge, settings.baseUrl, tick]);

  const refresh = useCallback(() => setTick(value => value + 1), []);

  return { status, models, error, refresh };
}

export const ASSISTANT_SUGGESTIONS: string[] = [
  'Summarise my workspace: what should I clean up first?',
  'Draft a short release note for a desktop app update.',
  'Explain the difference between an embedded webview and a browser tab.',
];

export function newRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toChatMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.map(message => ({ role: message.role, content: message.content }));
}
