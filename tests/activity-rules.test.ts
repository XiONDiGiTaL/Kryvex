import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LIMIT,
  activityServices,
  clearActivity,
  markActivityRead,
  recordActivity,
  sanitizeActivity,
  unreadCount,
} from '../electron/activity-rules';

const at = 1_760_000_000_000;

function entry(overrides: Partial<Parameters<typeof recordActivity>[1]> = {}) {
  return {
    serviceId: 'svc-mail',
    serviceName: 'Mail',
    host: 'mail.example.com',
    title: 'New message',
    body: 'Ada wrote to you.',
    at,
    ...overrides,
  };
}

describe('recording an activity entry', () => {
  it('puts the newest first and leaves it unread', () => {
    const log = recordActivity([], entry());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      serviceId: 'svc-mail',
      serviceName: 'Mail',
      host: 'mail.example.com',
      title: 'New message',
      read: false,
      at,
    });
    expect(log[0]?.id).toBeTruthy();
  });

  it('keeps the modules apart', () => {
    const log = recordActivity(recordActivity([], entry()), entry({ serviceId: 'svc-chat', title: 'Hi' }));
    expect(log.map(item => item.title)).toEqual(['Hi', 'New message']);
    expect(unreadCount(log)).toBe(2);
  });

  it('treats the same page repeating itself as one event', () => {
    const first = recordActivity([], entry());
    const again = recordActivity(first, entry({ at: at + 5_000 }));
    expect(again).toHaveLength(1);
    expect(again[0]?.at).toBe(at + 5_000);
    expect(again[0]?.id).toBe(first[0]?.id);
  });

  it('does not merge the same words after the repeat window', () => {
    const first = recordActivity([], entry());
    const later = recordActivity(first, entry({ at: at + 120_000 }));
    expect(later).toHaveLength(2);
  });

  it('drops a record that cannot name its module or its subject', () => {
    expect(recordActivity([], entry({ serviceId: '' }))).toEqual([]);
    expect(recordActivity([], entry({ title: '   ' }))).toEqual([]);
  });

  it('caps the log so a page cannot grow the profile', () => {
    let log = recordActivity([], entry());
    for (let index = 0; index < ACTIVITY_LIMIT + 5; index += 1) {
      log = recordActivity(log, entry({ title: `Message ${index}`, at: at + index }));
    }
    expect(log).toHaveLength(ACTIVITY_LIMIT);
    expect(log[0]?.title).toBe(`Message ${ACTIVITY_LIMIT + 4}`);
  });

  it('clips what the page wrote', () => {
    const log = recordActivity([], entry({ title: 'x'.repeat(400), body: 'y'.repeat(900) }));
    expect(log[0]?.title.length).toBe(160);
    expect(log[0]?.body.length).toBe(400);
  });
});

describe('reading and clearing', () => {
  const log = [
    { ...recordActivity([], entry())[0]!, serviceId: 'svc-mail' },
    { ...recordActivity([], entry({ serviceId: 'svc-chat', title: 'Hi', at: at + 1000 }))[0]! },
  ];

  it('counts what is still unread', () => {
    expect(unreadCount(log)).toBe(2);
    expect(unreadCount(markActivityRead(log, log[0]!.id))).toBe(1);
    expect(unreadCount(markActivityRead(log))).toBe(0);
  });

  it('clears one module without touching the others', () => {
    expect(clearActivity(log, 'svc-mail').map(item => item.serviceId)).toEqual(['svc-chat']);
    expect(clearActivity(log)).toEqual([]);
  });

  it('lists the modules that raised something, newest first', () => {
    expect(activityServices(log)).toEqual([
      { id: 'svc-mail', name: 'Mail', unread: 1 },
      { id: 'svc-chat', name: 'Mail', unread: 1 },
    ]);
  });
});

describe('sanitising a stored log', () => {
  it('drops rows that are not entries', () => {
    expect(sanitizeActivity(null)).toEqual([]);
    expect(sanitizeActivity([1, 'x', null, {}])).toEqual([]);
    expect(
      sanitizeActivity([{ id: 'a', serviceId: 'svc-mail', title: '  ' }]),
    ).toEqual([]);
  });

  it('repairs what a hand-edited profile could hold', () => {
    const [kept] = sanitizeActivity([
      {
        id: 'a',
        serviceId: 'svc-mail',
        serviceName: '',
        title: '  Hello  ',
        body: 42,
        at: 'yesterday',
        read: 'yes',
        extra: 'ignored',
      },
    ]);
    expect(kept).toMatchObject({
      id: 'a',
      serviceName: 'svc-mail',
      title: 'Hello',
      body: '',
      at: 0,
      read: false,
    });
  });

  it('does not keep the same id twice, and stays inside the cap', () => {
    const many = Array.from({ length: ACTIVITY_LIMIT + 10 }, (_, index) => ({
      id: `id-${index % 5}`,
      serviceId: 'svc-mail',
      title: `Note ${index}`,
    }));
    const clean = sanitizeActivity(many);
    expect(clean).toHaveLength(5);
    expect(clean.map(item => item.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4']);
  });
});
