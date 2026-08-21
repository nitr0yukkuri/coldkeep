export type HydrationEventSource = 'manual' | 'acoustic';

export type HydrationProfile = {
  capacityMl: number;
  dailyGoalMl: number;
};

export type HydrationObservation = {
  observationId: string;
  recordedAt: string;
  remainingMl: number;
  fillLevel: 0 | 50 | 90 | 100;
  confidence: number | null;
  source: 'acoustic';
};

export type HydrationIntake = {
  intakeId: string;
  recordedAt: string;
  amountMl: number;
  source: HydrationEventSource;
  confidence: number | null;
};

export type HydrationState = {
  profile: HydrationProfile;
  observations: HydrationObservation[];
  intakes: HydrationIntake[];
};

export type HydrationMeasurement = {
  remainingMl: number;
  fillLevel: 0 | 50 | 90 | 100;
  confidence: number | null;
};

export type HydrationObservationResult = {
  state: HydrationState;
  estimatedConsumedMl: number | null;
  observation: HydrationObservation;
};

export const DEFAULT_HYDRATION_PROFILE: HydrationProfile = {
  capacityMl: 500,
  dailyGoalMl: 1_500,
};

/** Below this uncalibrated model probability, never infer a consumed volume. */
export const MIN_ACOUSTIC_CONFIDENCE = 0.65;

export function createDefaultHydrationState(): HydrationState {
  return {
    profile: { ...DEFAULT_HYDRATION_PROFILE },
    observations: [],
    intakes: [],
  };
}

export function validateHydrationProfile(
  profile: HydrationProfile,
): HydrationProfile {
  if (
    !Number.isFinite(profile.capacityMl) ||
    profile.capacityMl < 100 ||
    profile.capacityMl > 10_000
  ) {
    throw new Error('Bottle capacity must be between 100 and 10000 mL');
  }
  if (
    !Number.isFinite(profile.dailyGoalMl) ||
    profile.dailyGoalMl < 100 ||
    profile.dailyGoalMl > 20_000
  ) {
    throw new Error('Daily hydration goal must be between 100 and 20000 mL');
  }
  return {
    capacityMl: Math.round(profile.capacityMl),
    dailyGoalMl: Math.round(profile.dailyGoalMl),
  };
}

function eventId(prefix: string, recordedAt: Date, sequence: number): string {
  return `${prefix}-${recordedAt.getTime()}-${sequence}`;
}

function sameLocalDay(left: string, right: Date): boolean {
  const date = new Date(left);
  return (
    date.getFullYear() === right.getFullYear() &&
    date.getMonth() === right.getMonth() &&
    date.getDate() === right.getDate()
  );
}

function loggedIntakeBetween(
  state: HydrationState,
  previousRecordedAt: string,
  currentRecordedAt: Date,
): number {
  const previousTime = Date.parse(previousRecordedAt);
  return state.intakes
    .filter(intake => {
      const intakeTime = Date.parse(intake.recordedAt);
      return (
        intakeTime > previousTime &&
        intakeTime <= currentRecordedAt.getTime() &&
        sameLocalDay(intake.recordedAt, currentRecordedAt)
      );
    })
    .reduce((total, intake) => total + intake.amountMl, 0);
}

export function todayIntakeMl(state: HydrationState, now = new Date()): number {
  return state.intakes
    .filter(intake => sameLocalDay(intake.recordedAt, now))
    .reduce((total, intake) => total + intake.amountMl, 0);
}

export function latestObservation(
  state: HydrationState,
): HydrationObservation | null {
  return state.observations[state.observations.length - 1] ?? null;
}

/**
 * Return a same-day residual change only when both observations meet the
 * confidence gate. The UI may show this value as a comparison, but it must
 * never present an untrusted low-confidence change as a drinking estimate.
 */
export function reliableObservationDeltaMl(
  state: HydrationState,
): number | null {
  const current = latestObservation(state);
  const previous =
    state.observations.length > 1
      ? state.observations[state.observations.length - 2]
      : null;
  if (!current || !previous) {
    return null;
  }
  const currentReliable =
    current.confidence !== null &&
    current.confidence >= MIN_ACOUSTIC_CONFIDENCE;
  const previousReliable =
    previous.confidence !== null &&
    previous.confidence >= MIN_ACOUSTIC_CONFIDENCE;
  if (!currentReliable || !previousReliable) {
    return null;
  }
  if (!sameLocalDay(previous.recordedAt, new Date(current.recordedAt))) {
    return null;
  }
  return (
    previous.remainingMl -
    current.remainingMl -
    loggedIntakeBetween(
      state,
      previous.recordedAt,
      new Date(current.recordedAt),
    )
  );
}

export function addManualIntake(
  state: HydrationState,
  amountMl: number,
  recordedAt = new Date(),
): HydrationState {
  if (!Number.isFinite(amountMl) || amountMl < 10 || amountMl > 5_000) {
    throw new Error('Intake amount must be between 10 and 5000 mL');
  }
  const intake: HydrationIntake = {
    intakeId: eventId('manual', recordedAt, state.intakes.length),
    recordedAt: recordedAt.toISOString(),
    amountMl: Math.round(amountMl),
    source: 'manual',
    confidence: 1,
  };
  return { ...state, intakes: [...state.intakes, intake] };
}

