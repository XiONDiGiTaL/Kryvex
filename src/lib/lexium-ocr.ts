import { OCR_SCRIPT } from './lexium';

/**
 * Image text extraction for Lexium.
 *
 * Tesseract is loaded from a CDN on first use instead of being bundled: the
 * wasm core and language packs are tens of megabytes and would otherwise sit in
 * every install. The emulator takes the same approach, and the reader says so
 * plainly when the CDN cannot be reached. The image never leaves the renderer —
 * only the language pack is downloaded.
 *
 * It is injected as a plain `<script crossorigin="anonymous">`. A dynamic
 * `import()` of the same URL is blocked by Chromium's third-party cookie rules
 * (`ERR_BLOCKED_BY_RESPONSE.NotSameSite`) as soon as the CDN answers with a
 * cookie, while a no-credentials script tag loads cleanly.
 */
interface OcrWorker {
  recognize(image: Blob): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<void>;
}

interface TesseractGlobal {
  version?: string;
  createWorker(
    language: string,
    oem?: number,
    options?: Record<string, unknown>,
  ): Promise<OcrWorker>;
}

declare global {
  interface Window {
    Tesseract?: TesseractGlobal;
  }
}

let scriptPromise: Promise<TesseractGlobal> | null = null;

function loadTesseract(): Promise<TesseractGlobal> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TesseractGlobal>((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const script = document.createElement('script');
    script.src = OCR_SCRIPT;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('missing'));
    };
    script.onerror = () => reject(new Error('offline'));
    document.head.appendChild(script);
  });
  // A failed CDN load must be retried on the next attempt, not cached.
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

export interface OcrReadResult {
  text: string;
  confidence: number;
}

export async function readImageText(
  file: File | Blob,
  language: string,
  onProgress?: (progress: number) => void,
): Promise<OcrReadResult> {
  let engine: TesseractGlobal;
  try {
    engine = await loadTesseract();
  } catch {
    throw new Error('offline');
  }

  let worker: OcrWorker;
  try {
    worker = await engine.createWorker(language || 'eng', 1, {
      logger: (message: unknown) => {
        const record = message as { status?: string; progress?: number } | null;
        if (record?.status === 'recognizing text' && typeof record.progress === 'number') {
          onProgress?.(record.progress);
        }
      },
    });
  } catch {
    throw new Error('offline');
  }

  try {
    const result = await worker.recognize(file);
    return {
      text: result.data.text.replace(/\n{3,}/g, '\n\n').trim(),
      confidence: result.data.confidence,
    };
  } finally {
    void worker.terminate().catch(() => undefined);
  }
}
