import { contextBridge, ipcRenderer } from 'electron';

/**
 * Deterministic fingerprint farbling, inspired by Brave's approach.
 *
 * Preload runs before page scripts, but with context isolation it lives in an
 * isolated world. `executeInMainWorld` installs the wrappers where a page can
 * actually see them. The seed is fetched synchronously from the main process
 * so the first script cannot beat the patch.
 *
 * The changes are deliberately small and repeatable: low-order colour bits in
 * canvas/WebGL readbacks and inaudible noise in AnalyserNode frequency data.
 * The same image or buffer always produces the same result for the same site
 * and app session, so ordinary pages do not see changing values.
 */
let seed = 0;
try {
  const root = globalThis as unknown as {
    location?: { ancestorOrigins?: ArrayLike<string>; origin?: string };
    document?: { referrer?: string };
  };
  const site =
    root.location?.ancestorOrigins?.[0] ||
    root.document?.referrer ||
    root.location?.origin ||
    '';
  const value = ipcRenderer.sendSync('kryvex:farbling:seed', site);
  if (typeof value === 'number' && Number.isFinite(value)) seed = value >>> 0;
} catch {
  seed = 0;
}

if (seed !== 0) {
  try {
    contextBridge.executeInMainWorld({ func: installFarbling, args: [seed] });
  } catch {
    // Older Electron builds lack main-world execution; URL privacy still works.
  }
}

/**
 * This function is serialized into the page's main world. Keep every helper
 * inside it and do not reference module-scope values.
 */
