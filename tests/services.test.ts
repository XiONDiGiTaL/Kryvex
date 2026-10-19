import { describe, expect, it } from 'vitest';
import {
  SERVICE_COLORS,
  letterFor,
  makeId,
  partitionFor,
  starterState,
  validateServiceInput,
} from '../src/lib/services';

const valid = {
  name: 'Linear',
  url: 'linear.app',
  category: 'productivity' as const,
  color: SERVICE_COLORS[0],
};

describe('validateServiceInput', () => {
  it('accepts a valid service and normalizes the URL', () => {
    const result = validateServiceInput(valid);
    expect(result.ok).toBe(true);
    expect(result.service?.url).toBe('https://linear.app');
    expect(result.service?.letter).toBe('L');
    expect(result.service?.pinned).toBe(false);
  });

  it('rejects short names', () => {
    const result = validateServiceInput({ ...valid, name: 'x' });
    expect(result.ok).toBe(false);
    expect(result.errors.name).toMatch(/two characters/i);
  });

  it('rejects invalid URLs', () => {
    const result = validateServiceInput({ ...valid, url: 'javascript:alert(1)' });
    expect(result.ok).toBe(false);
    expect(result.errors.url).toMatch(/http/i);
  });

  it('rejects colors outside the palette', () => {
    const result = validateServiceInput({ ...valid, color: '#ff0000' });
    expect(result.ok).toBe(false);
    expect(result.errors.color).toBeTruthy();
  });

  it('rejects unknown categories', () => {
    const result = validateServiceInput({
      ...valid,
      category: 'gaming' as (typeof valid)['category'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.category).toBeTruthy();
  });

  it('generates a safe partition identifier', () => {
    const result = validateServiceInput(valid);
    const id = result.service?.id ?? '';
    expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(partitionFor(id)).toBe(`persist:svc-${id}`);
  });
});

describe('helpers', () => {
  it('derives one glyph per name', () => {
    expect(letterFor('Notion')).toBe('N');
    expect(letterFor(' 42 answers ')).toBe('4');
    expect(letterFor('***')).toBe('K');
  });

  it('creates unique ids with the requested prefix', () => {
    const a = makeId('b');
    const b = makeId('b');
    expect(a).not.toBe(b);
    expect(a.startsWith('b-')).toBe(true);
  });
});

describe('starterState', () => {
  it('ships a valid, usable workspace', () => {
    const state = starterState();
    expect(state.services.length).toBeGreaterThanOrEqual(3);
    expect(state.services.every(service => service.url.startsWith('https://'))).toBe(true);
    expect(state.services.filter(service => service.pinned).length).toBeGreaterThan(0);
    expect(state.settings.themeId).toBe('kryvex-dark');
    expect(state.recent).toEqual([]);
    for (const service of state.services) {
      expect(service.id).toMatch(/^[a-z0-9-]{1,64}$/);
    }
  });

});
