import { describe, expect, it } from 'vitest';
import {
  cpuPercent,
  cpuTimes,
  hostMatches,
  serviceForGuest,
  summarize,
} from '../electron/resources-rules';

describe('resource attribution', () => {
  it('treats a service as owning its own host and subdomains', () => {
    expect(hostMatches('https://mail.google.com', 'https://mail.google.com/mail/u/0')).toBe(true);
    expect(hostMatches('https://app.example.com', 'https://example.com')).toBe(true);
    expect(hostMatches('https://discord.com', 'https://cdn.discord.com/assets')).toBe(true);
    expect(hostMatches('https://discord.com', 'https://example.com')).toBe(false);
    expect(hostMatches('not a url', 'https://example.com')).toBe(false);
  });

  it('attributes each guest process to the first matching service', () => {
    const services = [
      { id: 's-gmail', url: 'https://mail.google.com' },
      { id: 's-discord', url: 'https://discord.com' },
    ];
    expect(serviceForGuest('https://mail.google.com/mail', services)).toBe('s-gmail');
    expect(serviceForGuest('https://cdn.discord.com/app.js', services)).toBe('s-discord');
    expect(serviceForGuest('https://example.com', services)).toBeUndefined();
  });

  it('sums CPU and memory per service and reports the GPU process', () => {
    const snapshot = summarize(
      [
        { pid: 10, type: 'Browser', cpu: 2, memoryMB: 80 },
        { pid: 11, type: 'Tab', cpu: 12.34, memoryMB: 240.4 },
        { pid: 12, type: 'Tab', cpu: 1, memoryMB: 90 },
        { pid: 13, type: 'GPU', cpu: 3.2, memoryMB: 60 },
      ],
      [
        { pid: 11, url: 'https://discord.com/channels/1' },
        { pid: 12, url: 'https://example.com' },
      ],
      [
        { id: 's-discord', url: 'https://discord.com' },
        { id: 's-example', url: 'https://example.com' },
      ],
      { cpu: 19.2, memoryUsedMB: 8192, memoryTotalMB: 16384 },
    );

    expect(snapshot.cpu).toBe(19.2);
    expect(snapshot.appMemoryMB).toBe(470.4);
    expect(snapshot.gpuCpu).toBe(3.2);
    expect(snapshot.gpuMemoryMB).toBe(60);
    expect(snapshot.services).toEqual([
      { id: 's-discord', cpu: 12.3, memoryMB: 240.4, processes: 1 },
      { id: 's-example', cpu: 1, memoryMB: 90, processes: 1 },
    ]);
    expect(snapshot.processes[0]?.serviceId).toBe('s-discord');
    // Rows are ordered by the busiest process first.
    expect(snapshot.processes[0]?.pid).toBe(11);
    expect(snapshot.processes[1]?.label).toBe('GPU process');
  });

  it('never emits negative or impossible values', () => {
    const snapshot = summarize(
      [{ pid: 1, type: 'Tab', cpu: -4, memoryMB: -10 }],
      [],
      [],
      { cpu: -5, memoryUsedMB: -1, memoryTotalMB: 0 },
    );
    expect(snapshot.cpu).toBe(0);
    expect(snapshot.memoryUsedMB).toBe(0);
    expect(snapshot.processes[0]?.cpu).toBe(0);
    expect(snapshot.processes[0]?.memoryMB).toBe(0);
  });
});

describe('CPU sampling', () => {
  it('computes the busy share between two counter samples', () => {
    const first = cpuTimes([{ times: { user: 10, nice: 0, sys: 10, idle: 80, irq: 0 } }]);
    const second = cpuTimes([{ times: { user: 30, nice: 0, sys: 20, idle: 150, irq: 0 } }]);
    expect(cpuPercent(first, second)).toBeCloseTo(30, 1);
  });

  it('reports zero when the counters did not move', () => {
    const sample = cpuTimes([{ times: { user: 1, nice: 0, sys: 1, idle: 1, irq: 0 } }]);
    expect(cpuPercent(sample, sample)).toBe(0);
  });
});
