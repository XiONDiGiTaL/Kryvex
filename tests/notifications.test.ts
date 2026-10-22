import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_APP_ID,
  NOTIFICATION_APP_ID,
  notificationAppId,
} from '../electron/notification-rules';

describe('notification identity', () => {
  it('uses the installer identity for packaged builds', () => {
    expect(notificationAppId(true)).toBe(NOTIFICATION_APP_ID);
  });

  it('keeps a source run away from the installed shortcut identity', () => {
    expect(notificationAppId(false)).toBe(DEVELOPMENT_APP_ID);
    expect(DEVELOPMENT_APP_ID).not.toBe(NOTIFICATION_APP_ID);
    expect(DEVELOPMENT_APP_ID.startsWith(`${NOTIFICATION_APP_ID}.`)).toBe(true);
  });
});