function installFarbling(farblingSeed: number): void {
  const root = globalThis as unknown as Record<string, unknown> & {
    document?: { createElement: (tag: string) => any };
  };
  const marker = Symbol.for('kryvex.farbling');
  if (root[marker as unknown as string]) return;
  try {
    Object.defineProperty(root, marker, {
      value: farblingSeed,
      enumerable: false,
      configurable: false,
    });
  } catch {
    return;
  }

  const seedValue = farblingSeed >>> 0;

  function mix(hash: number, value: number): number {
    return Math.imul(hash ^ value, 16777619) >>> 0;
  }

  function hashBytes(data: ArrayLike<number>, width: number, height: number): number {
    let hash = (seedValue ^ 0x811c9dc5) >>> 0;
    hash = mix(hash, width);
    hash = mix(hash, height);
    hash = mix(hash, data.length);
    const step = Math.max(1, Math.floor(data.length / 1536));
    for (let index = 0; index < data.length; index += step) {
      hash = mix(hash, data[index] ?? 0);
    }
    return hash >>> 0;
  }

  function perturbBytes(
    data: { [index: number]: number; length: number },
    width: number,
    height: number,
    channels: number,
  ): void {
    const pixels = Math.floor(data.length / channels);
    if (pixels < 1) return;
    let state = hashBytes(data, width, height) || 1;
    const picks = Math.min(6, pixels);
    for (let index = 0; index < picks; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const pixel = state % pixels;
      const base = pixel * channels;
      // Keep alpha untouched; only RGB low bits are allowed to move.
      const channel = base + 1 + ((state >>> 8) % Math.max(1, channels - 1));
      if (channel < base + channels) {
        data[channel] = (data[channel] ?? 0) ^ ((state >>> 16) & 1);
      }
    }
  }

  function mask(wrapper: any, native: any, name: string): any {
    try {
      Object.defineProperty(wrapper, 'name', {
        value: native.name || name,
        configurable: true,
      });
    } catch {
      /* name is cosmetic */
    }
    try {
      Object.defineProperty(wrapper, 'length', {
        value: native.length,
        configurable: true,
      });
    } catch {
      /* length is cosmetic */
    }
    try {
      wrapper.toString = function toString() {
        return native.toString();
      };
    } catch {
      /* some hosts freeze function properties */
    }
    return wrapper;
  }

  const Canvas2D = root.CanvasRenderingContext2D as any;
  const Offscreen2D = root.OffscreenCanvasRenderingContext2D as any;
  const HTMLCanvas = root.HTMLCanvasElement as any;
  const WebGL1 = root.WebGLRenderingContext as any;
  const WebGL2 = root.WebGL2RenderingContext as any;
  const Analyser = root.AnalyserNode as any;

  const nativeGetImageData = Canvas2D?.prototype?.getImageData;
  const nativeToDataURL = HTMLCanvas?.prototype?.toDataURL;
  const nativeToBlob = HTMLCanvas?.prototype?.toBlob;

  function farbleImage(image: any): any {
    try {
      if (image && image.data) perturbBytes(image.data, image.width, image.height, 4);
    } catch {
      /* a detached or read-only buffer must not break the page */
    }
    return image;
  }

  function patchImageData(proto: any): void {
    const native = proto?.getImageData;
    if (!native) return;
    const wrapped = mask(
      function getImageData(this: unknown) {
        const image = native.apply(this, arguments);
        return farbleImage(image);
      },
      native,
      'getImageData',
    );
    try {
      proto.getImageData = wrapped;
    } catch {
      /* frozen prototype */
    }
  }

  if (nativeGetImageData) {
    patchImageData(Canvas2D?.prototype);
    patchImageData(Offscreen2D?.prototype);
  }

  function farbledCopy(canvas: any): any {
    if (!root.document) return null;
    const width = Number(canvas.width) | 0;
    const height = Number(canvas.height) | 0;
    if (!width || !height || width * height > 16_000_000) return null;
    const temp = root.document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const context = temp.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(canvas, 0, 0);
    const image = nativeGetImageData.call(context, 0, 0, width, height);
    perturbBytes(image.data, width, height, 4);
    context.putImageData(image, 0, 0);
    return temp;
  }

  if (HTMLCanvas && nativeToDataURL) {
    const wrapped = mask(
      function toDataURL(this: any) {
        try {
          const temp = farbledCopy(this);
          if (temp) return nativeToDataURL.apply(temp, arguments);
        } catch {
          /* tainted or huge canvases keep their native behaviour */
        }
        return nativeToDataURL.apply(this, arguments);
      },
      nativeToDataURL,
      'toDataURL',
    );
    try {
      HTMLCanvas.prototype.toDataURL = wrapped;
    } catch {
      /* frozen prototype */
    }
  }

  if (HTMLCanvas && nativeToBlob) {
    const wrapped = mask(
      function toBlob(this: any) {
        try {
          const temp = farbledCopy(this);
          if (temp) return nativeToBlob.apply(temp, arguments);
        } catch {
          /* fall through to the native canvas */
        }
        return nativeToBlob.apply(this, arguments);
      },
      nativeToBlob,
      'toBlob',
    );
    try {
      HTMLCanvas.prototype.toBlob = wrapped;
    } catch {
      /* frozen prototype */
    }
  }

  function patchReadPixels(proto: any): void {
    const native = proto?.readPixels;
    if (!native) return;
    const wrapped = mask(
      function readPixels(this: any, _x: number, _y: number, width: number, height: number, format: number, type: number, pixels: any) {
        const result = native.apply(this, arguments);
        try {
          const rgba = this.RGBA || 6408;
          const unsignedByte = this.UNSIGNED_BYTE || 5121;
          if (
            pixels &&
            typeof pixels.length === 'number' &&
            pixels.BYTES_PER_ELEMENT === 1 &&
            width > 0 &&
            height > 0 &&
            (format === rgba || format === 6408) &&
            (type === unsignedByte || type === 5121)
          ) {
            perturbBytes(pixels, width, height, 4);
          }
        } catch {
          /* never break a WebGL readback */
        }
        return result;
      },
      native,
      'readPixels',
    );
    try {
      proto.readPixels = wrapped;
    } catch {
      /* frozen prototype */
    }
  }

  patchReadPixels(WebGL1?.prototype);
  patchReadPixels(WebGL2?.prototype);

  if (Analyser && Analyser.prototype?.getFloatFrequencyData) {
    const native = Analyser.prototype.getFloatFrequencyData;
    const wrapped = mask(
      function getFloatFrequencyData(this: any, array: any) {
        const result = native.apply(this, arguments);
        try {
          if (array && typeof array.length === 'number' && array.length > 0) {
            let hash = hashBytes(array, array.length, 1) || 1;
            for (let index = 0; index < array.length; index += 31) {
              if (!Number.isFinite(array[index])) continue;
              hash ^= hash << 13;
              hash ^= hash >>> 17;
              hash ^= hash << 5;
              hash >>>= 0;
              array[index] += (hash & 1) === 1 ? 0.00001 : -0.00001;
            }
          }
        } catch {
          /* audio analysis remains usable */
        }
        return result;
      },
      native,
      'getFloatFrequencyData',
    );
    try {
      Analyser.prototype.getFloatFrequencyData = wrapped;
    } catch {
      /* frozen prototype */
    }
  }
}
