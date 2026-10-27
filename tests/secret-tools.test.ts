import { describe, expect, it } from 'vitest';
import {
  EMBEDDABLE_TOOL_IDS,
  SECRET_TOOL_IDS,
  SECRET_TOOL_LABELS,
  isEmbeddableTool,
  isSecretToolId,
  sanitizePinnedTools,
} from '../src/lib/secret-tools';
import { isToolWindowId, toolOfWindowId, toolWindowId } from '../src/lib/tool-windows';

describe('built-in tool pins', () => {
  it('names every tool the Services page offers', () => {
    expect(SECRET_TOOL_IDS).toEqual([
      'lexium',
      'player',
      'emulator',
      'disk',
      'link',
      'arcade',
      'forge',
      'canvas',
    ]);
    for (const id of SECRET_TOOL_IDS) expect(SECRET_TOOL_LABELS[id]).toBeTruthy();
  });

  it('recognises only the tools the app ships', () => {
    expect(isSecretToolId('disk')).toBe(true);
    expect(isSecretToolId('canvas')).toBe(true);
    expect(isSecretToolId('speaker')).toBe(false);
    expect(isSecretToolId(null)).toBe(false);
  });

  it('keeps the saved order and drops anything else', () => {
    expect(sanitizePinnedTools(['player', 'nope', 'player', 'disk'])).toEqual(['player', 'disk']);
    expect(sanitizePinnedTools(['canvas', 'arcade'])).toEqual(['canvas', 'arcade']);
    expect(sanitizePinnedTools(undefined)).toEqual([]);
    expect(sanitizePinnedTools('lexium')).toEqual([]);
  });
});

/**
 * Only the tools that are a plain view may be framed twice. The others own a
 * partition, a server or a page state, so a window would be a second copy of
 * something that must stay single.
 */
describe('tools that can live in a Workspace window', () => {
  it('is the three that draw themselves, not the ones that own a session', () => {
    expect([...EMBEDDABLE_TOOL_IDS]).toEqual(['arcade', 'forge', 'canvas']);
    for (const tool of ['lexium', 'player', 'emulator', 'disk', 'link']) {
      expect(isEmbeddableTool(tool)).toBe(false);
    }
    expect(isEmbeddableTool('canvas')).toBe(true);
    expect(isEmbeddableTool('nope')).toBe(false);
  });

  it('round-trips a window id and refuses anything else', () => {
    expect(toolWindowId('forge')).toBe('tool:forge');
    expect(toolOfWindowId('tool:forge')).toBe('forge');
    expect(toolOfWindowId('tool:lexium')).toBeNull();
    expect(toolOfWindowId('svc-123')).toBeNull();
    expect(isToolWindowId('tool:canvas')).toBe(true);
    expect(isToolWindowId('canvas')).toBe(false);
  });
});
