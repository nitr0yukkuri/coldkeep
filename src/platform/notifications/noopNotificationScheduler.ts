import { NotificationScheduler } from '../../features/notifications/application/notificationPorts';
import { NotificationRequest } from '../../features/notifications/domain/notificationPolicy';

/** Native builds keep the notification port available until an OS adapter is configured. */
export class NoopNotificationScheduler implements NotificationScheduler {
  async requestPermission(): Promise<boolean> {
    return false;
  }

  async sync(_requests: readonly NotificationRequest[]): Promise<void> {
    return undefined;
  }
}
