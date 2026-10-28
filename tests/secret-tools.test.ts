import { describe, expect, it } from 'vitest';
import {
  EMBEDDABLE_TOOL_IDS,
  SECRET_TOOL_IDS,
  SECRET_TOOL_LABELS,
  SINGLETON_TOOL_IDS,
  isEmbeddableTool,
  isSecretToolId,
  isSingletonTool,
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
 * Every built-in can be dropped into a window; the ones that own a session are
 * single-instance instead of excluded, so the route shows a docking card while
 * the window holds the only copy.
 */
describe('tools that can live in a Workspace window', () => {
  it('is every tool the app ships', () => {
    expect([...EMBEDDABLE_TOOL_IDS]).toEqual([...SECRET_TOOL_IDS]);
    for (const tool of SECRET_TOOL_IDS) expect(isEmbeddableTool(tool)).toBe(true);
    expect(isEmbeddableTool('nope')).toBe(false);
  });

  it('marks exactly the tools that own a server, a core or a socket', () => {
    expect([...SINGLETON_TOOL_IDS]).toEqual(['lexium', 'player', 'emulator', 'disk', 'link']);
    for (const tool of ['arcade', 'forge', 'canvas']) expect(isSingletonTool(tool)).toBe(false);
    // A tool with no window at all cannot be single-instance by definition.
    for (const tool of SINGLETON_TOOL_IDS) expect(isEmbeddableTool(tool)).toBe(true);
  });

  it('round-trips a window id and refuses anything else', () => {
    expect(toolWindowId('forge')).toBe('tool:forge');
    expect(toolOfWindowId('tool:forge')).toBe('forge');
    // A single-instance tool is still a legal window guest: that is the change.
    expect(toolOfWindowId('tool:lexium')).toBe('lexium');
    expect(toolOfWindowId('svc-123')).toBeNull();
    expect(isToolWindowId('tool:canvas')).toBe(true);
    expect(isToolWindowId('canvas')).toBe(false);
  });
});
