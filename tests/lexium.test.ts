import { describe, expect, it, vi } from 'vitest';
import {
  cleanLanguage,
  cleanOcrLanguage,
  chunkText,
  encodeWav,
  formatClock,
  guessLanguage,
  imageValidation,
  audioValidation,
  languageName,
  parseLibreTranslation,
  parseMyMemory,
  parseTranscription,
  resample,
  transcriptionEndpoint,
  translationEndpoint,
  transcribeAudio,
  transcriptAsSrt,
  translateText,
  waveformPeaks,
  downmix,
} from '../src/lib/lexium';
import {
  nextIndex,
  classifyMediaLink,
  titleFromUrl,
  platformFor,
  clampVolume,
  nextRepeatMode,
} from '../src/lib/player';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('language helpers', () => {
  it('only accepts known codes and keeps auto as a source', () => {
    expect(cleanLanguage('DE')).toBe('de');
    expect(cleanLanguage('auto')).toBe('auto');
    expect(cleanLanguage('klingon')).toBe('auto');
    expect(cleanLanguage('xx', 'en')).toBe('en');
    expect(languageName('tr')).toBe('Turkish');
    expect(languageName('auto')).toBe('Detect');
  });

  it('detects scripts before guessing Latin stop words', () => {
    expect(guessLanguage('Привет, как дела?')).toBe('ru');
    expect(guessLanguage('Привіт, як справи?')).toBe('uk');
    expect(guessLanguage('こんにちは、元気ですか')).toBe('ja');
    expect(guessLanguage('안녕하세요 반갑습니다')).toBe('ko');
    expect(guessLanguage('你好，今天怎么样')).toBe('zh');
    expect(guessLanguage('مرحبا كيف حالك')).toBe('ar');
    expect(guessLanguage('שלום מה שלומך')).toBe('he');
    expect(guessLanguage('Γεια σου τι κάνεις')).toBe('el');
    expect(guessLanguage('नमस्ते आप कैसे हैं')).toBe('hi');
  });

  it('votes on Latin function words and stays neutral on noise', () => {
    expect(guessLanguage('Das ist nicht mein Buch und das ist gut')).toBe('de');
    expect(guessLanguage('esto es una prueba para el equipo')).toBe('es');
    expect(guessLanguage('merhaba nasıl gidiyor bugün sen ne yapıyorsun')).toBe('tr');
    expect(guessLanguage('1234 !!!')).toBe('und');
    expect(guessLanguage('')).toBe('und');
  });

  it('keeps OCR packs on the supported list', () => {
    expect(cleanOcrLanguage('tur')).toBe('tur');
    expect(cleanOcrLanguage('klingon')).toBe('eng');
    expect(cleanOcrLanguage(undefined)).toBe('eng');
  });

  it('formats media clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('text chunking', () => {
  it('keeps short text whole and splits long text at sentences', () => {
    expect(chunkText('  hello  ')).toEqual(['hello']);
    const long = `${'This is a sentence about the harbour. '.repeat(20)}Final line.`;
    const chunks = chunkText(long, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(120);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' '));
  });

  it('returns nothing for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });
});

describe('audio rules', () => {
  it('accepts the formats the decoder handles', () => {
    expect(audioValidation('talk.mp3', 1024)).toBeNull();
    expect(audioValidation('voice.WAV', 1024)).toBeNull();
    expect(audioValidation('voice.wav', 0)).not.toBeNull();
    expect(audioValidation('clip.avi', 1024)).not.toBeNull();
    expect(audioValidation('huge.mp3', 200 * 1024 * 1024)).not.toBeNull();
    expect(imageValidation('shot.PNG', 1024)).toBeNull();
    expect(imageValidation('shot.pdf', 1024)).not.toBeNull();
  });
});

describe('wav pipeline', () => {
  it('downmixes and resamples to 16 kHz mono', () => {
    const left = new Float32Array([1, 1, 1, 1]);
    const right = new Float32Array([0, 0, 0, 0]);
    expect([...downmix([left, right])]).toEqual([0.5, 0.5, 0.5, 0.5]);
    const resampled = resample(new Float32Array(48000), 48000, 16000);
    expect(resampled.length).toBe(16000);
  });

  it('writes a valid 16-bit PCM header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const buffer = encodeWav(samples, 16000);
    const view = new DataView(buffer);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(buffer, offset, length));
    expect(buffer.byteLength).toBe(44 + samples.length * 2);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16383);
  });

  it('normalises waveform peaks for the UI strip', () => {
    const peaks = waveformPeaks(new Float32Array([0, 0.25, 0, 0.5, 0, 1, 0, 0]), 4);
    expect(peaks).toHaveLength(4);
    expect(Math.max(...peaks)).toBe(1);
    expect(waveformPeaks(new Float32Array(0), 4)).toEqual([]);
  });
});

