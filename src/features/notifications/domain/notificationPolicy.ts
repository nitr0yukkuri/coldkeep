import {
  HydrationState,
  HydrationIntake,
  MIN_ACOUSTIC_CONFIDENCE,
  todayIntakeMl,
} from '../../hydration/domain/hydration';

export const DAILY_BRIEF_HOUR = 8;
export const DAILY_BRIEF_MINUTE = 0;
export const HYDRATION_REMINDER_DELAY_MINUTES = 120;
export const ACTIVE_DAY_START_HOUR = 7;
export const ACTIVE_DAY_END_HOUR = 21;

export type NotificationKind = 'daily_brief' | 'hydration_reminder';

export type NotificationSchedule =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'once'; at: Date };

export type NotificationRequest = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  schedule: NotificationSchedule;
};

function sameLocalDay(left: string, right: Date): boolean {
  const date = new Date(left);
  return (
    Number.isFinite(date.getTime()) &&
    date.getFullYear() === right.getFullYear() &&
    date.getMonth() === right.getMonth() &&
    date.getDate() === right.getDate()
  );
}
function isReliableIntake(intake: HydrationIntake): boolean {
  return (
    intake.source === 'manual' ||
    (intake.confidence !== null && intake.confidence >= MIN_ACOUSTIC_CONFIDENCE)
  );
}

function latestReliableIntake(state: HydrationState): HydrationIntake | null {
  for (let index = state.intakes.length - 1; index >= 0; index -= 1) {
    const intake = state.intakes[index];
    if (isReliableIntake(intake)) {
      return intake;
    }
  }
  return null;
}

function nextActiveTime(date: Date): Date {
  const next = new Date(date);
  if (next.getHours() < ACTIVE_DAY_START_HOUR) {
    next.setHours(ACTIVE_DAY_START_HOUR, 0, 0, 0);
    return next;
  }
  if (next.getHours() >= ACTIVE_DAY_END_HOUR) {
    next.setDate(next.getDate() + 1);
    next.setHours(ACTIVE_DAY_START_HOUR, 0, 0, 0);
  }
  return next;
}

function hydrationReminderTime(
  latestIntake: HydrationIntake,
  now: Date,
): Date | null {
  const recordedAt = new Date(latestIntake.recordedAt);
  if (
    !Number.isFinite(recordedAt.getTime()) ||
    !sameLocalDay(latestIntake.recordedAt, now)
  ) {
    return null;
  }

  const scheduled = new Date(
    Math.max(
      recordedAt.getTime() + HYDRATION_REMINDER_DELAY_MINUTES * 60_000,
      now.getTime() + HYDRATION_REMINDER_DELAY_MINUTES * 60_000,
    ),
  );
  return nextActiveTime(scheduled);
}

/**
 * Build the small, action-oriented notification set used by ColdKeep.
 *
 * The policy deliberately does not infer a missing intake from an untrained
 * acoustic model. A daytime reminder is scheduled only after a reliable
 * intake event exists for the current local day.
 */
export function buildNotificationPlan(
  state: HydrationState,
  now = new Date(),
): NotificationRequest[] {
  const requests: NotificationRequest[] = [
    {
      id: 'coldkeep-daily-brief',
      kind: 'daily_brief',
      title: '今日の水分準備',
      body: '暑さと水筒の状態を確認して、外出前に水分を準備しましょう。',
      schedule: {
        type: 'daily',
        hour: DAILY_BRIEF_HOUR,
        minute: DAILY_BRIEF_MINUTE,
      },
    },
  ];

  const latestIntake = latestReliableIntake(state);
  const reminderAt = latestIntake
    ? hydrationReminderTime(latestIntake, now)
    : null;
  if (reminderAt && todayIntakeMl(state, now) < state.profile.dailyGoalMl) {
    requests.push({
      id: 'coldkeep-hydration-reminder',
      kind: 'hydration_reminder',
      title: '水分補給のタイミングです',
      body: '無理せず少しずつ飲み、暑いときは休憩して涼しい場所へ移りましょう。',
      schedule: { type: 'once', at: reminderAt },
    });
  }

  return requests;
}
