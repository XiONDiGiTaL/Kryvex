import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { LexiumSettings } from '../types';
import { useT } from '../lib/i18n';
import {
  AUDIO_ACCEPT,
  ENGINE_LABELS,
  LEXIUM_LANGUAGES,
  OCR_LANGUAGES,
  TRANSLATION_LIMIT,
  WHISPER_MODELS,
  audioValidation,
  cleanLanguage,
  formatBytes,
  formatClock,
  guessLanguage,
  healthEndpoint,
  imageValidation,
  isLocalSpeechEngine,
  languageName,
  normalizeBaseUrl,
  transcribeAudio,
  transcriptAsSrt,
  transcriptAsText,
  translateText,
  wordCount,
  type LexiumFailure,
  type Transcript,
} from '../lib/lexium';
import { transcribeWithBridge } from '../lib/lexium-bridge';
import { recognizerFor } from '../lib/lexium-dictation';
import { loadAudioFile, type LoadedAudio } from '../lib/lexium-audio';
import { readImageText } from '../lib/lexium-ocr';
import { ElementMark } from '../components/ElementMark';
import { LexiumServerSetup } from '../components/LexiumServerSetup';
import { Icon } from '../components/ui';

type Tab = 'transcribe' | 'translate' | 'image';
type EngineState = 'idle' | 'checking' | 'ready' | 'offline';

