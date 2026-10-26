import { describe, expect, it } from 'vitest';
import {
  SECRET_TOOL_IDS,
  SECRET_TOOL_LABELS,
  isSecretToolId,
  sanitizePinnedTools,
} from '../src/lib/secret-tools';

describe('built-in tool pins', () => {
  it('names every tool the Services page offers', () => {
    expect(SECRET_TOOL_IDS).toEqual(['lexium', 'player', 'emulator', 'disk', 'link']);
    for (const id of SECRET_TOOL_IDS) expect(SECRET_TOOL_LABELS[id]).toBeTruthy();
  });

  it('recognises only the tools the app ships', () => {
    expect(isSecretToolId('disk')).toBe(true);
    expect(isSecretToolId('speaker')).toBe(false);
    expect(isSecretToolId(null)).toBe(false);
  });

  it('keeps the saved order and drops anything else', () => {
    expect(sanitizePinnedTools(['player', 'nope', 'player', 'disk'])).toEqual(['player', 'disk']);
    expect(sanitizePinnedTools(undefined)).toEqual([]);
    expect(sanitizePinnedTools('lexium')).toEqual([]);
  });
});
