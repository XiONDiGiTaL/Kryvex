/**
 * The speech engine this machine already has.
 *
 * Lexium's other engines are servers the user starts, which is a wall for
 * anyone who has never run Whisper: the first transcription used to end on
 * "nothing answered". Windows ships a speech recogniser, reachable from .NET's
 * `System.Speech`, so the desktop build can transcribe with no download, no
 * server and no account. It is not Whisper: it is a dictation engine and it is
 * honest about that in the interface.
 *
 * The renderer hands over a 16 kHz mono WAV, which is exactly what the
 * recogniser reads from a file. The work happens in a short PowerShell script
 * because that is where the in-box engine is addressable; the script is passed
 * encoded so no shell quoting is involved, and the audio path is the only value
 * that ever reaches it.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessDictation,
  cultureLanguage,
  recognizerFor,
  type DictationVerdict,
} from './lexium-speech-rules';

/** Long recordings are recognised at roughly real time; this is a ceiling. */
const TRANSCRIBE_TIMEOUT_MS = 900_000;
const PROBE_TIMEOUT_MS = 20_000;
/** Installing a Windows language needs no restart of the app, so this expires. */
const CULTURES_TTL_MS = 60_000;

export type SpeechFailure =
  | 'unsupported'
  | 'no-recognizer'
  /** The requested language has no recogniser here; never substituted. */
  | 'wrong-language'
  | 'powershell'
  | 'empty';

export interface SpeechProbe {
  ok: boolean;
  reason?: SpeechFailure;
  /** Installed recogniser cultures, for the detail line. */
  cultures?: string[];
}

export interface SpeechTranscript {
  ok: boolean;
  text?: string;
  reason?: SpeechFailure;
  /** The engine's own words, when it failed for a reason worth showing. */
  detail?: string;
  /** Mean confidence the recogniser reported for the phrases it produced. */
  confidence?: number;
  /** The recogniser that produced the text, e.g. `tr-TR`. */
  culture?: string;
  verdict?: DictationVerdict;
}

let cachedCultures: { cultures: string[]; at: number } | null = null;

/**
 * The installed recogniser cultures, briefly cached because recognising a file
 * asks for them first. Installing a language in Windows settings is rare and
 * an app restart is not required either way.
 */
async function installedCultures(force = false): Promise<SpeechProbe> {
  if (!force && cachedCultures && Date.now() - cachedCultures.at < CULTURES_TTL_MS) {
    return { ok: true, cultures: cachedCultures.cultures };
  }
  const probe = await speechProbe();
  if (probe.ok) {
    cachedCultures = { cultures: probe.cultures ?? [], at: Date.now() };
  }
  return probe;
}

function hasPowerShell(): boolean {
  return process.platform === 'win32';
}

/** Runs a script and returns its standard output. Never a shell string: the
 *  encoded command is opaque to cmd, and arguments are passed as an array. */
function runPowerShell(script: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // -EncodedCommand takes UTF-16LE base64, which sidesteps every quoting rule
    // of the shell it is launched from.
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** UTF-8 output, so an accented transcript survives the pipe. */
const PRELUDE = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
`;

/** A path as a PowerShell single-quoted literal (a quote is doubled). */
function quote(path: string): string {
  return `'${path.replace(/'/g, "''")}'`;
}

export async function speechProbe(): Promise<SpeechProbe> {
  if (!hasPowerShell()) return { ok: false, reason: 'unsupported' };
  try {
    const output = await runPowerShell(
      `${PRELUDE}
$recognisers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$cultures = @($recognisers | ForEach-Object { $_.Culture.Name })
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject @{ count = $cultures.Count; cultures = $cultures }))
`,
      PROBE_TIMEOUT_MS,
    );
    const parsed = JSON.parse(output.trim() || '{}') as { count?: number; cultures?: string[] };
    if (!parsed.count) return { ok: false, reason: 'no-recognizer' };
    return { ok: true, cultures: parsed.cultures ?? [] };
  } catch {
    return { ok: false, reason: 'powershell' };
  }
}

export async function speechTranscribe(bytes: Buffer, language: string): Promise<SpeechTranscript> {
  if (!hasPowerShell()) return { ok: false, reason: 'unsupported' };

  const probe = await installedCultures();
  if (!probe.ok) return { ok: false, reason: probe.reason ?? 'powershell' };
  const cultures = probe.cultures ?? [];
  if (cultures.length === 0) return { ok: false, reason: 'no-recognizer' };

  // A language mismatch is refused rather than answered with the nearest
  // recogniser: an English engine reading Turkish sings produces fluent
  // English that is not in the audio at all.
  const culture = recognizerFor(cultures, language);
  if (!culture) {
    return {
      ok: false,
      reason: 'wrong-language',
      detail: `${cultureLanguage(language)} is not installed (${cultures.join(', ')})`,
    };
  }

  const path = join(tmpdir(), `kryvex-speech-${randomUUID()}.wav`);
  try {
    writeFileSync(path, bytes);
  } catch (error) {
    return { ok: false, reason: 'powershell', detail: String((error as Error).message ?? '') };
  }

  try {
    const output = await runPowerShell(
      `${PRELUDE}
$recognisers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$culture = ${quote(culture)}
$choice = $recognisers | Where-Object { $_.Culture.Name -eq $culture } | Select-Object -First 1
if ($null -eq $choice) { [Console]::Out.Write('{"reason":"no-recognizer"}'); exit 0 }
$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($choice)
$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$engine.SetInputToWaveFile(${quote('__AUDIO__')})
$parts = New-Object System.Collections.Generic.List[string]
$scores = New-Object System.Collections.Generic.List[double]
for ($index = 0; $index -lt 5000; $index++) {
  try { $piece = $engine.Recognize() } catch { break }
  if ($null -eq $piece) { break }
  if ($piece.Text) { $parts.Add($piece.Text); $scores.Add([double]$piece.Confidence) }
}
$mean = 0.0
if ($scores.Count -gt 0) { $mean = ($scores | Measure-Object -Average).Average }
$engine.Dispose()
[Console]::Out.Write((ConvertTo-Json -Compress -InputObject @{ text = ($parts -join ' '); pieces = $parts.Count; confidence = [math]::Round($mean, 3); culture = $culture }))
`.replace('__AUDIO__', path),
      TRANSCRIBE_TIMEOUT_MS,
    );
    const parsed = JSON.parse(output.trim() || '{}') as {
      text?: string;
      reason?: string;
      pieces?: number;
      confidence?: number;
      culture?: string;
    };
    if (parsed.reason === 'no-recognizer') return { ok: false, reason: 'no-recognizer' };
    const text = (parsed.text ?? '').trim();
    // Silence, music or a language the recogniser does not have: an empty
    // transcript is a result, not a crash.
    if (!text) return { ok: false, reason: 'empty' };
    const confidence = Number(parsed.confidence);
    return {
      ok: true,
      text,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      culture: parsed.culture ?? culture,
      verdict: assessDictation({ text, confidence }),
    };
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '').trim();
    return { ok: false, reason: 'powershell', detail: stderr.slice(0, 300) };
  } finally {
    try {
      unlinkSync(path);
    } catch {
      /* the temporary file is already gone */
    }
  }
}
