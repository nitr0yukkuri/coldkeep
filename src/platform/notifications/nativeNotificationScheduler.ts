import { NativeModules, Platform } from 'react-native';

import type { NotificationScheduler } from '../../features/notifications/application/notificationPorts';
import type {
  NotificationRequest,
  NotificationSchedule,
} from '../../features/notifications/domain/notificationPolicy';

type NativeNotificationRequest = {
  id: string;
  kind: NotificationRequest['kind'];
  title: string;
  body: string;
  schedule:
    | { type: 'daily'; hour: number; minute: number }
    | { type: 'once'; atEpochMs: number };
};

type NativeNotificationModule = {
  requestPermission(): Promise<boolean>;
  sync(requests: readonly NativeNotificationRequest[]): Promise<void>;
};

function toNativeSchedule(schedule: NotificationSchedule) {
  if (schedule.type === 'daily') {
    return schedule;
  }
  return { type: 'once' as const, atEpochMs: schedule.at.getTime() };
}

function toNativeRequest(request: NotificationRequest): NativeNotificationRequest {
  return {
    id: request.id,
    kind: request.kind,
    title: request.title,
    body: request.body,
    schedule: toNativeSchedule(request.schedule),
  };
}

/** Bridges the domain notification plan to the OS scheduler in native builds. */
export class NativeNotificationScheduler implements NotificationScheduler {
  private readonly native: NativeNotificationModule | null =
    Platform.OS === 'android' || Platform.OS === 'ios'
      ? (NativeModules.ColdKeepNotifications as
          | NativeNotificationModule
          | undefined) ?? null
      : null;

  async requestPermission(): Promise<boolean> {
    if (!this.native) {
      return false;
    }
    return this.native.requestPermission();
  }

  async sync(requests: readonly NotificationRequest[]): Promise<void> {
    if (!this.native) {
      return;
    }
    await this.native.sync(requests.map(toNativeRequest));
  }
}
