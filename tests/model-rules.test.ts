import { describe, expect, it } from 'vitest';
import {
  capabilityLabel,
  downloadPercent as rendererPercent,
  failureMessage,
  formatMemoryEstimate,
  formatModelSize,
  isActivePhase,
} from '../src/lib/local-models';
import { MODEL_CATALOGUE, catalogueEntry } from '../electron/model-catalogue';
import {
  MAX_MODEL_BYTES,
  MAX_REDIRECTS,
  canDeleteModel,
  catalogueUrl,
  downloadPercent,
  installedFileName,
  isAllowedModelHost,
  isPathInside,
  isSafeModelId,
  parseModelUrl,
  requiredFreeBytes,
  resolveRedirect,
  validateCatalogueEntry,
  verifyArtifact,
  type CatalogueEntry,
} from '../electron/model-rules';

// The catalogue is compiled in; the assertion only satisfies indexed access.
const starter = MODEL_CATALOGUE[0] as CatalogueEntry;

function copy(overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return { ...starter, ...overrides };
}

describe('the shipped catalogue', () => {
  it('contains one reviewed artifact', () => {
    expect(MODEL_CATALOGUE).toHaveLength(1);
    expect(starter.id).toBe('qwen2.5-1.5b-instruct');
    expect(catalogueEntry(starter.id)).toBe(starter);
    expect(catalogueEntry('something-else')).toBeUndefined();
  });

  it('passes its own validation and pins the researched artifact', () => {
    expect(validateCatalogueEntry(starter)).toEqual([]);
    expect(starter.revision).toBe('91cad51170dc346986eccefdc2dd33a9da36ead9');
    expect(starter.bytes).toBe(1_117_320_736);
    expect(starter.sha256).toBe('6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e');
    expect(starter.licence).toBe('Apache-2.0');
    expect(starter.commercialUse).toBe(true);
    expect(starter.memory.maxBytes).toBeGreaterThan(starter.memory.minBytes);
  });

  it('builds one HTTPS URL from the pinned revision', () => {
    expect(catalogueUrl(starter)).toBe(
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    );
  });

  it('rejects an entry whose artifact facts are incomplete or unsafe', () => {
    expect(validateCatalogueEntry(null)).toEqual(['not-an-object']);
    expect(validateCatalogueEntry(copy({ sha256: 'not-a-hash' }))).toContain('sha256');
    expect(validateCatalogueEntry(copy({ revision: 'main' }))).toContain('revision');
    expect(validateCatalogueEntry(copy({ bytes: MAX_MODEL_BYTES + 1 }))).toContain('bytes-range');
    expect(validateCatalogueEntry(copy({ filename: '../../escape.gguf' }))).toContain('filename');
    expect(validateCatalogueEntry(copy({ id: 'Bad Id' }))).toContain('id');
    expect(validateCatalogueEntry(copy({ architecture: 'Qwen2!' }))).toContain('architecture');
    expect(validateCatalogueEntry(copy({ licenceUrl: 'http://example.com' }))).toContain('licence-url');
  });
});

describe('host and URL policy', () => {
  it('allows only the catalogue host and the measured CDN suffix', () => {
    expect(isAllowedModelHost('huggingface.co')).toBe(true);
    expect(isAllowedModelHost('us.aws.cdn.hf.co')).toBe(true);
    expect(isAllowedModelHost('cdn-lfs.hf.co')).toBe(true);
    expect(isAllowedModelHost('evil-hf.co')).toBe(false);
    expect(isAllowedModelHost('hf.co')).toBe(false);
    expect(isAllowedModelHost('huggingface.co.evil.test')).toBe(false);
    expect(isAllowedModelHost('evilcdn.hf.co.attacker.test')).toBe(false);
  });

  it('refuses anything but a plain HTTPS allowlisted URL', () => {
    expect(parseModelUrl('https://huggingface.co/a/b')?.hostname).toBe('huggingface.co');
    expect(parseModelUrl('http://huggingface.co/a/b')).toBeNull();
    expect(parseModelUrl('https://user:pass@huggingface.co/a/b')).toBeNull();
    expect(parseModelUrl('https://huggingface.co/a/b#fragment')).toBeNull();
    expect(parseModelUrl('https://127.0.0.1/a/b')).toBeNull();
    expect(parseModelUrl('https://localhost/a/b')).toBeNull();
    expect(parseModelUrl('file:///etc/passwd')).toBeNull();
    expect(parseModelUrl('https://huggingface.co/a\u0000b')).toBeNull();
    expect(parseModelUrl(42)).toBeNull();
  });

  it('follows an allowlisted hop and refuses a foreign one', () => {
    const start = catalogueUrl(starter);
    expect(
      resolveRedirect(start, 'https://us.aws.cdn.hf.co/xet-bridge-us/file.gguf?token=abc'),
    ).toBe('https://us.aws.cdn.hf.co/xet-bridge-us/file.gguf?token=abc');
    expect(resolveRedirect(start, '/xet/file.gguf')?.startsWith('https://huggingface.co/')).toBe(true);
    expect(resolveRedirect(start, 'https://evil.example/file.gguf')).toBeNull();
    expect(resolveRedirect(start, 'http://us.aws.cdn.hf.co/file.gguf')).toBeNull();
    expect(resolveRedirect(start, 'https://cdn.hf.co.evil.example/file.gguf')).toBeNull();
    expect(resolveRedirect(start, 'javascript:alert(1)')).toBeNull();
    expect(MAX_REDIRECTS).toBe(3);
  });
});

