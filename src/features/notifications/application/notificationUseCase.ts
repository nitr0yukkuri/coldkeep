import { HydrationState } from '../../hydration/domain/hydration';
import { buildNotificationPlan } from '../domain/notificationPolicy';
import { NotificationScheduler } from './notificationPorts';

export class NotificationUseCase {
  private permission: boolean | null = null;
  private permissionOperation: Promise<boolean> | null = null;

  constructor(private readonly scheduler: NotificationScheduler) {}

  async syncHydration(
    state: HydrationState,
    now = new Date(),
  ): Promise<boolean> {
    const allowed = await this.ensurePermission();
    if (!allowed) {
      return false;
    }
    await this.scheduler.sync(buildNotificationPlan(state, now));
    return true;
  }

  private async ensurePermission(): Promise<boolean> {
    if (this.permission !== null) {
      return this.permission;
    }
    if (!this.permissionOperation) {
      this.permissionOperation = this.scheduler
        .requestPermission()
        .then(value => {
          this.permission = value;
          return value;
        })
        .finally(() => {
          this.permissionOperation = null;
        });
    }
    return this.permissionOperation;
  }
}
