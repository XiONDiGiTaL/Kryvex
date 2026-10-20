import { describe, expect, it } from 'vitest';
import { isServicePartition } from '../electron/service-rules';

describe('isServicePartition', () => {
  it('accepts persistent service partitions only', () => {
    expect(isServicePartition('persist:svc-s-starter-1')).toBe(true);
    expect(isServicePartition('persist:svc-0f8c2e4a-1b2c-4d5e-8f90-1234567890ab')).toBe(true);
  });

  it('rejects browser tabs, the default session and traversal attempts', () => {
    expect(isServicePartition('browser-abc')).toBe(false);
    expect(isServicePartition('persist:svc-')).toBe(false);
    expect(isServicePartition('persist:svc-../evil')).toBe(false);
    expect(isServicePartition('persist:svc-ABC DEF')).toBe(false);
    expect(isServicePartition(undefined)).toBe(false);
  });
});
