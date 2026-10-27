/**
 * The reviewed speech artifacts Kryvex may download.
 *
 * Lexium is a client for engines the user runs, which is a wall for anyone who
 * has never run Whisper: the first transcription ends on "nothing answered".
 * The desktop build closes that gap with one button, and the two things it
 * fetches are pinned here — the exact `whisper-server` build and the exact
 * model file — so the bytes on disk are the bytes that were reviewed.
 *
 * Every value below was measured, not copied from a wiki:
 *
 * - The build is the release asset `whisper-bin-x64.zip` from `ggml-org/whisper.cpp`
 *   (the repository `ggerganov/whisper.cpp` redirects to), tag `b5454`. The
 *   SHA-256 is GitHub's own asset digest and it was re-hashed from the
 *   downloaded archive before it was written down.
 * - The models are the canonical GGML conversions in `ggerganov/whisper.cpp`
 *   on Hugging Face. Each byte count and hash was measured from a real
 *   download of that exact file.
 *
 * Nothing is fetched on a timer and nothing updates itself: a build or model
 * that is not in this table cannot be downloaded, and a changed upstream file
 * fails the hash check instead of being installed.
 */
import type { SpeechModelEntry } from './speech-runtime-rules';

/** The engine id the rest of the app already speaks: whisper.cpp's `/inference`. */
export const SPEECH_ENGINE = 'whisper-cpp';

/**
 * The loopback port the local server prefers.
 *
 * A fixed port keeps the address stable across restarts, so the setting Lexium
 * stores still points at the right place after the app is closed and opened
 * again. If something else holds it, the runtime falls back to a port the OS
 * hands out and reports the change.
 */
export const SPEECH_PORT = 8129;

/** The build of `whisper-server.exe` that ships as a one-click download. */
export const SPEECH_BUILD = {
  /** The upstream release tag, which is an immutable build snapshot. */
  tag: 'b5454',
  repository: 'ggml-org/whisper.cpp',
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
  bytes: 8_928_640,
  sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
  /** The executable inside the archive, and the name it is installed under. */
  binary: 'whisper-server.exe',
  /** Where the executable sits inside the archive. */
  archivePrefix: 'Release/',
  licence: 'MIT',
  licenceUrl: 'https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE',
} as const;

/** How a model is described to the interface: stable ids, never sentences. */
export type SpeechModelSize = 'tiny' | 'base' | 'small';

export const SPEECH_MODELS: SpeechModelEntry[] = [
  {
    id: 'tiny',
    name: 'Whisper tiny',
    size: 'tiny',
    filename: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    bytes: 77_691_713,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    // The multilingual conversion, not `tiny.en`: the panel offers every
    // language Lexium knows, and an English-only file would answer a Turkish
    // recording with confident English.
    multilingual: true,
    licence: 'MIT',
    licenceUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
  },
  {
    id: 'base',
    name: 'Whisper base',
    size: 'base',
    filename: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    bytes: 147_951_465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    multilingual: true,
    licence: 'MIT',
    licenceUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
  },
  {
    id: 'small',
    name: 'Whisper small',
    size: 'small',
    filename: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    bytes: 487_601_967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    multilingual: true,
    licence: 'MIT',
    licenceUrl: 'https://github.com/openai/whisper/blob/main/LICENSE',
  },
];

/**
 * The model the one-click button downloads: the smallest one that is reliably
 * better than the dictation engine on accents, music and singing. `tiny` is
 * offered below it and `small` above it, but 148 MB is the size worth spending
 * by default.
 */
export const DEFAULT_SPEECH_MODEL = 'base';

export function speechModelEntry(id: unknown): SpeechModelEntry | undefined {
  return typeof id === 'string' ? SPEECH_MODELS.find(model => model.id === id) : undefined;
}
