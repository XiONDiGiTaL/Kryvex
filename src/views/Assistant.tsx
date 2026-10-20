import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantDelta, AssistantMessage, PersistedState } from '../types';
import { useI18n } from '../lib/i18n';
import {
  ASSISTANT_SUGGESTIONS,
  MODEL_SOURCES,
  newRequestId,
  useAssistantRuntime,
} from '../lib/assistant';
import { Icon } from '../components/ui';

const ERROR_COPY: Record<string, string> = {
  'invalid-url': 'That address is not a loopback runtime. Use http://127.0.0.1 with the port your runtime listens on.',
  offline: 'No runtime answered on that port. Start Ollama or the LM Studio server first.',
  timeout: 'The runtime took too long to answer.',
  unauthorized: 'The runtime rejected the request. Disable its API key requirement for loopback.',
  http: 'The runtime returned an error.',
  'bad-response': 'The runtime sent a response Kryvex could not read.',
  aborted: 'Stopped.',
  'invalid-request': 'The request was rejected before it left the app.',
};

export function Assistant({
  state,
  isElectron,
  onOpenSettings,
}: {
  state: PersistedState;
  isElectron: boolean;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const settings = state.settings.assistant;
  const runtime = useAssistantRuntime(settings);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  const model = useMemo(
    () => settings.model || runtime.models[0] || '',
    [settings.model, runtime.models],
  );

  const cancel = useCallback(() => {
    const id = activeRef.current;
    if (!id || !window.kryvex) return;
    activeRef.current = null;
    void window.kryvex.assistantCancel(id);
    setRequestId(null);
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const bridge = window.kryvex;
    if (!bridge) return;
    return bridge.onAssistantDelta((event: AssistantDelta) => {
      if (!activeRef.current || event.requestId !== activeRef.current) return;
      if (event.error) {
        activeRef.current = null;
        setRequestId(null);
        setError(event.error);
        setMessages(list =>
          list.filter(
            (message, index) =>
              index !== list.length - 1 || message.content.length > 0,
          ),
        );
        return;
      }
      if (event.delta) {
        setMessages(list => {
          const next = [...list];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + event.delta };
          }
          return next;
        });
      }
      if (event.done) {
        activeRef.current = null;
        setRequestId(null);
      }
    });
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || requestId) return;
    const bridge = window.kryvex;
    if (!bridge) {
      setError('unavailable');
      return;
    }
    if (!model) {
      setError('no-model');
      return;
    }
    const next: AssistantMessage[] = [...messages, { role: 'user', content }];
    const id = newRequestId();
    setDraft('');
    setError(null);
    setMessages([...next, { role: 'assistant', content: '' }]);
    activeRef.current = id;
    setRequestId(id);
    const result = await bridge.assistantChat({
      requestId: id,
      baseUrl: settings.baseUrl,
      model,
      messages: next,
    });
    // A user cancel keeps whatever streamed so far and adds no error banner.
    if (!result.ok && result.error !== 'aborted') {
      setError(result.error ?? 'offline');
      setMessages(list =>
        list.filter(
          (message, index) => index !== list.length - 1 || message.content.length > 0,
        ),
      );
    }
    if (activeRef.current === id) activeRef.current = null;
    setRequestId(current => (current === id ? null : current));
  }

  const status = runtime.status;
  const canSend = Boolean(model) && status === 'online' && !requestId && draft.trim().length > 0;

  return (
    <section className="view assistant-view">
      <header className="view-head">
        <div>
          <p className="eyebrow mono">{t('VEXIUM / LOCAL RUNTIME')}</p>
          <h1>Vexium</h1>
          <p className="lede">
            {t(
              'A first-party assistant that talks to a model runtime on this machine. No account, no key, no cloud call: Kryvex only reaches loopback.',
            )}
          </p>
        </div>
        <div className="assistant-status">
          <span className={`assistant-chip is-${status}`}>
            <span className="status-dot" />
            {status === 'online'
              ? t('RUNTIME ONLINE')
              : status === 'checking'
                ? t('CHECKING')
                : status === 'unavailable'
                  ? t('DESKTOP ONLY')
                  : t('RUNTIME OFFLINE')}
          </span>
          <span className="mono assistant-model">
            {model || t('NO MODEL')} ·{' '}
            {settings.provider === 'lmstudio'
              ? 'LM STUDIO'
              : settings.provider === 'local'
                ? t('MODEL FILE')
                : 'OLLAMA'}
          </span>
          <button className="btn ghost small" onClick={onOpenSettings}>
            {t('Runtime settings')}
          </button>
          {messages.length > 0 ? (
            <button
              className="link"
              onClick={() => {
                if (requestId) cancel();
                setMessages([]);
                setError(null);
              }}
            >
              {t('New chat')}
            </button>
          ) : null}
        </div>
      </header>

      {status === 'offline' ? (
        <div className="assistant-notice" role="status" data-testid="runtime-offline">
          <strong>{t('No local runtime is answering.')}</strong>
          <p>
            {t(
              'Start Ollama (ollama serve) and pull a model, or start the LM Studio local server, then point Vexium at its loopback port in Settings.',
            )}
          </p>
          <div className="assistant-notice-actions">
            <button className="btn secondary small" onClick={runtime.refresh}>
              <Icon name="reload" size={13} /> {t('Check again')}
            </button>
            <button className="btn ghost small" onClick={onOpenSettings}>
              {t('Open runtime settings')}
            </button>
            <button
              className="btn ghost small"
              onClick={() => void window.kryvex?.openExternal(MODEL_SOURCES.huggingface)}
            >
              <Icon name="external" size={13} /> {t('Get a model')}
            </button>
          </div>
        </div>
      ) : null}

      {status === 'unavailable' && !isElectron ? (
        <div className="assistant-notice" role="status">
          <strong>{t('Vexium needs the desktop app.')}</strong>
          <p>
            {t(
              'The web preview cannot reach a loopback model server. Run the Electron build to use the assistant.',
            )}
          </p>
        </div>
      ) : null}

      <div className="assistant-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <span className="assistant-empty-mark" aria-hidden="true">
              <Icon name="spark" size={26} />
            </span>
            <h2>{t('Ask the model you already run.')}</h2>
            <p>
              {t(
                'Prompts and replies stay in this window. Nothing is written to disk and nothing leaves your machine.',
              )}
            </p>
            <div className="assistant-suggestions">
              {ASSISTANT_SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion}
                  className="assistant-suggestion"
                  disabled={status !== 'online' || !model}
                  onClick={() => void send(suggestion)}
                >
                  {t(suggestion)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article key={index} className={`assistant-message is-${message.role}`}>
              <span className="mono assistant-role">
                {message.role === 'user' ? t('YOU') : 'VEXIUM'}
              </span>
              <div className="assistant-body">
                {message.content ? (
                  message.content
                ) : requestId && index === messages.length - 1 ? (
                  <span className="assistant-typing" aria-label={t('Thinking')}>
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>

      {error ? (
        <div className="assistant-error" role="alert">
          <Icon name="warning" size={14} />
          <p>{t(ERROR_COPY[error] ?? 'The assistant could not complete that request.')}</p>
          {error === 'no-model' ? (
            <button className="btn ghost small" onClick={onOpenSettings}>
              {t('Pick a model')}
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="assistant-composer"
        onSubmit={event => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          value={draft}
          rows={2}
          placeholder={t('Ask Vexium…')}
          aria-label={t('Message Vexium')}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
        />
        <div className="assistant-composer-foot">
          <span className="mono">
            {t('Enter sends · Shift Enter adds a line · session only')}
          </span>
          {requestId ? (
            <button type="button" className="btn secondary small" onClick={cancel}>
              {t('Stop')}
            </button>
          ) : (
            <button type="submit" className="btn primary small" disabled={!canSend}>
              {t('Send')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
