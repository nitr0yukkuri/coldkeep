import { NotificationRequest } from '../domain/notificationPolicy';

export interface NotificationScheduler {
  requestPermission(): Promise<boolean>;
  sync(requests: readonly NotificationRequest[]): Promise<void>;
}
