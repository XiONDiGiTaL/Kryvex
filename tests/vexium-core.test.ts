import { describe, expect, it } from 'vitest';
import {
  CORE_DEFAULT,
  OLLAMA_DEFAULT,
  installedCoreFor,
  resolveAssistantSettings,
  shouldAutoStartCore,
} from '../src/lib/vexium-core';
import { sanitizeAssistant } from '../src/lib/store';
import type { AssistantSettings, ModelInstalledRow } from '../src/types';

const base: AssistantSettings = {
  provider: 'local',
  baseUrl: CORE_DEFAULT,
  model: '',
  migrated: true,
};

function row(patch: Partial<ModelInstalledRow>): ModelInstalledRow {
  return {
    id: 'qwen2.5-1.5b-instruct',
    name: 'Qwen2.5-1.5B-Instruct',
    filename: 'qwen2.5-1.5b-instruct.gguf',
    bytes: 1_117_320_736,
    sha256: '',
    installedAt: '2026-10-23T00:00:00.000Z',
    licence: 'Apache-2.0',
    revision: '',
    present: true,
    path: 'C:\\Users\\xiond\\AppData\\Roaming\\Kryvex\\models\\qwen2.5-1.5b-instruct.gguf',
    ...patch,
  };
}

describe('resolveAssistantSettings', () => {
  it('moves an untouched Ollama default to Vexium Core once', () => {
    const next = resolveAssistantSettings(
      { provider: 'ollama', baseUrl: OLLAMA_DEFAULT, model: '' },
      base,
    );
    expect(next).toEqual({ provider: 'local', baseUrl: CORE_DEFAULT, model: '', migrated: true });
  });

  it('treats a missing address as the same untouched default', () => {
    const next = resolveAssistantSettings({ provider: 'ollama' }, base);
    expect(next.provider).toBe('local');
    expect(next.baseUrl).toBe(CORE_DEFAULT);
  });

  it('keeps Ollama when it was chosen and then migrated', () => {
    const chosen = resolveAssistantSettings(
      { provider: 'ollama', baseUrl: OLLAMA_DEFAULT, model: 'llama3.1:8b', migrated: true },
      base,
    );
    expect(chosen.provider).toBe('ollama');
    expect(chosen.baseUrl).toBe(OLLAMA_DEFAULT);
    expect(chosen.model).toBe('llama3.1:8b');

    const readdressed = resolveAssistantSettings(
      { provider: 'ollama', baseUrl: 'http://127.0.0.1:11500', model: '' },
      base,
    );
    expect(readdressed.provider).toBe('ollama');
    expect(readdressed.baseUrl).toBe('http://127.0.0.1:11500');
  });

  it('never migrates a profile that already ran the migration', () => {
    const again = resolveAssistantSettings(
      { provider: 'ollama', baseUrl: OLLAMA_DEFAULT, model: '', migrated: true },
      base,
    );
    expect(again.provider).toBe('ollama');
  });

  it('keeps LM Studio and the local provider as saved', () => {
    const lmstudio = resolveAssistantSettings(
      { provider: 'lmstudio', baseUrl: 'http://127.0.0.1:1234', model: 'local-model' },
      base,
    );
    expect(lmstudio.provider).toBe('lmstudio');
    expect(lmstudio.baseUrl).toBe('http://127.0.0.1:1234');
    expect(lmstudio.migrated).toBe(true);
  });

  it('is the rule the saved state uses', () => {
    const migrated = sanitizeAssistant({ provider: 'ollama', baseUrl: OLLAMA_DEFAULT, model: '' });
    expect(migrated.provider).toBe('local');
    expect(migrated.migrated).toBe(true);
    expect(sanitizeAssistant({ provider: 'ollama', baseUrl: OLLAMA_DEFAULT, model: '' }).provider).toBe(
      'local',
    );
  });
});

describe('shouldAutoStartCore', () => {
  const stopped = { phase: 'stopped' as const, path: 'C:\\models\\qwen.gguf' };

  it('starts a configured local model that is stopped', () => {
    expect(shouldAutoStartCore({ provider: 'local', status: stopped })).toBe(true);
    expect(
      shouldAutoStartCore({ provider: 'local', status: { phase: 'idle', path: 'C:\\models\\qwen.gguf' } }),
    ).toBe(true);
  });

  it('leaves a running, starting, failed or missing model alone', () => {
    expect(shouldAutoStartCore({ provider: 'local', status: { ...stopped, phase: 'running' } })).toBe(
      false,
    );
    expect(shouldAutoStartCore({ provider: 'local', status: { ...stopped, phase: 'starting' } })).toBe(
      false,
    );
    expect(shouldAutoStartCore({ provider: 'local', status: { ...stopped, phase: 'error' } })).toBe(
      false,
    );
    expect(shouldAutoStartCore({ provider: 'local', status: { phase: 'idle', path: '' } })).toBe(false);
    expect(shouldAutoStartCore({ provider: 'local', status: null })).toBe(false);
  });

  it('never starts a server the profile did not ask for', () => {
    expect(shouldAutoStartCore({ provider: 'ollama', status: stopped })).toBe(false);
    expect(shouldAutoStartCore({ provider: 'lmstudio', status: stopped })).toBe(false);
  });
});

describe('installedCoreFor', () => {
  it('matches the served file by path or by filename', () => {
    const served = row({});
    const rows = [served];
    expect(installedCoreFor(rows, served.path)?.id).toBe('qwen2.5-1.5b-instruct');
    expect(
      installedCoreFor(rows, 'C:/Users/xiond/AppData/Roaming/Kryvex/models/qwen2.5-1.5b-instruct.gguf')
        ?.id,
    ).toBe('qwen2.5-1.5b-instruct');
    expect(installedCoreFor(rows, 'C:\\elsewhere\\qwen2.5-1.5b-instruct.gguf')?.id).toBe(
      'qwen2.5-1.5b-instruct',
    );
  });

  it('returns nothing for an unknown file', () => {
    expect(installedCoreFor([row({})], 'C:\\models\\other.gguf')).toBeNull();
    expect(installedCoreFor([], 'C:\\models\\qwen.gguf')).toBeNull();
    expect(installedCoreFor([row({})], '')).toBeNull();
  });
});