export function addAcousticIntake(
  state: HydrationState,
  amountMl: number,
  confidence: number | null,
  recordedAt = new Date(),
): HydrationState {
  if (
    confidence === null ||
    !Number.isFinite(confidence) ||
    confidence < MIN_ACOUSTIC_CONFIDENCE
  ) {
    throw new Error(
      `Estimated intake requires model confidence of at least ${MIN_ACOUSTIC_CONFIDENCE}`,
    );
  }
  if (
    !Number.isFinite(amountMl) ||
    amountMl < 10 ||
    amountMl > state.profile.capacityMl
  ) {
    throw new Error('Estimated intake is outside the bottle capacity');
  }
  const intake: HydrationIntake = {
    intakeId: eventId('acoustic', recordedAt, state.intakes.length),
    recordedAt: recordedAt.toISOString(),
    amountMl: Math.round(amountMl),
    source: 'acoustic',
    confidence: Math.min(1, Math.max(0, confidence)),
  };
  return { ...state, intakes: [...state.intakes, intake] };
}

export function recordObservation(
  state: HydrationState,
  measurement: HydrationMeasurement,
  recordedAt = new Date(),
): HydrationObservationResult {
  const remainingMl = Math.min(
    state.profile.capacityMl,
    Math.max(0, Math.round(measurement.remainingMl)),
  );
  const observation: HydrationObservation = {
    observationId: eventId(
      'observation',
      recordedAt,
      state.observations.length,
    ),
    recordedAt: recordedAt.toISOString(),
    remainingMl,
    fillLevel: measurement.fillLevel,
    confidence:
      measurement.confidence === null
        ? null
        : Math.min(1, Math.max(0, measurement.confidence)),
    source: 'acoustic',
  };
  const previous = latestObservation(state);
  const reliable =
    observation.confidence !== null &&
    observation.confidence >= MIN_ACOUSTIC_CONFIDENCE;
  const previousReliable =
    previous?.confidence !== null &&
    previous?.confidence !== undefined &&
    previous.confidence >= MIN_ACOUSTIC_CONFIDENCE;
  const delta =
    reliable &&
    previous &&
    previousReliable &&
    sameLocalDay(previous.recordedAt, recordedAt)
      ? previous.remainingMl - remainingMl
      : null;
  const estimatedConsumedMl =
    delta !== null
      ? Math.round(
          delta -
            loggedIntakeBetween(state, previous?.recordedAt ?? '', recordedAt),
        )
      : null;
  const boundedEstimate =
    estimatedConsumedMl !== null &&
    estimatedConsumedMl >= 10 &&
    estimatedConsumedMl <= state.profile.capacityMl
      ? estimatedConsumedMl
      : null;
  return {
    state: {
      ...state,
      observations: [...state.observations, observation],
    },
    estimatedConsumedMl: boundedEstimate,
    observation,
  };
}

export function normalizeHydrationState(value: unknown): HydrationState {
  const fallback = createDefaultHydrationState();
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const candidate = value as Partial<HydrationState>;
  const profile = candidate.profile;
  const normalizedProfile = validateHydrationProfile({
    capacityMl: Number(profile?.capacityMl),
    dailyGoalMl: Number(profile?.dailyGoalMl),
  });
  const observations = Array.isArray(candidate.observations)
    ? candidate.observations.filter(observationValue =>
        isHydrationObservation(observationValue, normalizedProfile.capacityMl),
      )
    : [];
  const intakes = Array.isArray(candidate.intakes)
    ? candidate.intakes.filter(isHydrationIntake)
    : [];
  return { profile: normalizedProfile, observations, intakes };
}

function isHydrationObservation(
  value: unknown,
  capacityMl: number,
): value is HydrationObservation {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HydrationObservation>;
  const remainingMl = candidate.remainingMl;
  const confidence = candidate.confidence;
  return (
    typeof candidate.observationId === 'string' &&
    typeof candidate.recordedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.recordedAt)) &&
    typeof remainingMl === 'number' &&
    Number.isFinite(remainingMl) &&
    remainingMl >= 0 &&
    remainingMl <= capacityMl &&
    (candidate.fillLevel === 0 ||
      candidate.fillLevel === 50 ||
      candidate.fillLevel === 90 ||
      candidate.fillLevel === 100) &&
    (confidence === null ||
      (typeof confidence === 'number' &&
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1)) &&
    candidate.source === 'acoustic'
  );
}

function isHydrationIntake(value: unknown): value is HydrationIntake {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HydrationIntake>;
  const amountMl = candidate.amountMl;
  const confidence = candidate.confidence;
  return (
    typeof candidate.intakeId === 'string' &&
    typeof candidate.recordedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.recordedAt)) &&
    typeof amountMl === 'number' &&
    Number.isFinite(amountMl) &&
    amountMl >= 10 &&
    amountMl <= 5_000 &&
    (candidate.source === 'manual' || candidate.source === 'acoustic') &&
    (confidence === null ||
      (typeof confidence === 'number' &&
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1))
  );
}
