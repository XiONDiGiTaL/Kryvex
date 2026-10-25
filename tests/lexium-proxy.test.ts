import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probe, transcribe } from '../electron/lexium-proxy';
import { lexiumEndpoint, lexiumFilename, lexiumHealthEndpoint } from '../electron/lexium-rules';

/**
 * The proxy exists because a `file://` renderer presents `Origin: null` and a
 * local Whisper server is not obliged to answer a CORS preflight. These tests
 * run the real function against a real HTTP server: the upload, its multipart
 * fields and the reply all cross a socket.
 */

const WAV = Buffer.from('RIFF0000WAVEfmt ', 'ascii');

let server: http.Server;
let base = '';
let seen = { path: '', body: '', contentType: '', fields: {} as Record<string, string> };

beforeAll(async () => {
  server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk as Buffer));
    request.on('end', () => {
      seen = {
        path: request.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: request.headers['content-type'] ?? '',
        fields: {},
      };
      if (request.url === '/health') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
        return;
      }
      const body = seen.body;
      for (const field of ['model', 'language', 'task', 'response_format']) {
        if (new RegExp(`name="${field}"`).test(body)) seen.fields[field] = 'present';
      }
      // The audio part carries the filename in its own disposition.
      const file = /name="file"; filename="([^"]+)"/.exec(body);
      if (file?.[1]) seen.fields.filename = file[1];
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ text: ' hello world ', language: 'en', segments: [] }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('whisper proxy', () => {
  it('uploads the WAV as a multipart form with the local-whisper fields', async () => {
    const result = await transcribe({
      engine: 'local-whisper',
      baseUrl: base,
      model: 'base',
      language: 'auto',
      filename: 'meeting.wav',
      audio: WAV.toString('base64'),
    });
    expect(result.ok).toBe(true);
    expect(seen.path).toBe('/transcribe');
    expect(seen.contentType).toContain('multipart/form-data');
    expect(seen.fields.filename).toBe('meeting.wav');
    expect(seen.fields.model).toBe('present');
    expect(seen.fields.language).toBe('present');
    expect(seen.fields.task).toBe('present');
    expect(seen.body).toContain('RIFF0000WAVEfmt');
    expect(result.payload).toMatchObject({ text: ' hello world ', language: 'en' });
  });

  it('uses the whisper.cpp and OpenAI paths with their own fields', async () => {
    await transcribe({
      engine: 'whisper-cpp',
      baseUrl: base,
      language: 'de',
      audio: WAV.toString('base64'),
    });
    expect(seen.path).toBe('/inference');
    expect(seen.fields.response_format).toBe('present');

    await transcribe({
      engine: 'openai',
      baseUrl: base,
      audio: WAV.toString('base64'),
    });
    expect(seen.path).toBe('/v1/audio/transcriptions');
    expect(seen.fields.model).toBe('present');
  });

  it('refuses a request it cannot act on', async () => {
    expect(await transcribe({ engine: 'nope', baseUrl: base, audio: 'AAAA' })).toMatchObject({
      ok: false,
      error: 'invalid',
    });
    expect(
      await transcribe({ engine: 'local-whisper', baseUrl: 'ftp://host', audio: 'AAAA' }),
    ).toMatchObject({ ok: false, error: 'invalid' });
    expect(
      await transcribe({ engine: 'local-whisper', baseUrl: base, audio: '' }),
    ).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('reports a dead port as offline rather than a bad request', async () => {
    // Port 1 is never a Whisper server.
    const result = await transcribe({
      engine: 'local-whisper',
      baseUrl: 'http://127.0.0.1:1',
      audio: WAV.toString('base64'),
    });
    expect(result).toMatchObject({ ok: false, error: 'offline' });
  });

  it('probes health from the main process', async () => {
    expect(await probe({ engine: 'local-whisper', baseUrl: base })).toMatchObject({ ok: true });
    expect(await probe({ engine: 'local-whisper', baseUrl: 'http://127.0.0.1:1' })).toMatchObject({
      ok: false,
      error: 'offline',
    });
    expect(await probe({ engine: 'bogus', baseUrl: base })).toMatchObject({
      ok: false,
      error: 'invalid',
    });
  });

  it('derives the endpoints the accounts expect', () => {
    expect(lexiumEndpoint('local-whisper', 'http://localhost:8000/')).toBe(
      'http://localhost:8000/transcribe',
    );
    expect(lexiumEndpoint('whisper-cpp', 'http://localhost:8080')).toBe(
      'http://localhost:8080/inference',
    );
    expect(lexiumEndpoint('openai', 'https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/audio/transcriptions',
    );
    expect(lexiumEndpoint('local-whisper', '')).toBe('');
    expect(lexiumHealthEndpoint('local-whisper', 'http://localhost:8000')).toBe(
      'http://localhost:8000/health',
    );
  });

  it('keeps the filename inside the header rules', () => {
    expect(lexiumFilename('My Meeting!.wav')).toBe('My_Meeting_.wav');
    // A path without an extension is not a usable upload name.
    expect(lexiumFilename('../../etc/passwd')).toBe('audio.wav');
    expect(lexiumFilename('no-extension')).toBe('audio.wav');
    expect(lexiumFilename(undefined)).toBe('audio.wav');
  });
});
