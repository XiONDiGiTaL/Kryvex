#!/usr/bin/env node
/**
 * Verifies the one-click speech engine end to end, on this machine.
 *
 * Nothing here is mocked: the script downloads the pinned `whisper-server`
 * build and a pinned model with the real runtime, checks the bytes on disk
 * against the catalogue's own SHA-256, starts the server on loopback, speaks a
 * phrase with the synthesizer Windows ships, and transcribes it through the
 * same proxy the renderer calls. It then stops the server and proves the
 * listener is gone and the files that were installed can be removed.
 *
 *   node scripts/verify-speech-runtime.cjs                 (after `pnpm build`)
 *   node scripts/verify-speech-runtime.cjs --model=base     the default model
 *   node scripts/verify-speech-runtime.cjs --root=<dir>     reuse an install
 *   node scripts/verify-speech-runtime.cjs --keep           keep the profile
 *
 * `tiny` is the default here because the pipeline is what is being tested and
 * 78 MB downloads faster than 148 MB; every model travels the same path.
 */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OUTPUT = path.join(process.cwd(), '.tmp-speech-runtime-verify.log');
const PHRASE = 'The quick brown fox jumps over the lazy dog.';
const lines = [];

function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

function finish(code) {
  try {
    fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    /* the log is a convenience */
  }
  process.exit(code);
}

function argument(name, fallback) {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const keep = process.argv.includes('--keep');
const modelId = argument('model', 'tiny');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  log(`SKIP the packaged whisper.cpp build is Windows x64 only (this is ${process.platform}/${process.arch})`);
  finish(0);
}

const root = argument('root', '') || fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-speech-verify-'));
const reused = fs.existsSync(path.join(root, 'kryvex-speech.json'));
log(`profile: ${root}${reused ? ' (reused)' : ''}`);

/** 16 kHz mono PCM, exactly what the renderer uploads. */
function toRendererFormat(wav) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('the synthesizer did not write a RIFF/WAVE file');
  }
  let offset = 12;
  let channels = 1;
  let rate = 22050;
  let bits = 16;
  let data = null;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = wav.readUInt16LE(body + 2);
      rate = wav.readUInt32LE(body + 4);
      bits = wav.readUInt16LE(body + 14);
    }
    if (id === 'data') data = wav.subarray(body, body + size);
    offset = body + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error('unexpected sample format');

  const frames = Math.floor(data.length / (2 * channels));
  const mono = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += data.readInt16LE((index * channels + channel) * 2) / 32768;
    }
    mono[index] = sum / channels;
  }

  const target = 16000;
  const length = Math.round((frames * target) / rate);
  const out = Buffer.alloc(44 + length * 2);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + length * 2, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(target, 24);
  out.writeUInt32LE(target * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index += 1) {
    const position = (index * rate) / target;
    const low = Math.floor(position);
    const high = Math.min(frames - 1, low + 1);
    const blend = position - low;
    const value = (mono[low] ?? 0) * (1 - blend) + (mono[high] ?? 0) * blend;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), 44 + index * 2);
  }
  return out;
}