describe('paths', () => {
  it('generates its own filename and never trusts the remote one', () => {
    expect(installedFileName('qwen2.5-1.5b-instruct')).toBe('qwen2.5-1.5b-instruct.gguf');
    expect(isSafeModelId('qwen2.5-1.5b-instruct')).toBe(true);
    expect(isSafeModelId('../escape')).toBe(false);
    expect(isSafeModelId('a')).toBe(false);
  });

  it('keeps every model inside the models directory', () => {
    const dir = 'C:\\Users\\xiond\\AppData\\Roaming\\Kryvex\\models';
    expect(isPathInside(dir, `${dir}\\qwen2.5-1.5b-instruct.gguf`)).toBe(true);
    expect(isPathInside(dir, `${dir}\\..\\kryvex-local-model.json`)).toBe(false);
    expect(isPathInside(dir, 'C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(false);
    expect(isPathInside(dir, dir)).toBe(false);
  });

  it('refuses to delete the model that is currently running', () => {
    const dir = 'C:\\models';
    const entry = {
      id: 'qwen2.5-1.5b-instruct',
      name: 'Qwen2.5-1.5B-Instruct',
      filename: 'qwen2.5-1.5b-instruct.gguf',
      bytes: starter.bytes,
      sha256: starter.sha256,
      installedAt: '2026-10-22T00:00:00.000Z',
      licence: starter.licence,
      revision: starter.revision,
    };
    expect(canDeleteModel(entry, 'C:\\models\\qwen2.5-1.5b-instruct.gguf', dir)).toBe(false);
    expect(canDeleteModel(entry, 'C:\\other\\model.gguf', dir)).toBe(true);
    expect(canDeleteModel(undefined, '', dir)).toBe(false);
    expect(canDeleteModel({ ...entry, id: '../escape' }, '', dir)).toBe(false);
  });
});

describe('verification and progress', () => {
  it('accepts only an exact size and matching digest', () => {
    expect(
      verifyArtifact({
        receivedBytes: starter.bytes,
        sha256: starter.sha256,
        expectedBytes: starter.bytes,
        expectedSha256: starter.sha256,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyArtifact({
        receivedBytes: starter.bytes - 1,
        sha256: starter.sha256,
        expectedBytes: starter.bytes,
        expectedSha256: starter.sha256,
      }),
    ).toEqual({ ok: false, reason: 'size' });
    expect(
      verifyArtifact({
        receivedBytes: starter.bytes,
        sha256: 'a'.repeat(64),
        expectedBytes: starter.bytes,
        expectedSha256: starter.sha256,
      }),
    ).toEqual({ ok: false, reason: 'hash' });
  });

  it('reserves the download plus a margin of free space', () => {
    expect(requiredFreeBytes(starter.bytes)).toBeGreaterThan(starter.bytes);
    expect(requiredFreeBytes(0)).toBe(0);
  });

  it('clamps progress to 0–100', () => {
    expect(downloadPercent(0, 100)).toBe(0);
    expect(downloadPercent(50, 100)).toBe(50);
    expect(downloadPercent(200, 100)).toBe(100);
    expect(downloadPercent(-5, 100)).toBe(0);
    expect(downloadPercent(10, 0)).toBe(0);
    expect(rendererPercent(200, 100)).toBe(downloadPercent(200, 100));
    expect(rendererPercent(10, 0)).toBe(downloadPercent(10, 0));
  });
});

describe('panel formatting', () => {
  it('prints binary sizes without pretending to be exact', () => {
    expect(formatModelSize(0)).toBe('0 B');
    expect(formatModelSize(512)).toBe('512 B');
    expect(formatModelSize(1024)).toBe('1.00 KiB');
    expect(formatModelSize(starter.bytes)).toBe('1.04 GiB');
    expect(formatMemoryEstimate(starter.memory)).toBe('≈1.40 GiB–1.58 GiB');
  });

  it('turns a failure code into one translatable sentence', () => {
    expect(failureMessage('hash')).toBe('Checksum mismatch: nothing was installed.');
    expect(failureMessage('disk-space')).toContain('disk space');
    expect(failureMessage('running')).toMatch(/stop the server/i);
    expect(failureMessage(undefined)).toBe('The download could not be completed.');
  });

  it('knows which phases are still moving', () => {
    expect(isActivePhase('downloading')).toBe(true);
    expect(isActivePhase('verifying')).toBe(true);
    expect(isActivePhase('installed')).toBe(false);
    expect(isActivePhase(undefined)).toBe(false);
  });

  it('labels capabilities from stable ids, not model-card prose', () => {
    expect(capabilityLabel('conversation')).toBe('Ordinary conversation');
    expect(capabilityLabel('unknown-id')).toBe('unknown-id');
  });
});
