import {
  addAcousticIntake,
  addManualIntake,
  createDefaultHydrationState,
  recordObservation,
  reliableObservationDeltaMl,
  todayIntakeMl,
} from '../src/features/hydration/domain/hydration';
import { HydrationUseCase } from '../src/features/hydration/application/hydrationUseCase';
import { HydrationRepository } from '../src/features/shared/application/ports';
import type { HydrationState } from '../src/features/hydration/domain/hydration';
import { readTextWithRecovery } from '../src/platform/storage/atomicTextFile';

const morning = new Date('2026-08-14T09:00:00+09:00');

test('manual intake is added to the local-day hydration total', () => {
  let state = createDefaultHydrationState();
  state = addManualIntake(state, 250, morning);
  state = addManualIntake(state, 500, new Date('2026-08-14T12:00:00+09:00'));

  expect(todayIntakeMl(state, morning)).toBe(750);
});

test('acoustic observations expose a decrease as an explicit estimate', () => {
  let state = createDefaultHydrationState();
  const first = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.9 },
    morning,
  );
  state = first.state;
  const second = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.8 },
    new Date('2026-08-14T12:00:00+09:00'),
  );

  expect(first.estimatedConsumedMl).toBeNull();
  expect(second.estimatedConsumedMl).toBe(200);
  expect(second.state.intakes).toHaveLength(0);
});

test('refill or noisy increase does not become consumed volume', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.8 },
    morning,
  ).state;
  const result = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.8 },
    new Date('2026-08-14T12:00:00+09:00'),
  );

  expect(result.estimatedConsumedMl).toBeNull();
});

test('low-confidence observations never become a consumed-volume estimate', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.9 },
    morning,
  ).state;
  const result = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.6 },
    new Date('2026-08-14T12:00:00+09:00'),
  );

  expect(result.estimatedConsumedMl).toBeNull();
});

test('missing confidence never becomes a consumed-volume estimate', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.9 },
    morning,
  ).state;
  const result = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: null },
    new Date('2026-08-14T12:00:00+09:00'),
  );

  expect(result.estimatedConsumedMl).toBeNull();
});

test('low-confidence acoustic intake cannot be accepted directly', () => {
  const state = createDefaultHydrationState();

  expect(() => addAcousticIntake(state, 200, 0.64)).toThrow(
    'Estimated intake requires model confidence',
  );
  expect(() => addAcousticIntake(state, 200, null)).toThrow(
    'Estimated intake requires model confidence',
  );
});

test('an observation from a previous local day is not treated as intake', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.8 },
    morning,
  ).state;
  const result = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.8 },
    // Keep the instants on different calendar days in both UTC and JST CI hosts.
    new Date('2026-08-15T20:00:00+09:00'),
  );

  expect(result.estimatedConsumedMl).toBeNull();
});

test('unreliable previous observations do not expose a residual delta', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.4 },
    morning,
  ).state;
  state = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.9 },
    new Date('2026-08-14T12:00:00+09:00'),
  ).state;

  expect(reliableObservationDeltaMl(state)).toBeNull();
});

test('same-day reliable observations expose their residual delta', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.8 },
    morning,
  ).state;
  state = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.9 },
    new Date('2026-08-14T12:00:00+09:00'),
  ).state;

  expect(reliableObservationDeltaMl(state)).toBe(200);
});

test('hydration use case persists profile and manual intake through a port', async () => {
  let stored: HydrationState | null = null;
  const repository: HydrationRepository = {
    load: jest.fn(async () => stored),
    save: jest.fn(async state => {
      stored = state;
    }),
  };
  const useCase = new HydrationUseCase(repository);

  await useCase.updateProfile({ capacityMl: 750, dailyGoalMl: 2_000 });
  const state = await useCase.addManualIntake(300);

  expect(state.profile).toEqual({ capacityMl: 750, dailyGoalMl: 2_000 });
  expect(state.intakes[0].amountMl).toBe(300);
  expect(repository.save).toHaveBeenCalledTimes(2);
});

test('changing bottle capacity starts a fresh acoustic comparison series', async () => {
  let stored: HydrationState | null = null;
  const repository: HydrationRepository = {
    load: jest.fn(async () => stored),
    save: jest.fn(async state => {
      stored = state;
    }),
  };
  const useCase = new HydrationUseCase(repository);

  await useCase.recordObservation({
    remainingMl: 450,
    fillLevel: 90,
    confidence: 0.9,
  });
  const state = await useCase.updateProfile({
    capacityMl: 750,
    dailyGoalMl: 2_000,
  });

  expect(state.profile.capacityMl).toBe(750);
  expect(state.observations).toHaveLength(0);
});

test('serializes concurrent hydration mutations instead of losing an intake', async () => {
  let stored: HydrationState | null = null;
  const repository: HydrationRepository = {
    load: jest.fn(async () => stored),
    save: jest.fn(
      state =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            stored = state;
            resolve();
          }, 5);
        }),
    ),
  };
  const useCase = new HydrationUseCase(repository);

  await Promise.all([
    useCase.addManualIntake(100),
    useCase.addManualIntake(200),
  ]);

  expect((await useCase.load()).intakes.map(intake => intake.amountMl)).toEqual(
    [100, 200],
  );
});

test('subtracts already logged intake from an acoustic residual estimate', () => {
  let state = createDefaultHydrationState();
  state = recordObservation(
    state,
    { remainingMl: 450, fillLevel: 90, confidence: 0.9 },
    morning,
  ).state;
  state = addManualIntake(state, 100, new Date('2026-08-14T10:00:00+09:00'));

  const result = recordObservation(
    state,
    { remainingMl: 250, fillLevel: 50, confidence: 0.9 },
    new Date('2026-08-14T12:00:00+09:00'),
  );

  expect(result.estimatedConsumedMl).toBe(100);
  expect(reliableObservationDeltaMl(result.state)).toBe(100);
});

test('recovers a completed temporary hydration write', async () => {
  const files = new Map([
    ['state.json', '{broken'],
    ['state.json.tmp', '{"ok":true}'],
  ]);
  const ops = {
    exists: async (path: string) => files.has(path),
    readFile: async (path: string) => files.get(path) ?? '',
    writeFile: async (path: string, contents: string) => {
      files.set(path, contents);
    },
    moveFile: async (from: string, to: string) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    unlink: async (path: string) => {
      files.delete(path);
    },
  };

  await expect(
    readTextWithRecovery('state.json', ops, contents => {
      try {
        JSON.parse(contents);
        return true;
      } catch {
        return false;
      }
    }),
  ).resolves.toBe('{"ok":true}');
  expect(files.get('state.json')).toBe('{"ok":true}');
});
