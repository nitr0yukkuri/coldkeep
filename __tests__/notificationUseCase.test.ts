import { NotificationUseCase } from '../src/features/notifications/application/notificationUseCase';
import { NotificationScheduler } from '../src/features/notifications/application/notificationPorts';
import { createDefaultHydrationState } from '../src/features/hydration/domain/hydration';

test('requests permission once and synchronizes the planned notifications', async () => {
  const scheduler: NotificationScheduler = {
    requestPermission: jest.fn(async () => true),
    sync: jest.fn(async () => undefined),
  };
  const useCase = new NotificationUseCase(scheduler);
  const now = new Date(2026, 7, 25, 10, 0, 0);

  await expect(
    useCase.syncHydration(createDefaultHydrationState(), now),
  ).resolves.toBe(true);
  await expect(
    useCase.syncHydration(createDefaultHydrationState(), now),
  ).resolves.toBe(true);

  expect(scheduler.requestPermission).toHaveBeenCalledTimes(1);
  expect(scheduler.sync).toHaveBeenCalledTimes(2);
  expect(scheduler.sync).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ id: 'coldkeep-daily-brief' }),
    ]),
  );
});

test('does not schedule notifications when permission is denied', async () => {
  const scheduler: NotificationScheduler = {
    requestPermission: jest.fn(async () => false),
    sync: jest.fn(async () => undefined),
  };
  const useCase = new NotificationUseCase(scheduler);

  await expect(
    useCase.syncHydration(createDefaultHydrationState()),
  ).resolves.toBe(false);
  expect(scheduler.sync).not.toHaveBeenCalled();
});
