import { downmix, encodeWav, resample, waveformPeaks } from './lexium';

/**
 * Decode an imported file with the browser's own codecs, then hand the engine
 * the one format every Whisper server reads: 16 kHz mono 16-bit WAV.
 *
 * Doing the conversion here means no ffmpeg, no upload of the original file and
 * no format surprises; MP3, M4A, OGG, Opus, FLAC, WebM and MP4 all arrive as
 * the same clean WAV.
 */
export interface LoadedAudio {
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  /** Mono samples at the decoded rate, for the waveform. */
  peaks: number[];
  /** 16 kHz mono WAV, ready for the engine. */
  wav: Blob;
  /** Object URL of the original file, for the inline preview player. */
  url: string;
}

type AudioContextConstructor = typeof AudioContext;

function audioContext(): AudioContext {
  const Constructor: AudioContextConstructor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) throw new Error('no-audio');
  return new Constructor();
}

export async function loadAudioFile(file: File): Promise<LoadedAudio> {
  const buffer = await file.arrayBuffer();
  const context = audioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(buffer.slice(0));
  } catch {
    throw new Error('decode');
  } finally {
    void context.close().catch(() => undefined);
  }

  const channels: Float32Array[] = [];
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    channels.push(decoded.getChannelData(channel));
  }
  const mono = downmix(channels);
  const samples = resample(mono, decoded.sampleRate, 16000);
  const wav = new Blob([encodeWav(samples, 16000)], { type: 'audio/wav' });

  return {
    name: file.name,
    size: file.size,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    peaks: waveformPeaks(samples, 112),
    wav,
    url: URL.createObjectURL(file),
  };
}
