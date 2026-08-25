import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationScheduler } from '../../src/features/notifications/application/notificationPorts';
import type {
  NotificationRequest,
  NotificationSchedule,
} from '../../src/features/notifications/domain/notificationPolicy';

const COLDKEEP_SOURCE = 'coldkeep';
const COLDKEEP_CHANNEL = 'coldkeep-hydration';

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(COLDKEEP_CHANNEL, {
    name: '水分・暑さ対策',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: undefined,
    vibrationPattern: [0, 0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function toExpoTrigger(
  schedule: NotificationSchedule,
): Notifications.SchedulableNotificationTriggerInput {
  if (schedule.type === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: schedule.hour,
      minute: schedule.minute,
      channelId: COLDKEEP_CHANNEL,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: schedule.at,
    channelId: COLDKEEP_CHANNEL,
  };
}

function isColdKeepNotification(
  request: Notifications.NotificationRequest,
): boolean {
  return request.content.data?.source === COLDKEEP_SOURCE;
}

export class ExpoNotificationScheduler implements NotificationScheduler {
  async requestPermission(): Promise<boolean> {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    return requested.granted;
  }

  async sync(requests: readonly NotificationRequest[]): Promise<void> {
    await ensureAndroidChannel();

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter(isColdKeepNotification)
        .map(request =>
          Notifications.cancelScheduledNotificationAsync(request.identifier),
        ),
    );

    await Promise.all(
      requests.map(request =>
        Notifications.scheduleNotificationAsync({
          content: {
            title: request.title,
            body: request.body,
            sound: false,
            data: { source: COLDKEEP_SOURCE, kind: request.kind },
          },
          trigger: toExpoTrigger(request.schedule),
        }),
      ),
    );
  }
}
