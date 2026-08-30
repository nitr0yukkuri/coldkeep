import { NativeModules } from 'react-native';

import { NativeNotificationScheduler } from '../src/platform/notifications/nativeNotificationScheduler';

test('serializes domain notification dates for the native scheduler', async () => {
  const previous = NativeModules.ColdKeepNotifications;
  const native = {
    requestPermission: jest.fn(async () => true),
    sync: jest.fn(async () => undefined),
  };
  NativeModules.ColdKeepNotifications = native;

  try {
    const scheduler = new NativeNotificationScheduler();
    const at = new Date('2026-08-27T12:34:56.000Z');
    await expect(
      scheduler.sync([
        {
          id: 'coldkeep-hydration-reminder',
          kind: 'hydration_reminder',
          title: '水分補給のタイミングです',
          body: '少しずつ飲みましょう。',
          schedule: { type: 'once', at },
        },
      ]),
    ).resolves.toBeUndefined();

    expect(native.sync).toHaveBeenCalledWith([
      {
        id: 'coldkeep-hydration-reminder',
        kind: 'hydration_reminder',
        title: '水分補給のタイミングです',
        body: '少しずつ飲みましょう。',
        schedule: { type: 'once', atEpochMs: at.getTime() },
      },
    ]);
  } finally {
    NativeModules.ColdKeepNotifications = previous;
  }
});
