import {
  buildNotificationPlan,
  DAILY_BRIEF_HOUR,
  DAILY_BRIEF_MINUTE,
  HYDRATION_REMINDER_DELAY_MINUTES,
} from '../src/features/notifications/domain/notificationPolicy';
import { createDefaultHydrationState } from '../src/features/hydration/domain/hydration';

function stateWithIntake(
  recordedAt: Date,
  amountMl = 250,
  confidence: number | null = 1,
) {
  const state = createDefaultHydrationState();
  return {
    ...state,
    intakes: [
      {
        intakeId: 'intake-test',
        recordedAt: recordedAt.toISOString(),
        amountMl,
        source: 'acoustic' as const,
        confidence,
      },
    ],
  };
}

test('always schedules one quiet morning preparation notification', () => {
  const now = new Date(2026, 7, 25, 10, 0, 0);
  const plan = buildNotificationPlan(createDefaultHydrationState(), now);

  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    id: 'coldkeep-daily-brief',
    kind: 'daily_brief',
    schedule: {
      type: 'daily',
      hour: DAILY_BRIEF_HOUR,
      minute: DAILY_BRIEF_MINUTE,
    },
  });
});

test('does not infer a daytime reminder without a reliable current-day intake', () => {
  const now = new Date(2026, 7, 25, 10, 0, 0);
  const yesterday = new Date(2026, 7, 24, 8, 0, 0);
  const lowConfidence = stateWithIntake(now, 250, 0.4);

  expect(buildNotificationPlan(stateWithIntake(yesterday), now)).toHaveLength(
    1,
  );
  expect(buildNotificationPlan(lowConfidence, now)).toHaveLength(1);
});

test('schedules at most one daytime reminder after a reliable intake', () => {
  const now = new Date(2026, 7, 25, 10, 0, 0);
  const intakeAt = new Date(2026, 7, 25, 8, 0, 0);
  const plan = buildNotificationPlan(stateWithIntake(intakeAt), now);
  const reminder = plan.find(item => item.kind === 'hydration_reminder');

  expect(reminder).toBeDefined();
  expect(reminder?.schedule).toEqual({
    type: 'once',
    at: new Date(now.getTime() + HYDRATION_REMINDER_DELAY_MINUTES * 60_000),
  });
  expect(plan.filter(item => item.kind === 'hydration_reminder')).toHaveLength(
    1,
  );
});

test('does not schedule a reminder after the daily goal is reached', () => {
  const now = new Date(2026, 7, 25, 10, 0, 0);
  const state = stateWithIntake(new Date(2026, 7, 25, 8, 0, 0), 1_500);

  expect(buildNotificationPlan(state, now)).toHaveLength(1);
});

test('moves a late reminder to the next active morning', () => {
  const now = new Date(2026, 7, 25, 20, 0, 0);
  const intakeAt = new Date(2026, 7, 25, 20, 0, 0);
  const plan = buildNotificationPlan(stateWithIntake(intakeAt), now);
  const reminder = plan.find(item => item.kind === 'hydration_reminder');

  expect(reminder?.schedule).toEqual({
    type: 'once',
    at: new Date(2026, 7, 26, 7, 0, 0),
  });
});
