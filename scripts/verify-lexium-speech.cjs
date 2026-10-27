/**
 * Verifies Lexium's in-box speech engine end to end.
 *
 * The engine is the recogniser Windows ships, reached through `System.Speech`.
 * There is no server to fake and no model to download, so this script speaks:
 * it synthesises a WAV with the same Windows speech stack, hands the bytes to
 * the real main-process module, and checks the words come back through the
 * proxy the renderer actually calls.
 *
 * Run with: node scripts/verify-lexium-speech.cjs  (after `pnpm build`)
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OUTPUT = path.join(process.cwd(), '.tmp-lexium-speech-verify.log');
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

if (process.platform !== 'win32') {
  log('SKIP the in-box speech engine only exists on Windows');
  finish(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-speech-verify-'));
const wave = path.join(dir, 'spoken.wav');
let bytes = null;

try {
  // The engine is tested with the only audio this machine can produce on
  // demand: the synthesizer Windows also ships. Nothing is downloaded.
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
  bytes = fs.readFileSync(wave);
  if (bytes.length < 1024) return fail('the synthesizer wrote no usable audio');
  log(`synthesised ${bytes.length} bytes of speech`);
} catch (error) {
  return fail(`could not synthesise test audio: ${String(error)}`);
}

/**
 * The renderer always sends 16 kHz mono PCM, so the engine is exercised on
 * that and not on whatever the synthesizer happens to write.
 */
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
  const speech = require(path.join(process.cwd(), 'dist-electron', 'lexium-speech.js'));
  const proxy = require(path.join(process.cwd(), 'dist-electron', 'lexium-proxy.js'));

  try {
    bytes = toRendererFormat(bytes);
    log(`converted to ${bytes.length} bytes of 16 kHz mono PCM, as the renderer sends it`);
  } catch (error) {
    return fail(`could not build the renderer's payload: ${String(error)}`);
  }

  const probe = await speech.speechProbe();
  if (!probe.ok) return fail(`the recogniser probe failed: ${probe.reason}`);
  if (!probe.cultures?.length) return fail('the probe reported no recogniser languages');
  log(`recognisers installed: ${probe.cultures.join(', ')}`);

  const direct = await speech.speechTranscribe(bytes, 'en');
  if (!direct.ok) return fail(`recognition failed: ${direct.reason} ${direct.detail ?? ''}`);
  if (!/quick brown fox/i.test(direct.text)) {
    return fail(`recognition returned unexpected text: "${direct.text}"`);
  }
  log(`recognised: ${direct.text}`);
  if (typeof direct.confidence !== 'number' || direct.confidence < 0 || direct.confidence > 1) {
    return fail(`the engine reported no usable confidence: ${String(direct.confidence)}`);
  }
  if (direct.verdict !== 'ok' && direct.verdict !== 'uncertain') {
    return fail(`the engine reported an unknown verdict: ${String(direct.verdict)}`);
  }
  log(`confidence ${direct.confidence} (${direct.verdict}), culture ${direct.culture}`);

  // The same call the renderer makes, through the proxy and its base64 body.
  const answer = await proxy.transcribe({
    engine: 'windows-speech',
    baseUrl: '',
    language: 'en',
    filename: 'spoken.wav',
    audio: bytes.toString('base64'),
  });
  if (!answer.ok) return fail(`proxy transcribe failed: ${answer.error}`);
  const text = answer.payload?.text ?? '';
  if (!/quick brown fox/i.test(text)) return fail(`proxy returned unexpected text: "${text}"`);
  log('proxy returned the same words');

  const probed = await proxy.probe({ engine: 'windows-speech', baseUrl: '' });
  if (!probed.ok) return fail(`proxy probe failed: ${probed.error} ${probed.detail ?? ''}`);
  log(`proxy probe ok (${probed.detail})`);

  const refused = await proxy.transcribe({ engine: 'windows-speech', baseUrl: '', audio: '' });
  if (refused.ok || refused.error !== 'invalid') return fail('an empty audio body was not refused');
  log('an empty upload is refused');

  /**
   * The regression this check exists for: a Turkish recording on a machine
   * with only an English recogniser used to come back as fluent English that
   * was nowhere in the audio. A language with no recogniser must be refused,
   * and no text may come back with it.
   */
  const installed = (probe.cultures ?? []).map(culture => String(culture).split(/[-_]/)[0].toLowerCase());
  // Turkish first: that is the language the report was about.
  const missing = ['tr', 'ja', 'ru', 'ar', 'hi'].find(code => !installed.includes(code));
  if (!missing) {
    log('SKIP every test language has a recogniser here, so the refusal cannot be exercised');
  } else {
    const wrong = await speech.speechTranscribe(bytes, missing);
    if (wrong.ok) return fail(`a ${missing} request was answered instead of refused: "${wrong.text}"`);
    if (wrong.reason !== 'wrong-language') {
      return fail(`a ${missing} request failed for the wrong reason: ${String(wrong.reason)}`);
    }
    if (!wrong.detail) return fail('the refusal did not say which language is missing');
    log(`refused a ${missing} request: ${wrong.detail}`);

    const wrongProxy = await proxy.transcribe({
      engine: 'windows-speech',
      baseUrl: '',
      language: missing,
      filename: 'spoken.wav',
      audio: bytes.toString('base64'),
    });
    if (wrongProxy.ok) return fail(`the proxy answered a ${missing} request instead of refusing it`);
    if (wrongProxy.detail !== 'wrong-language') {
      return fail(`the proxy reported ${String(wrongProxy.detail)} instead of wrong-language`);
    }
    if (wrongProxy.payload) return fail('a refused request still carried a payload');
    log('the proxy refuses it too, with no text');
  }

  log('PASS in-box speech engine: probe, transcription, confidence, language refusal and the proxy path');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the temporary audio is disposable */
  }
  finish(0);
}

main().catch(error => fail(String(error)));
