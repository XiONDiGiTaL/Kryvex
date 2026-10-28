import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT,
  DEFAULT_GPU_LAYERS,
  MAX_LOG_LINES,
  binaryCandidates,
  buildServerArgs,
  clampContext,
  clampGpuLayers,
  isGgufPath,
  logText,
  modelName,
  runtimeDirs,
  tailLog,
} from '../electron/local-model-rules';

describe('isGgufPath', () => {
  it('accepts a real GGUF path on either platform', () => {
    expect(isGgufPath('C:\\models\\Llama-3.2-3B.Q4_K_M.gguf')).toBe(true);
    expect(isGgufPath('/home/me/models/qwen2.5-7b.gguf')).toBe(true);
    expect(isGgufPath('/models/MISTRAL.GGUF')).toBe(true);
  });

  it('rejects other files, blanks, control characters and absurd lengths', () => {
    expect(isGgufPath('/models/model.bin')).toBe(false);
    expect(isGgufPath('')).toBe(false);
    expect(isGgufPath('   ')).toBe(false);
    expect(isGgufPath('/models/a\u0000.gguf')).toBe(false);
    expect(isGgufPath(`/models/${'a'.repeat(5000)}.gguf`)).toBe(false);
    expect(isGgufPath(42)).toBe(false);
  });
});

describe('modelName', () => {
  it('drops the extension and both path separators', () => {
    expect(modelName('C:\\models\\Llama-3.2-3B.Q4_K_M.gguf')).toBe('Llama-3.2-3B.Q4_K_M');
    expect(modelName('/models/qwen.gguf')).toBe('qwen');
  });
});

describe('clampContext / clampGpuLayers', () => {
  it('keeps sane values and repairs nonsense', () => {
    expect(clampContext(8192)).toBe(8192);
    expect(clampContext(12)).toBe(DEFAULT_CONTEXT);
    expect(clampContext('nope')).toBe(DEFAULT_CONTEXT);
    expect(clampContext(9_999_999)).toBe(131_072);
    expect(clampGpuLayers(0)).toBe(0);
    expect(clampGpuLayers(-4)).toBe(DEFAULT_GPU_LAYERS);
    expect(clampGpuLayers(9_999)).toBe(DEFAULT_GPU_LAYERS);
  });
});

describe('buildServerArgs', () => {
  it('binds the server to loopback and passes the chosen file', () => {
    const args = buildServerArgs({
      modelPath: '/models/qwen.gguf',
      port: 8123,
      ctxSize: 8192,
      gpuLayers: 32,
    });
    expect(args).toEqual([
      '--model',
      '/models/qwen.gguf',
      '--host',
      '127.0.0.1',
      '--port',
      '8123',
      '--ctx-size',
      '8192',
      '--n-gpu-layers',
      '32',
      // The GGUF's own chat template is only rendered when jinja is enabled.
      '--jinja',
    ]);
    expect(args).not.toContain('0.0.0.0');
  });

  it('sends clamped values to the runtime, not raw input', () => {
    const args = buildServerArgs({
      modelPath: '/models/qwen.gguf',
      port: 8123,
      ctxSize: 10 ** 9,
      gpuLayers: -1,
    });
    expect(args[args.indexOf('--ctx-size') + 1]).toBe('131072');
    expect(args[args.indexOf('--n-gpu-layers') + 1]).toBe(String(DEFAULT_GPU_LAYERS));
  });
});

describe('binaryCandidates', () => {
  it('looks for the Windows executable first', () => {
    const list = binaryCandidates('win32', ['C:\\Users\\me\\Kryvex\\bin\\']);
    expect(list[0]).toBe('C:\\Users\\me\\Kryvex\\bin/llama-server.exe');
  });

  it('uses the POSIX name elsewhere', () => {
    const list = binaryCandidates('linux', ['/opt/kryvex/bin']);
    expect(list[0]).toBe('/opt/kryvex/bin/llama-server');
  });
});

describe('runtimeDirs', () => {
  it('checks app data, the installed app and a source checkout, in that order', () => {
    const dirs = runtimeDirs({
      userDataDir: '/home/me/.config/kryvex/bin/',
      resourcesDir: '/opt/kryvex/resources/bin',
      appDir: '/home/me/Kryvex/',
      packaged: false,
    });
    expect(dirs.map(entry => entry.dir)).toEqual([
      '/home/me/.config/kryvex/bin',
      '/opt/kryvex/resources/bin',
      '/home/me/Kryvex/runtime/bin',
    ]);
    expect(dirs.map(entry => entry.bundled)).toEqual([false, true, true]);
  });

  it('never consults a working-directory runtime once packaged', () => {
    const dirs = runtimeDirs({
      userDataDir: 'C:\\Users\\me\\AppData\\Kryvex\\bin',
      resourcesDir: 'C:\\Program Files\\Kryvex\\resources\\bin',
      appDir: 'C:\\Kryvex\\resources\\app.asar',
      packaged: true,
    });
    expect(dirs).toHaveLength(2);
    expect(dirs.some(entry => entry.dir.includes('app.asar'))).toBe(false);
  });
});

describe('tailLog', () => {
  it('keeps only the newest lines and caps each line', () => {
    let lines: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      lines = tailLog(lines, `line ${index}`);
    }
    expect(lines).toHaveLength(MAX_LOG_LINES);
    expect(lines[lines.length - 1]).toBe('line 99');

    const long = tailLog([], 'x'.repeat(2000));
    expect(long[0]?.length).toBe(400);
  });

  it('renders a short tail for the panel', () => {
    const text = logText(['a', 'b', 'c']);
    expect(text.split('\n')).toHaveLength(3);
  });
});
