import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPEECH_MODEL,
  SPEECH_BUILD,
  SPEECH_MODELS,
  SPEECH_PORT,
  speechModelEntry,
} from '../electron/speech-catalogue';
import {
  buildSpeechArgs,
  installableArchiveEntry,
  isSafeSpeechModelId,
  speechLayout,
  speechModelPath,
  speechPercent,
  speechThreads,
  validateSpeechArtifacts,
  validateSpeechBuild,
  validateSpeechModel,
  MAX_SPEECH_BYTES,
} from '../electron/speech-runtime-rules';

/**
 * The pins are the whole security story of a download, so the first test is
 * that the reviewed table is internally sound: a typo in a hash or a host that
 * left the allowlist must fail here, not after a 148 MB download.
 */
describe('the reviewed speech artifacts', () => {
  it('passes its own validation', () => {
    expect(validateSpeechBuild(SPEECH_BUILD)).toEqual([]);
    for (const model of SPEECH_MODELS) {
      expect(validateSpeechModel(model), model.id).toEqual([]);
    }
    expect(validateSpeechArtifacts({ build: SPEECH_BUILD, models: SPEECH_MODELS })).toEqual([]);
  });

  it('offers the multilingual conversions only', () => {
    for (const model of SPEECH_MODELS) {
      expect(model.multilingual, model.id).toBe(true);
      // `*.en` would answer a foreign recording in English, which is the
      // failure the local engine exists to avoid.
      expect(model.filename.endsWith('.en.bin'), model.id).toBe(false);
    }
  });

  it('offers a default that is in the catalogue', () => {
    expect(speechModelEntry(DEFAULT_SPEECH_MODEL)?.id).toBe(DEFAULT_SPEECH_MODEL);
    expect(SPEECH_MODELS.map(model => model.id)).toContain(DEFAULT_SPEECH_MODEL);
  });

  it('keeps the loopback port out of the registered range of common servers', () => {
    expect(SPEECH_PORT).toBeGreaterThan(1024);
    expect(SPEECH_PORT).toBeLessThan(65_535);
  });

  it('refuses a build from a host that left the allowlist', () => {
    const problems = validateSpeechBuild({ ...SPEECH_BUILD, url: 'https://example.com/b5454/a.zip' });
    expect(problems).toContain('url');
  });

  it('refuses a plain-http or an unhashed artifact', () => {
    expect(validateSpeechBuild({ ...SPEECH_BUILD, url: 'http://github.com/x.zip' })).toContain('url');
    expect(validateSpeechModel({ ...SPEECH_MODELS[0], sha256: 'nope' })).toContain('sha256');
    expect(validateSpeechModel({ ...SPEECH_MODELS[0], bytes: MAX_SPEECH_BYTES + 1 })).toContain(
      'bytes-range',
    );
  });

  it('refuses an English-only model', () => {
    expect(validateSpeechModel({ ...SPEECH_MODELS[0], multilingual: false })).toContain(
      'multilingual',
    );
  });

  it('refuses a pinned URL that points at a different file', () => {
    const problems = validateSpeechModel({
      ...SPEECH_MODELS[0],
      filename: 'ggml-base.bin',
    });
    expect(problems).toContain('url');
  });
});

describe('the archive layout', () => {
  const prefix = SPEECH_BUILD.archivePrefix;

  it('flattens the executables and libraries beside each other', () => {
    expect(installableArchiveEntry('Release/whisper-server.exe', prefix)).toBe(
      'whisper-server.exe',
    );
    expect(installableArchiveEntry('Release/ggml-cpu-haswell.dll', prefix)).toBe(
      'ggml-cpu-haswell.dll',
    );
  });

  it('skips anything that is not one of the server files', () => {
    expect(installableArchiveEntry('Release/README.md', prefix)).toBeNull();
    expect(installableArchiveEntry('Release/whisper-server.exe', 'Other/')).toBeNull();
    expect(installableArchiveEntry('whisper-server.exe', prefix)).toBeNull();
    expect(installableArchiveEntry('Release/nested/whisper-server.exe', prefix)).toBeNull();
    expect(installableArchiveEntry('Release/..\\whisper-server.exe', prefix)).toBeNull();
    expect(installableArchiveEntry('Release/con.exe', prefix)).toBeNull();
  });
});

describe('the layout and the command line', () => {
  const layout = speechLayout('C:/profile/speech');

  it('keeps the build and the models in their own folders', () => {
    expect(layout.binary.endsWith('bin\\whisper-server.exe') || layout.binary.endsWith('bin/whisper-server.exe')).toBe(true);
    expect(speechModelPath(layout, 'base')).toContain('models');
    expect(speechModelPath(layout, 'base').endsWith('base.bin')).toBe(true);
  });

  it('always binds the server to loopback', () => {
    const args = buildSpeechArgs({ modelPath: 'C:/models/base.bin', port: 8129, threads: 4 });
    expect(args).toEqual([
      '--model',
      'C:/models/base.bin',
      '--host',
      '127.0.0.1',
      '--port',
      '8129',
      '--threads',
      '4',
    ]);
    expect(args.join(' ')).not.toContain('0.0.0.0');
  });

  it('clamps the thread count', () => {
    expect(speechThreads(1)).toBe(1);
    expect(speechThreads(2)).toBe(1);
    expect(speechThreads(16)).toBe(8);
    expect(speechThreads(64)).toBe(8);
    expect(speechThreads(0)).toBe(2);
  });
});

describe('the small helpers', () => {
  it('keeps model ids to a safe shape', () => {
    expect(isSafeSpeechModelId('base')).toBe(true);
    expect(isSafeSpeechModelId('../../etc/passwd')).toBe(false);
    expect(isSafeSpeechModelId('a')).toBe(false);
    expect(isSafeSpeechModelId('base.bin')).toBe(true);
  });

  it('reports progress within its bounds', () => {
    expect(speechPercent(0, 100)).toBe(0);
    expect(speechPercent(50, 100)).toBe(50);
    expect(speechPercent(200, 100)).toBe(100);
    expect(speechPercent(5, 0)).toBe(0);
    expect(speechPercent(Number.NaN, 10)).toBe(0);
  });
});
