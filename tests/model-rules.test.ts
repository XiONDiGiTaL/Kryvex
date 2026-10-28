import { describe, expect, it } from 'vitest';
import {
  capabilityLabel,
  downloadPercent as rendererPercent,
  failureMessage,
  formatMemoryEstimate,
  formatModelSize,
  isActivePhase,
  modelFileLabel,
  modelSource,
  modelSourceLabel,
  orderCatalogue,
} from '../src/lib/local-models';
import {
  FLAGSHIP_MODEL_ID,
  LIGHT_MODEL_ID,
  MODEL_CATALOGUE,
  STARTER_MODEL_ID,
  catalogueEntry,
} from '../electron/model-catalogue';
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
const light = MODEL_CATALOGUE[1] as CatalogueEntry;
const flagship = MODEL_CATALOGUE[2] as CatalogueEntry;

function copy(overrides: Partial<CatalogueEntry> = {}): CatalogueEntry {
  return { ...starter, ...overrides };
}

describe('the shipped catalogue', () => {
  it('offers the 3B core first and the light core beside it', () => {
    expect(MODEL_CATALOGUE).toHaveLength(3);
    expect(starter.id).toBe(STARTER_MODEL_ID);
    expect(starter.id).toBe('vexium-core-3b');
    expect(starter.productName).toBe('Vexium Core');
    expect(starter.name).toBe('Vexium Core 3B');
    expect(light.id).toBe(LIGHT_MODEL_ID);
    expect(light.productName).toBe('Vexium Core Light');
    expect(flagship.id).toBe(FLAGSHIP_MODEL_ID);
    expect(flagship.productName).toBe('Vexium-1');
    expect(flagship.name).toBe('Vexium-1 12B');
    expect(catalogueEntry(starter.id)).toBe(starter);
    expect(catalogueEntry('something-else')).toBeUndefined();
    expect(MODEL_CATALOGUE.every(entry => validateCatalogueEntry(entry).length === 0)).toBe(true);
  });

  it('pins the flagship artifact to the uploaded file, not to its base model', () => {
    expect(validateCatalogueEntry(flagship)).toEqual([]);
    expect(flagship.repository).toBe('XiONDiGiTaL/Vexium-1');
    expect(flagship.revision).toBe('87c83243356e47dac7cfe5c06b9b2f34126ce500');
    expect(flagship.bytes).toBe(7_477_209_792);
    expect(flagship.sha256).toBe('26b5ad94d602c462cfdbe9f005cbdab8e66d60718d1054afc7060d42065b6ecb');
    expect(flagship.licence).toBe('Apache-2.0');
    expect(flagship.languages).toContain('tr');
    expect(catalogueUrl(flagship)).toBe(
      'https://huggingface.co/XiONDiGiTaL/Vexium-1/resolve/87c83243356e47dac7cfe5c06b9b2f34126ce500/vexium-1-12b-q4_k_m.gguf',
    );
  });

  it('reads a configured model filename without its directory or suffix', () => {
    expect(modelFileLabel('C:\\Users\\xiond\\AppData\\Roaming\\Kryvex\\models\\qwen2.5-1.5b-instruct.gguf')).toBe(
      'qwen2.5-1.5b-instruct',
    );
    expect(modelFileLabel('/home/user/models/Llama-3.2-3B.Q4_K_M.GGUF')).toBe(
      'Llama-3.2-3B.Q4_K_M',
    );
    expect(modelFileLabel('')).toBe('');
  });

  it('passes its own validation and pins the researched artifact', () => {
    expect(validateCatalogueEntry(starter)).toEqual([]);
    expect(starter.revision).toBe('7dabda4d13d513e3e842b20f0d435c732f172cbe');
    expect(starter.bytes).toBe(2_104_932_768);
    expect(starter.sha256).toBe('626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d');
    expect(starter.licence).toBe('Apache-2.0');
    expect(starter.commercialUse).toBe(true);
    expect(starter.memory.maxBytes).toBeGreaterThan(starter.memory.minBytes);
  });

  it('downloads its own release asset rather than the base model repository', () => {
    expect(catalogueUrl(starter)).toBe(
      'https://github.com/XiONDiGiTaL/Vexium-Core/releases/download/v2/vexium-core-3b-q4_k_m.gguf',
    );
    // The light entry has no redistributed asset, so it resolves to Hugging Face.
    expect(catalogueUrl(light)).toBe(
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct.gguf',
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
  it('allows only the catalogue hosts and their measured CDN suffixes', () => {
    expect(isAllowedModelHost('huggingface.co')).toBe(true);
    expect(isAllowedModelHost('us.aws.cdn.hf.co')).toBe(true);
    expect(isAllowedModelHost('cdn-lfs.hf.co')).toBe(true);
    expect(isAllowedModelHost('evil-hf.co')).toBe(false);
    expect(isAllowedModelHost('hf.co')).toBe(false);
    expect(isAllowedModelHost('huggingface.co.evil.test')).toBe(false);
    expect(isAllowedModelHost('evilcdn.hf.co.attacker.test')).toBe(false);
    expect(isAllowedModelHost('github.com')).toBe(true);
    expect(isAllowedModelHost('objects.githubusercontent.com')).toBe(true);
    expect(isAllowedModelHost('evilgithubusercontent.com')).toBe(false);
    expect(isAllowedModelHost('github.com.evil.test')).toBe(false);
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
    expect(
      resolveRedirect(start, 'https://release-assets.githubusercontent.com/file.gguf?sig=abc'),
    ).toBe('https://release-assets.githubusercontent.com/file.gguf?sig=abc');
    // A relative hop stays on the origin the download started from.
    expect(resolveRedirect(start, '/xet/file.gguf')?.startsWith('https://github.com/')).toBe(true);
    expect(
      resolveRedirect(catalogueUrl(light), '/api/file.gguf')?.startsWith(
        'https://huggingface.co/',
      ),
    ).toBe(true);
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
    expect(formatModelSize(starter.bytes)).toBe('1.96 GiB');
    expect(formatMemoryEstimate(starter.memory)).toBe('≈2.42 GiB–2.98 GiB');
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

  it('names the host each artifact really comes from', () => {
    // Two of the three are GitHub release assets; the old card printed
    // huggingface.co for all of them, which sent readers to a page that does
    // not hold the file.
    const starter = catalogueEntry(STARTER_MODEL_ID);
    const light = catalogueEntry(LIGHT_MODEL_ID);
    const flagship = catalogueEntry(FLAGSHIP_MODEL_ID);
    expect(starter).toBeDefined();
    expect(modelSourceLabel(catalogueUrl(starter!), '')).toBe('github.com/XiONDiGiTaL/Vexium-Core');
    expect(modelSourceLabel(catalogueUrl(light!), '')).toBe(
      'huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    );
    expect(modelSourceLabel(catalogueUrl(flagship!), '')).toBe(
      'huggingface.co/XiONDiGiTaL/Vexium-1',
    );

    // Every label must agree with the URL the downloader would fetch.
    for (const entry of MODEL_CATALOGUE) {
      const url = catalogueUrl(entry);
      const source = modelSource(url);
      expect(source?.host).toBe(new URL(url).hostname);
      expect(url.startsWith(`https://${source?.host}/${source?.repository}/`)).toBe(true);
    }

    // Anything unparsable falls back to the bare repository name.
    expect(modelSourceLabel(undefined, 'XiONDiGiTaL/Vexium-Core')).toBe('XiONDiGiTaL/Vexium-Core');
    expect(modelSourceLabel('not a url', 'fallback/repo')).toBe('fallback/repo');
  });

  it('leads the hub with the model in use and keeps the rest in order', () => {
    const ids = MODEL_CATALOGUE.map(entry => entry.id);
    // Nothing selected: the default core leads, the catalogue order survives.
    expect(orderCatalogue(MODEL_CATALOGUE, null, STARTER_MODEL_ID).map(entry => entry.id)).toEqual([
      STARTER_MODEL_ID,
      ...ids.filter(id => id !== STARTER_MODEL_ID),
    ]);
    // A chosen model takes the top slot and the others keep their relative order.
    const flagged = orderCatalogue(MODEL_CATALOGUE, FLAGSHIP_MODEL_ID, STARTER_MODEL_ID);
    expect(flagged[0]?.id).toBe(FLAGSHIP_MODEL_ID);
    expect(flagged.slice(1).map(entry => entry.id)).toEqual(ids.filter(id => id !== FLAGSHIP_MODEL_ID));
    // An id that is not in the list changes nothing.
    expect(orderCatalogue(MODEL_CATALOGUE, 'gone', STARTER_MODEL_ID)[0]?.id).toBe(STARTER_MODEL_ID);
    expect(orderCatalogue([], 'x', STARTER_MODEL_ID)).toEqual([]);
  });
});