describe('server endpoints', () => {
  it('builds the endpoint each engine actually serves', () => {
    expect(transcriptionEndpoint('local-whisper', 'http://localhost:8000/')).toBe(
      'http://localhost:8000/transcribe',
    );
    expect(transcriptionEndpoint('whisper-cpp', 'http://127.0.0.1:8080')).toBe(
      'http://127.0.0.1:8080/inference',
    );
    expect(transcriptionEndpoint('openai', 'http://localhost:8080')).toBe(
      'http://localhost:8080/v1/audio/transcriptions',
    );
    expect(transcriptionEndpoint('openai', 'http://localhost:8080/v1')).toBe(
      'http://localhost:8080/v1/audio/transcriptions',
    );
    expect(transcriptionEndpoint('local-whisper', 'file:///tmp')).toBe('');
    expect(translationEndpoint('http://localhost:5000')).toBe('http://localhost:5000/translate');
  });
});

describe('response parsing', () => {
  it('reads every transcription envelope', () => {
    expect(parseTranscription({ text: ' hello ' }).text).toBe('hello');
    expect(parseTranscription({ transcript: 'nested' }).text).toBe('nested');
    expect(parseTranscription({ result: { text: 'deep' } }).text).toBe('deep');
    expect(parseTranscription('plain text').text).toBe('plain text');
    const cpp = parseTranscription({
      text: 'hi',
      language: 'en',
      segments: [{ offsets: { from: 1000, to: 2500 }, text: 'hi' }],
    });
    expect(cpp.segments[0]).toEqual({ start: 1, end: 2.5, text: 'hi' });
    const openai = parseTranscription({
      text: 'bonjour',
      language: 'fr',
      segments: [{ start: 0, end: 1.4, text: 'bonjour' }],
    });
    expect(openai.language).toBe('fr');
    expect(openai.segments[0]?.end).toBe(1.4);
    expect(parseTranscription({ nonsense: true }).text).toBe('');
  });

  it('reads LibreTranslate and MyMemory answers', () => {
    expect(parseLibreTranslation({ translatedText: 'Hola', detectedLanguage: 'en' })).toEqual({
      text: 'Hola',
      detected: 'en',
    });
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'a &amp; b' } })).toBe(
      'a & b',
    );
    expect(parseMyMemory({ responseStatus: 429, responseData: { translatedText: 'x' } })).toBe('');
  });

  it('builds subtitles with and without segments', () => {
    const srt = transcriptAsSrt({
      text: 'hello world',
      language: 'en',
      segments: [{ start: 0.5, end: 2, text: 'hello world' }],
    });
    expect(srt).toContain('00:00:00,500 --> 00:00:02,000');
    expect(srt).toContain('hello world');
    expect(transcriptAsSrt({ text: 'plain', language: '', segments: [] })).toContain('plain');
  });
});

describe('translateText', () => {
  it('uses the configured LibreTranslate server first', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ translatedText: 'Hola mundo', detectedLanguage: 'en' }),
    ) as unknown as typeof fetch;
    const result = await translateText({
      text: 'Hello world',
      source: 'auto',
      target: 'es',
      baseUrl: 'http://localhost:5000',
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, text: 'Hola mundo', source: 'en', provider: 'libre' });
    const body = JSON.parse(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ q: 'Hello world', target: 'es', source: 'auto', format: 'text' });
  });

  it('falls back to the keyless API when the local server is down', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('localhost')) throw new Error('connect ECONNREFUSED');
      return jsonResponse({ responseStatus: 200, responseData: { translatedText: 'Merhaba' } });
    }) as unknown as typeof fetch;
    const result = await translateText({
      text: 'Hello there',
      source: 'en',
      target: 'tr',
      baseUrl: 'http://localhost:5000',
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, text: 'Merhaba', source: 'en', provider: 'mymemory' });
    expect(calls[1]).toContain('langpair=en%7Ctr');
  });

  it('does not fall back when the caller opts out', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const result = await translateText({
      text: 'Hello',
      source: 'en',
      target: 'de',
      baseUrl: 'http://localhost:5000',
      allowFallback: false,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects empty text and unknown targets without a request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await translateText({ text: '  ', source: 'auto', target: 'de', baseUrl: '', fetchImpl })).toEqual({
      ok: false,
      error: 'empty',
    });
    expect(await translateText({ text: 'hi', source: 'auto', target: 'nope', baseUrl: '', fetchImpl })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends the local guess, and autodetect only when the text is unclear', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse({ responseStatus: 200, responseData: { translatedText: 'x' } });
    }) as unknown as typeof fetch;
    await translateText({
      text: 'MERHABA DUNYA',
      source: 'auto',
      target: 'en',
      baseUrl: '',
      fetchImpl,
    });
    expect(urls[0]).toContain('langpair=tr%7Cen');
    urls.length = 0;
    await translateText({ text: '12345', source: 'auto', target: 'en', baseUrl: '', fetchImpl });
    expect(urls[0]).toContain('langpair=autodetect%7Cen');
  });

  it('chunks long text for the public fallback', async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return jsonResponse({ responseStatus: 200, responseData: { translatedText: 'ok' } });
    }) as unknown as typeof fetch;
    const text = `${'A fairly long sentence about lighthouses. '.repeat(30)}`;
    const result = await translateText({
      text,
      source: 'en',
      target: 'fr',
      baseUrl: '',
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(requests.length).toBeGreaterThan(1);
  });
});