async function main() {
  const runtimeModule = require(path.join(process.cwd(), 'dist-electron', 'speech-runtime.js'));
  const catalogue = require(path.join(process.cwd(), 'dist-electron', 'speech-catalogue.js'));
  const proxy = require(path.join(process.cwd(), 'dist-electron', 'lexium-proxy.js'));

  const entry = catalogue.speechModelEntry(modelId);
  if (!entry) return fail(`no reviewed model is called ${modelId}`);

  const progress = [];
  const speech = new runtimeModule.SpeechRuntime(root, event => progress.push(event));
  speech.init();

  const initial = speech.status();
  if (!initial.supported) return fail('the runtime reports this machine as unsupported');
  if (initial.models.length !== catalogue.SPEECH_MODELS.length) {
    return fail('the reviewed catalogue failed its own validation and was dropped');
  }
  log(`catalogue: ${initial.models.map(row => row.id).join(', ')}`);

  // ---------------------------------------------------------------- install ---
  if (!reused) {
    log(`installing ${entry.id} (${entry.bytes} bytes) — this downloads the pinned build and model`);
  }
  const started = await speech.install(entry.id);
  if (started.phase !== 'running') {
    return fail(`install did not end with a running server: ${started.phase} ${started.error ?? ''}`);
  }
  if (!started.baseUrl || !started.pid) return fail('a running server reported no address or pid');
  log(`running on ${started.baseUrl} (pid ${started.pid}), steps: ${progress.map(p => p.phase).join(' → ')}`);
  if (!progress.some(p => p.phase === 'verifying')) {
    return fail('the download was never verified');
  }

  const layout = path.join(root, 'bin', 'whisper-server.exe');
  const modelFile = path.join(root, 'models', `${entry.id}.bin`);
  if (!fs.existsSync(layout)) return fail('the server executable was not installed');
  if (!fs.existsSync(modelFile)) return fail('the model was not installed');
  if (fs.statSync(modelFile).size !== entry.bytes) return fail('the model on disk is the wrong size');

  // The runtime says the hash matched; this proves the bytes that stayed.
  const digest = createHash('sha256').update(fs.readFileSync(modelFile)).digest('hex');
  if (digest !== entry.sha256) return fail(`the model on disk is not the pinned file (${digest})`);
  log('the model on disk matches the pinned SHA-256');

  // A partial transfer, the archive and the staging folder must not survive.
  const leftovers = fs
    .readdirSync(root)
    .filter(name => name.endsWith('.part') || name.endsWith('.zip') || name.startsWith('.unpack-'));
  if (leftovers.length > 0) return fail(`leftovers were kept: ${leftovers.join(', ')}`);
  log('no partial, archive or staging files were left behind');

  // ---------------------------------------------------------------- health ---
  const health = await fetch(`${started.baseUrl}/`).catch(() => null);
  if (!health || !health.ok) return fail('the server index did not answer');
  log(`the server answers its own page (${health.status})`);

  // ----------------------------------------------------------------- audio ---
  let spoken;
  try {
    const wave = path.join(root, 'spoken.wav');
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wave}'); $s.Speak('${PHRASE}'); $s.Dispose()`,
      ],
      { stdio: 'ignore' },
    );
    spoken = toRendererFormat(fs.readFileSync(wave));
    log(`synthesised ${spoken.length} bytes of 16 kHz mono speech`);
  } catch (error) {
    return fail(`could not build the test audio: ${String(error)}`);
  }

  // ------------------------------------------------------ transcribe (proxy) ---
  const ask = language =>
    proxy.transcribe({
      engine: 'whisper-cpp',
      baseUrl: started.baseUrl,
      language,
      filename: 'spoken.wav',
      audio: spoken.toString('base64'),
    });

  const english = await ask('en');
  if (!english.ok) return fail(`transcription failed: ${english.error} ${english.detail ?? ''}`);
  const text = String(english.payload?.text ?? '');
  if (!/quick brown fox/i.test(text)) return fail(`unexpected transcript: "${text}"`);
  const segments = english.payload?.segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    return fail('the server returned no timed segments, so .srt export would be empty');
  }
  log(`transcribed: ${text.trim()}`);
  log(`segments: ${segments.length} (first ${segments[0].start}s → ${segments[0].end}s)`);

  const automatic = await ask('auto');
  if (!automatic.ok || !/quick brown fox/i.test(String(automatic.payload?.text ?? ''))) {
    return fail('language detection did not produce the phrase');
  }
  log(`language detection reported ${automatic.payload?.language}`);

  // Turkish must be accepted by the pinned build, which is what a Turkish
  // recording needs; the words themselves are meaningless on English audio.
  const turkish = await ask('tr');
  if (!turkish.ok) return fail(`a Turkish request was refused: ${turkish.error}`);
  if (turkish.payload?.language !== 'turkish') {
    return fail(`a Turkish request was answered as ${String(turkish.payload?.language)}`);
  }
  log('a Turkish request is accepted and reported as Turkish');

  const empty = await ask('en');
  const refused = await proxy.transcribe({ engine: 'whisper-cpp', baseUrl: started.baseUrl, audio: '' });
  if (refused.ok || refused.error !== 'invalid') return fail('an empty upload was not refused');
  log(`an empty upload is refused (the previous request still answered with ${String(empty.payload?.text ?? '').trim().length} characters)`);

  // ---------------------------------------------------------- install again ---
  const again = await speech.install(entry.id);
  if (again.phase !== 'running') return fail('reinstalling a present engine broke it');
  if (again.pid === started.pid) return fail('the second install did not restart the server');

  // ------------------------------------------------------------------ stop ---
  const removable = await speech.remove(entry.id);
  if (removable.error !== 'busy') return fail('a running model could be removed');
  log('a model in use cannot be removed');

  const stopped = await speech.stop();
  if (stopped.phase !== 'stopped' || stopped.pid !== null) {
    return fail(`stop left the runtime in ${stopped.phase}`);
  }
  const dead = await fetch(`http://127.0.0.1:${started.port}/`, {
    signal: AbortSignal.timeout(3000),
  }).then(() => true).catch(() => false);
  if (dead) return fail('the server still answers after being stopped');
  log('the listener is gone once the engine is stopped');

  const removed = await speech.remove(entry.id);
  if (removed.error) return fail(`removing the model failed: ${removed.error}`);
  if (fs.existsSync(modelFile)) return fail('the model file survived its removal');
  const missing = await speech.start(entry.id);
  if (missing.error !== 'not-installed') {
    return fail(`starting a removed model reported ${String(missing.error)}`);
  }
  log('a removed model cannot be started again');

  await speech.dispose();
  log('PASS one-click speech engine: verified download, loopback server, real transcription, cleanup');

  if (!keep) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* the temporary profile is disposable */
    }
  } else {
    log(`kept ${root}`);
  }
  finish(0);
}

main().catch(error => fail(String(error && error.stack ? error.stack : error)));