function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function Lexium({
  settings,
  onUpdate,
  onBack,
  onToast,
}: {
  settings: LexiumSettings;
  onUpdate: (patch: Partial<LexiumSettings>) => void;
  onBack: () => void;
  onToast: (message: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('transcribe');

  /* ------------------------------------------------------------ transcriber --- */
  const audioInput = useRef<HTMLInputElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [audio, setAudio] = useState<LoadedAudio | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [engineDetail, setEngineDetail] = useState<string>('');
  /** Recogniser cultures the PC engine reported, for the language check. */
  const [cultures, setCultures] = useState<string[]>([]);
  /** How much to trust the transcript this PC produced, if it produced one. */
  const [dictation, setDictation] = useState<'ok' | 'uncertain' | null>(null);

  /* ------------------------------------------------------------- translator --- */
  const [source, setSource] = useState('auto');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [detected, setDetected] = useState('');
  const [provider, setProvider] = useState<'libre' | 'mymemory' | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  /* ------------------------------------------------------------------- image --- */
  const [image, setImage] = useState<{ name: string; url: string; size: number; file: File } | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);

  const guessed = useMemo(() => (input.trim() ? guessLanguage(input) : 'und'), [input]);
  const speechReady = engineState === 'ready';

  // Opening the tool checks the engine once, so a server that is already
  // running shows READY without the user hunting for the button, and a first
  // run shows the setup path instead of a silent failure later. Changing the
  // engine or its address re-checks it: picking a server should say whether it
  // answers without a second click.
  useEffect(() => {
    void checkEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.engine, settings.baseUrl]);

  function useDetectedServer(engine: LexiumSettings['engine'], baseUrl: string) {
    onUpdate({ engine, baseUrl, migrated: true });
    setEngineState('idle');
    setEngineDetail('');
    onToast(t('Speech server set to {url}.', { url: baseUrl }), 'success');
  }

  /**
   * The engine Windows already has: no address, no download, nothing to start.
   * `migrated` is written here too, so this choice is never undone by the
   * one-time move off the old default.
   */
  function useThisPcEngine() {
    onUpdate({ engine: 'windows-speech', baseUrl: '', migrated: true });
    setEngineState('idle');
    setEngineDetail('');
    setTranscribeError(null);
    onToast(t('Transcribing on this PC from now on.'), 'success');
  }

  /**
   * Why the PC speech engine is not answering.
   *
   * The reasons are told apart on purpose: an engine that is not run by this
   * build, a machine with no recogniser installed, and a broken script need
   * three different answers, and none of them is "the server is offline".
   */
  function localEngineProblem(reason?: string): string {
    if (reason === 'unsupported') {
      return t(
        'This build cannot run the PC speech engine. Use the desktop app, or start a server below.',
      );
    }
    if (reason === 'no-recognizer') {
      return t(
        'This PC has no speech recogniser installed. Add a language with speech in Windows settings, or start a server below.',
      );
    }
    if (reason === 'wrong-language') {
      return t(
        'This PC has a dictation engine for {installed} only, so it cannot hear {language}. Add that language with speech in Windows settings, or use a Whisper server, which handles it far better.',
        {
          installed: cultures.length > 0 ? cultures.join(', ') : t('no language'),
          language: settings.language === 'auto' ? t('this language') : languageName(settings.language),
        },
      );
    }
    return t('The speech engine on this PC could not be started. Start a server below instead.');
  }

  function failureCopy(error: LexiumFailure, status?: number, detail?: string): string {
    // The in-box engine reports a reason code in `detail` instead of a status.
    if (isLocalSpeechEngine(settings.engine)) {
      if (error === 'empty') return t('The speech engine did not hear any words in that file.');
      return localEngineProblem(detail);
    }
    if (error === 'offline') {
      return window.kryvex?.lexiumTranscribe
        ? t(
            'Nothing answered at {url}. Start the transcription server, check its port, and make sure it is listening on 127.0.0.1 rather than only inside a container.',
            { url: normalizeBaseUrl(settings.baseUrl) || settings.baseUrl },
          )
        : t(
            'No answer from the server. Start it, check the address, and allow localhost requests if a browser blocks the connection. An HTTPS page cannot call a plain http:// server on your network, so use https:// or run the client locally.',
          );
    }
    if (error === 'invalid') return t('Set a valid http:// address first.');
    if (error === 'empty') return t('The server answered without any text.');
    if (error === 'http') {
      return detail
        ? t('The server answered {status}: {detail}', { status: status ?? 0, detail })
        : t('The server answered {status}.', { status: status ?? 0 });
    }
    return t('That request is not supported by this server.');
  }

  async function checkEngine() {
    const bridge = window.kryvex;
    // The PC engine has no address to fetch: the main process reports whether
    // this machine has a recogniser, and which languages it covers.
    if (isLocalSpeechEngine(settings.engine)) {
      if (!bridge?.lexiumProbe) {
        setEngineState('offline');
        setEngineDetail(localEngineProblem('unsupported'));
        return;
      }
      setEngineState('checking');
      setEngineDetail('');
      try {
        const answer = await bridge.lexiumProbe({ engine: settings.engine, baseUrl: '' });
        // The probe reports the installed cultures; the transcribe button needs
        // them to refuse a language this machine has no recogniser for.
        setCultures(
          answer?.ok && answer.detail
            ? answer.detail
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
            : [],
        );
        if (answer?.ok) {
          setEngineState('ready');
          setEngineDetail(
            answer.detail
              ? t('This PC is listening ({languages}).', { languages: answer.detail })
              : t('The speech engine on this PC is ready.'),
          );
        } else {
          setEngineState('offline');
          setEngineDetail(localEngineProblem(answer?.detail));
        }
      } catch {
        setCultures([]);
        setEngineState('offline');
        setEngineDetail(localEngineProblem('powershell'));
      }
      return;
    }
    setCultures([]);
    const endpoint = healthEndpoint(settings.engine, settings.baseUrl);
    if (!endpoint) {
      setEngineState('offline');
      setEngineDetail(t('Set a valid http:// address first.'));
      return;
    }
    setEngineState('checking');
    setEngineDetail('');
    // The desktop app probes from the main process: a renderer request can be
    // refused by CORS before it ever reaches a working server, which would make
    // a healthy engine look offline.
    if (bridge?.lexiumProbe) {
      try {
        const answer = await bridge.lexiumProbe({
          engine: settings.engine,
          baseUrl: settings.baseUrl,
        });
        if (answer?.ok) {
          setEngineState('ready');
          setEngineDetail(
            t('Connected to {url}.', { url: normalizeBaseUrl(settings.baseUrl) }),
          );
        } else {
          setEngineState('offline');
          setEngineDetail(
            answer?.error === 'offline'
              ? t('No answer from {url}. The address is reachable but nothing is listening there.', {
                  url: normalizeBaseUrl(settings.baseUrl) || settings.baseUrl,
                })
              : t('The server answered HTTP {status}.', { status: answer?.status ?? 0 }),
          );
        }
      } catch {
        setEngineState('offline');
        setEngineDetail(t('The health check could not run.'));
      }
      return;
    }
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000) });
      setEngineState(response.ok ? 'ready' : 'offline');
      setEngineDetail(
        response.ok ? t('Connected to {url}.', { url: normalizeBaseUrl(settings.baseUrl) }) : `HTTP ${response.status}`,
      );
    } catch {
      setEngineState('offline');
      setEngineDetail(
        t('No answer from {url}. Start the engine or change the address.', {
          url: normalizeBaseUrl(settings.baseUrl) || settings.baseUrl,
        }),
      );
    }
  }

  async function acceptAudio(file: File | undefined) {
    if (!file) return;
    const problem = audioValidation(file.name, file.size);
    if (problem) {
      setAudioError(t(problem));
      onToast(t(problem), 'danger');
      return;
    }
    setDecoding(true);
    setAudioError(null);
    setTranscript(null);
    setTranscribeError(null);
    try {
      const loaded = await loadAudioFile(file);
      setAudio(loaded);
    } catch {
      setAudioError(
        t('Kryvex could not decode that file. Try a WAV or MP3 export of the same recording.'),
      );
    } finally {
      setDecoding(false);
    }
  }

  async function runTranscription() {
    if (!audio) return;
    setTranscribeError(null);
    setDictation(null);

    // The PC engine is language-specific and does not refuse foreign audio: it
    // answers in the one language it knows, which is how a Turkish song became
    // fluent English nonsense. Ask before sending anything.
    if (isLocalSpeechEngine(settings.engine) && cultures.length > 0) {
      if (!recognizerFor(cultures, settings.language)) {
        setTranscript(null);
        setTranscribeError(localEngineProblem('wrong-language'));
        return;
      }
    }

    setTranscribing(true);
    const filename = `${audio.name.replace(/\.[^.]+$/, '') || 'audio'}.wav`;
    const bridge = window.kryvex;
    const result = bridge?.lexiumTranscribe
      ? await transcribeWithBridge(bridge, {
          engine: settings.engine,
          baseUrl: settings.baseUrl,
          model: settings.model,
          language: settings.language,
          audio: audio.wav,
          filename,
        })
      : await transcribeAudio({
          engine: settings.engine,
          baseUrl: settings.baseUrl,
          model: settings.model,
          language: settings.language,
          audio: audio.wav,
          filename,
        });
    setTranscribing(false);
    if (!result.ok) {
      setTranscribeError(
        failureCopy(
          result.error ?? 'offline',
          result.status,
          'detail' in result ? result.detail : undefined,
        ),
      );
      return;
    }
    setTranscript(result.transcript ?? null);
    // A verdict only arrives from the in-box engine; a server's answer stands
    // on its own and is not labelled.
    const verdict = 'verdict' in result ? result.verdict : undefined;
    setDictation(
      isLocalSpeechEngine(settings.engine) ? (verdict === 'uncertain' ? 'uncertain' : 'ok') : null,
    );
    onToast(
      t('Transcribed {duration} of audio.', { duration: formatClock(audio.duration) }),
      'success',
    );
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onToast(t('{label} copied.', { label }), 'success');
    } catch {
      onToast(t('The clipboard is not available.'), 'warning');
    }
  }

  async function runTranslation() {
    const text = input.trim();
    if (!text || translating) return;
    setTranslating(true);
    setTranslateError(null);
    const result = await translateText({
      text,
      source,
      target: settings.target,
      baseUrl: settings.translateUrl,
      apiKey: settings.apiKey,
    });
    setTranslating(false);
    if (!result.ok) {
      setTranslateError(failureCopy(result.error, result.status));
      return;
    }
    setOutput(result.text);
    setDetected(result.source || (source !== 'auto' ? source : guessed === 'und' ? '' : guessed));
    setProvider(result.provider);
  }

  function sendToTranslator(text: string) {
    if (!text.trim()) return;
    setInput(text);
    setOutput('');
    setProvider(null);
    setTranslateError(null);
    setDetected('');
    setTab('translate');
  }

  async function acceptImage(file: File | undefined) {
    if (!file) return;
    const problem = imageValidation(file.name, file.size);
    if (problem) {
      setOcrError(t(problem));
      return;
    }
    setImage({ name: file.name, url: URL.createObjectURL(file), size: file.size, file });
    setOcrText('');
    setOcrError(null);
    setOcrProgress(0);
  }

  async function runOcr() {
    if (!image || reading) return;
    setReading(true);
    setOcrError(null);
    setOcrProgress(0);
    try {
      const result = await readImageText(image.file, settings.ocrLanguage, setOcrProgress);
      setOcrText(result.text);
      if (!result.text) onToast(t('No text was found in that image.'), 'warning');
    } catch {
      setOcrError(
        t('The reader could not start. It loads once from a CDN, so this needs a connection the first time.'),
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <section className="view lexium-view">
      <header className="view-head">
        <div className="tool-head">
          <ElementMark tool="lexium" size={62} />
          <div>
            <p className="eyebrow mono">{t('SECRET SERVICE / IN-HOUSE · x530')}</p>
            <h1>{t('Lexium')}</h1>
            <p className="lede">
              {t(
                'Transcribe recordings, translate messages and read text out of images. Speech and translation stay on servers you point it at.',
              )}
            </p>
          </div>
        </div>
        <button className="btn secondary" onClick={onBack}>
          <Icon name="back" size={15} />
          {t('All services')}
        </button>
      </header>

      <div className="lexium-tabs" role="tablist" aria-label={t('Lexium tools')}>
        {(
          [
            { id: 'transcribe' as Tab, label: t('Transcribe'), icon: 'mic' as const },
            { id: 'translate' as Tab, label: t('Translate'), icon: 'language' as const },
            { id: 'image' as Tab, label: t('From image'), icon: 'image' as const },
          ]
        ).map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`lexium-tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
        <span className="lexium-tab-grow" />
        <span className={`lexium-engine-dot ${speechReady ? 'is-ready' : engineState === 'offline' ? 'is-down' : ''}`}>
          <span className="status-dot" />
          <span className="mono">
            {ENGINE_LABELS[settings.engine]} ·{' '}
            {speechReady
              ? t('READY')
              : engineState === 'offline'
                ? t('OFFLINE')
                : engineState === 'checking'
                  ? t('Checking…')
                  : t('NOT CHECKED')}
          </span>
        </span>
      </div>

      {tab === 'transcribe' ? (
        <div className="lexium-panel">
          <div
            className="lexium-drop"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              void acceptAudio(event.dataTransfer?.files?.[0]);
            }}
          >
            <input
              ref={audioInput}
              type="file"
              accept={AUDIO_ACCEPT}
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void acceptAudio(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {audio ? (
              <>
                <div className="lexium-audio-head">
                  <Icon name="music" size={18} />
                  <div>
                    <strong>{audio.name}</strong>
                    <span className="mono">
                      {formatClock(audio.duration)} · {formatBytes(audio.size)} · 16 kHz mono WAV
                    </span>
                  </div>
                  <button
                    className="btn ghost tiny"
                    onClick={() => {
                      setAudio(null);
                      setTranscript(null);
                      URL.revokeObjectURL(audio.url);
                    }}
                  >
                    {t('Replace')}
                  </button>
                </div>
                <div className="lexium-wave" aria-hidden="true">
                  {audio.peaks.map((peak, index) => (
                    <span key={index} style={{ height: `${Math.max(6, peak * 100)}%` }} />
                  ))}
                </div>
                <audio className="lexium-audio" controls src={audio.url} />
              </>
            ) : (
              <button className="lexium-drop-empty" onClick={() => audioInput.current?.click()}>
                <Icon name="upload" size={22} />
                <strong>{decoding ? t('Decoding audio…') : t('Choose an audio file')}</strong>
                <span>
                  {t('MP3, WAV, M4A, AAC, OGG, FLAC, WebM or MP4 · up to 150 MB · decoded on this device')}
                </span>
              </button>
            )}
          </div>

          {audioError ? <p className="lexium-error">{audioError}</p> : null}

          <div className="lexium-row">
            <label className="field lexium-field">
              <span>{t('Spoken language')}</span>
              <select
                value={settings.language}
                onChange={event => onUpdate({ language: event.target.value })}
              >
                <option value="auto">{t('Detect automatically')}</option>
                {LEXIUM_LANGUAGES.map(language => (
                  <option key={language.code} value={language.code}>
                    {language.name} · {language.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn primary lexium-run"
              onClick={() => void runTranscription()}
              disabled={!audio || transcribing || decoding}
            >
              <Icon name="mic" size={15} />
              {transcribing ? t('Transcribing…') : t('Transcribe')}
            </button>
          </div>

          {transcribeError ? <p className="lexium-error">{transcribeError}</p> : null}

          {/* A first run has no server, so the failure is paired with the way out
              instead of leaving the user at an error line. */}
          {transcribeError || engineState === 'offline' ? (
            <details className="lexium-setup-details" open={Boolean(transcribeError)}>
              <summary>{t('Set up a server')}</summary>
              <LexiumServerSetup
                onPick={useDetectedServer}
                onCopy={(value, label) => void copy(value, label)}
                onUseThisPc={useThisPcEngine}
                usingThisPc={isLocalSpeechEngine(settings.engine)}
              />
            </details>
          ) : null}

          {transcript ? (
            <div className="lexium-result">
              <div className="lexium-result-head">
                <span className="mono">
                  {t('TRANSCRIPT')} ·{' '}
                  {transcript.language ? languageName(transcript.language) : t('unknown')} ·{' '}
                  {wordCount(transcript.text)} {t('words')}
                </span>
                <div className="lexium-result-actions">
                  <button
                    className="btn ghost tiny"
                    onClick={() => void copy(transcriptAsText(transcript), t('Transcript'))}
                  >
                    <Icon name="copy" size={13} />
                    {t('Copy')}
                  </button>
                  <button
                    className="btn ghost tiny"
                    onClick={() => download('lexium-transcript.txt', transcriptAsText(transcript))}
                  >
                    <Icon name="download" size={13} />
                    .txt
                  </button>
                  <button
                    className="btn ghost tiny"
                    onClick={() =>
                      download('lexium-transcript.srt', transcriptAsSrt(transcript), 'text/plain')
                    }
                  >
                    <Icon name="download" size={13} />
                    .srt
                  </button>
                  <button
                    className="btn secondary tiny"
                    onClick={() => sendToTranslator(transcriptAsText(transcript))}
                  >
                    <Icon name="language" size={13} />
                    {t('Translate transcript')}
                  </button>
                </div>
              </div>
              {dictation === 'uncertain' ? (
                <p className="lexium-dictation is-uncertain">
                  {t(
                    'The engine was not confident about these words. For accents, music, singing or several speakers a Whisper server is far more accurate.',
                  )}
                </p>
              ) : dictation === 'ok' ? (
                <p className="lexium-dictation">
                  {t(
                    'Dictated on this PC by the speech engine Windows ships. Clear speech only: a Whisper server is far more accurate for accents, music and several speakers.',
                  )}
                </p>
              ) : null}
              <textarea
                className="lexium-transcript"
                value={transcript.text}
                onChange={event =>
                  setTranscript(current =>
                    current ? { ...current, text: event.target.value } : current,
                  )
                }
                rows={8}
                spellCheck={false}
                aria-label={t('Transcript')}
              />
              {transcript.segments.length > 0 ? (
                <ol className="lexium-segments">
                  {transcript.segments.map((segment, index) => (
                    <li key={index}>
                      <span className="mono">{formatClock(segment.start)}</span>
                      <span>{segment.text}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <p className="lexium-hint">
              {isLocalSpeechEngine(settings.engine)
                ? t(
                    'The words are read on this PC by the speech engine Windows already has. Nothing is uploaded and Vexium Core is not involved: it answers text, it cannot hear audio.',
                  )
                : t(
                    'Nothing leaves this device except the audio sent to the speech server you configured. Vexium Core answers text, so speech-to-text talks to a Whisper engine: start one below and nothing else needs a server.',
                  )}
            </p>
          )}
        </div>
      ) : null}

      {tab === 'translate' ? (
        <div className="lexium-panel">
          <div className="lexium-pair">
            <div className="lexium-side">
              <div className="lexium-side-head">
                <select
                  value={source}
                  onChange={event => setSource(event.target.value)}
                  aria-label={t('Source language')}
                >
                  <option value="auto">{t('Detect language')}</option>
                  {LEXIUM_LANGUAGES.map(language => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
                <span className="mono">
                  {wordCount(input)} {t('words')} · {input.length}/{TRANSLATION_LIMIT}
                </span>
              </div>
              <textarea
                value={input}
                onChange={event => {
                  setInput(event.target.value);
                  setOutput('');
                  setProvider(null);
                  setTranslateError(null);
                }}
                placeholder={t('Paste a message you received…')}
                rows={9}
                maxLength={TRANSLATION_LIMIT}
                aria-label={t('Text to translate')}
                spellCheck={false}
              />
              <div className="lexium-side-foot">
                <span className="mono lexium-detect">
                  {source === 'auto' && input.trim()
                    ? `${t('looks like')} ${guessed === 'und' ? t('unknown') : languageName(guessed)}`
                    : ''}
                </span>
                <button className="btn ghost tiny" onClick={() => setInput('')} disabled={!input}>
                  {t('Clear')}
                </button>
              </div>
            </div>

            <div className="lexium-swap">
              <button
                className="icon-btn"
                onClick={() => {
                  if (!output) return;
                  setInput(output);
                  setOutput('');
                  setSource(settings.target);
                  onUpdate({ target: detected || cleanLanguage(guessed, 'en') });
                }}
                title={t('Swap languages')}
                aria-label={t('Swap languages')}
                disabled={!output}
              >
                <Icon name="reload" size={15} />
              </button>
            </div>

            <div className="lexium-side">
              <div className="lexium-side-head">
                <select
                  value={settings.target}
                  onChange={event => onUpdate({ target: event.target.value })}
                  aria-label={t('Target language')}
                >
                  {LEXIUM_LANGUAGES.map(language => (
                    <option key={language.code} value={language.code}>
                      {language.name}
                    </option>
                  ))}
                </select>
                <span className="mono">{provider === 'libre' ? 'LibreTranslate' : provider === 'mymemory' ? 'MyMemory' : ''}</span>
              </div>
              <textarea
                value={output}
                readOnly
                placeholder={t('The translation appears here.')}
                rows={9}
                aria-label={t('Translation')}
                spellCheck={false}
              />
              <div className="lexium-side-foot">
                <span className="mono lexium-detect">
                  {detected ? `${t('detected')} ${languageName(detected)}` : ''}
                </span>
                <button
                  className="btn ghost tiny"
                  onClick={() => void copy(output, t('Translation'))}
                  disabled={!output}
                >
                  <Icon name="copy" size={13} />
                  {t('Copy')}
                </button>
              </div>
            </div>
          </div>

          <div className="lexium-row">
            <button
              className="btn primary"
              onClick={() => void runTranslation()}
              disabled={!input.trim() || translating}
            >
              <Icon name="language" size={15} />
              {translating ? t('Translating…') : t('Translate')}
            </button>
            {provider === 'mymemory' ? (
              <span className="mono lexium-provider">
                {t('Local server was unreachable: answered by the public MyMemory API.')}
              </span>
            ) : null}
          </div>
          {translateError ? <p className="lexium-error">{translateError}</p> : null}
          <p className="lexium-hint">
            {t(
              'Text is sent to the LibreTranslate server in the engine panel. If that server is offline, Lexium falls back to the keyless MyMemory API and labels the answer; turn the fallback off by pointing at your own server.',
            )}
          </p>
        </div>
      ) : null}

      {tab === 'image' ? (
        <div className="lexium-panel">
          <div className="lexium-image-grid">
            <div className="lexium-image-side">
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp,image/gif"
                hidden
                onChange={event => {
                  void acceptImage(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              {image ? (
                <img className="lexium-image" src={image.url} alt={image.name} />
              ) : (
                <button className="lexium-drop-empty" onClick={() => imageInput.current?.click()}>
                  <Icon name="image" size={22} />
                  <strong>{t('Choose an image')}</strong>
                  <span>{t('Screenshots, photos of signs, chat captures. Read on this device.')}</span>
                </button>
              )}
              <div className="lexium-row">
                <label className="field lexium-field">
                  <span>{t('Text language')}</span>
                  <select
                    value={settings.ocrLanguage}
                    onChange={event => onUpdate({ ocrLanguage: event.target.value })}
                  >
                    {OCR_LANGUAGES.map(language => (
                      <option key={language.code} value={language.code}>
                        {language.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn primary"
                  onClick={() => void runOcr()}
                  disabled={!image || reading}
                >
                  <Icon name="search" size={15} />
                  {reading ? `${t('Reading…')} ${Math.round(ocrProgress * 100)}%` : t('Read text')}
                </button>
              </div>
              {ocrError ? <p className="lexium-error">{ocrError}</p> : null}
            </div>

            <div className="lexium-image-result">
              <div className="lexium-side-head">
                <span className="mono">{t('EXTRACTED TEXT')}</span>
                {image ? <span className="mono">{formatBytes(image.size)}</span> : null}
              </div>
              <textarea
                value={ocrText}
                onChange={event => setOcrText(event.target.value)}
                placeholder={t('Text found in the image appears here. You can edit it before translating.')}
                rows={10}
                aria-label={t('Extracted text')}
                spellCheck={false}
              />
              <div className="lexium-row">
                <button
                  className="btn ghost tiny"
                  onClick={() => void copy(ocrText, t('Extracted text'))}
                  disabled={!ocrText}
                >
                  <Icon name="copy" size={13} />
                  {t('Copy')}
                </button>
                <button
                  className="btn secondary"
                  onClick={() => sendToTranslator(ocrText)}
                  disabled={!ocrText.trim()}
                >
                  <Icon name="language" size={14} />
                  {t('Translate this text')}
                </button>
              </div>
            </div>
          </div>
          <p className="lexium-hint">
            {t(
              'The reader uses Tesseract, downloaded once from a CDN with the language pack you pick. The image itself never leaves the app.',
            )}
          </p>
        </div>
      ) : null}

      <details className="lexium-engine">
        <summary>
          <Icon name="sliders" size={14} />
          {t('Engines and languages')}
          <span className="mono">{ENGINE_LABELS[settings.engine]}</span>
        </summary>

        <div className="lexium-engine-grid">
          <label className="field">
            <span>{t('Speech engine')}</span>
            <select
              value={settings.engine}
              onChange={event =>
                onUpdate({ engine: event.target.value as LexiumSettings['engine'] })
              }
            >
              <option value="local-whisper">local-whisper (POST /transcribe)</option>
              <option value="whisper-cpp">whisper.cpp server (POST /inference)</option>
              <option value="openai">OpenAI-compatible (/v1/audio/transcriptions)</option>
            </select>
          </label>

          <label className="field">
            <span>{t('Speech server')}</span>
            <input
              value={settings.baseUrl}
              onChange={event => {
                onUpdate({ baseUrl: event.target.value });
                setEngineState('idle');
              }}
              placeholder="http://localhost:8000"
              spellCheck={false}
            />
          </label>

          {settings.engine === 'local-whisper' ? (
            <label className="field">
              <span>{t('Whisper model')}</span>
              <select
                value={settings.model}
                onChange={event => onUpdate({ model: event.target.value })}
              >
                {WHISPER_MODELS.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>{t('Model name')}</span>
              <input
                value={settings.model}
                onChange={event => onUpdate({ model: event.target.value })}
                placeholder="whisper-1"
                spellCheck={false}
              />
            </label>
          )}

          <label className="field">
            <span>{t('Translation server')}</span>
            <input
              value={settings.translateUrl}
              onChange={event => onUpdate({ translateUrl: event.target.value })}
              placeholder="http://localhost:5000"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>{t('LibreTranslate API key')}</span>
            <input
              value={settings.apiKey}
              onChange={event => onUpdate({ apiKey: event.target.value })}
              placeholder={t('Optional, for hosted instances')}
              spellCheck={false}
            />
          </label>

          <div className="lexium-engine-check">
            <button className="btn secondary" onClick={() => void checkEngine()} disabled={engineState === 'checking'}>
              <Icon name="reload" size={14} />
              {engineState === 'checking' ? t('Checking…') : t('Check speech engine')}
            </button>
            <span className={`mono lexium-check ${engineState}`}>
              {engineState === 'ready'
                ? t('READY')
                : engineState === 'offline'
                  ? t('OFFLINE')
                  : t('NOT CHECKED')}
            </span>
          </div>
        </div>

        {engineDetail ? <p className="lexium-hint">{engineDetail}</p> : null}

        <LexiumServerSetup
          onPick={useDetectedServer}
          onCopy={(value, label) => void copy(value, label)}
          onUseThisPc={useThisPcEngine}
          usingThisPc={isLocalSpeechEngine(settings.engine)}
        />

        <div className="lexium-commands is-single">
          <div>
            <span className="mono">{'LibreTranslate'}</span>
            <code>{'docker run -ti --rm -p 5000:5000 libretranslate/libretranslate'}</code>
          </div>
        </div>
        <p className="lexium-hint">
          {t(
            'Audio is decoded to 16 kHz mono WAV in the renderer, so the server never needs ffmpeg for an imported MP3. Point these fields at a machine on your network if the model runs elsewhere.',
          )}
        </p>
      </details>

      <p className="footnote mono">
        {t('IN-HOUSE TOOL · NO TELEMETRY · AUDIO AND TEXT ARE NOT STORED')}
      </p>
    </section>
  );
}