describe('transcribeAudio', () => {
  it('posts a multipart upload and reads the transcript', async () => {
    let captured: FormData | null = null;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init?.body as FormData;
      return jsonResponse({ text: 'hello from the file', language: 'en', segments: [] });
    }) as unknown as typeof fetch;
    const result = await transcribeAudio({
      engine: 'local-whisper',
      baseUrl: 'http://localhost:8000',
      model: 'base',
      language: 'auto',
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
      filename: 'talk.wav',
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.transcript.text).toBe('hello from the file');
    expect(captured).toBeInstanceOf(FormData);
    expect((captured as unknown as FormData).get('model')).toBe('base');
    expect((captured as unknown as FormData).get('language')).toBe('auto');
    expect((captured as unknown as FormData).get('task')).toBe('transcribe');
    expect((captured as unknown as FormData).get('file')).toBeInstanceOf(Blob);
  });

  it('labels whisper.cpp and OpenAI-compatible fields', async () => {
    const bodies: FormData[] = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(init?.body as FormData);
      return jsonResponse({ text: 'ok' });
    }) as unknown as typeof fetch;
    const audio = new Blob(['x'], { type: 'audio/wav' });
    await transcribeAudio({
      engine: 'whisper-cpp',
      baseUrl: 'http://127.0.0.1:8080',
      language: 'tr',
      audio,
      fetchImpl,
    });
    await transcribeAudio({
      engine: 'openai',
      baseUrl: 'http://localhost:8080',
      model: 'whisper-1',
      audio,
      fetchImpl,
    });
    expect(bodies[0]?.get('response_format')).toBe('verbose_json');
    expect(bodies[0]?.get('model')).toBeNull();
    expect(bodies[1]?.get('model')).toBe('whisper-1');
    expect(bodies[1]?.get('response_format')).toBe('verbose_json');
  });

  it('reports an unreachable engine and an empty answer', async () => {
    const offline = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(
      (
        await transcribeAudio({
          engine: 'local-whisper',
          baseUrl: 'http://localhost:8000',
          audio: new Blob(['x']),
          fetchImpl: offline,
        })
      ).ok,
    ).toBe(false);

    const empty = vi.fn(async () => jsonResponse({ text: '   ' })) as unknown as typeof fetch;
    const result = await transcribeAudio({
      engine: 'local-whisper',
      baseUrl: 'http://localhost:8000',
      audio: new Blob(['x']),
      fetchImpl: empty,
    });
    expect(result).toEqual({ ok: false, error: 'empty' });
  });
});

describe('player rules', () => {
  it('recognises platform pages instead of pretending they are files', () => {
    expect(platformFor('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('youtube');
    expect(classifyMediaLink('https://open.spotify.com/track/abc')).toEqual({
      ok: false,
      reason: 'platform',
      platform: { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com' },
    });
    expect(classifyMediaLink('https://example.com/song.mp3')).toMatchObject({
      ok: true,
      kind: 'audio',
      title: 'song',
    });
    expect(classifyMediaLink('https://example.com/clip.webm?x=1')).toMatchObject({
      ok: true,
      kind: 'video',
    });
    expect(classifyMediaLink('not a url')).toEqual({ ok: false, reason: 'invalid' });
    expect(classifyMediaLink('https://example.com/page.html')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('titles links without the extension or query', () => {
    expect(titleFromUrl('https://cdn.example.com/My%20Song.mp3?token=1')).toBe('My Song');
    expect(titleFromUrl('https://example.com/')).toBe('example.com');
  });

  it('advances, loops and stops according to repeat and shuffle', () => {
    const base = { length: 3, shuffle: false, direction: 1 as const };
    expect(nextIndex({ ...base, current: 0, repeat: 'off' })).toBe(1);
    expect(nextIndex({ ...base, current: 2, repeat: 'off', auto: true })).toBe(-1);
    expect(nextIndex({ ...base, current: 2, repeat: 'off' })).toBe(0);
    expect(nextIndex({ ...base, current: 2, repeat: 'all', auto: true })).toBe(0);
    expect(nextIndex({ ...base, current: 1, repeat: 'one', auto: true })).toBe(1);
    expect(nextIndex({ ...base, current: 1, repeat: 'one' })).toBe(2);
    expect(nextIndex({ ...base, current: 0, repeat: 'off', direction: -1 })).toBe(2);
    expect(nextIndex({ ...base, current: 0, repeat: 'off', shuffle: true, random: () => 0.9 })).toBe(2);
    expect(nextIndex({ ...base, current: 1, repeat: 'off', shuffle: true, random: () => 0 })).toBe(0);
    expect(nextIndex({ ...base, current: 0, repeat: 'off', length: 0 })).toBe(-1);
  });

  it('cycles repeat, clamps volume', () => {
    expect(nextRepeatMode('off')).toBe('all');
    expect(nextRepeatMode('all')).toBe('one');
    expect(nextRepeatMode('one')).toBe('off');
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(0.8);
  });
});
