import {
  addAcousticIntake,
  addManualIntake,
  HydrationMeasurement,
  HydrationObservationResult,
  HydrationProfile,
  HydrationState,
  normalizeHydrationState,
  recordObservation,
  validateHydrationProfile,
} from '../domain/hydration';
import { HydrationRepository } from '../../shared/application/ports';

export class HydrationUseCase {
  private state: HydrationState | null = null;
  private loadOperation: Promise<HydrationState> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly repository: HydrationRepository) {}

  async load(): Promise<HydrationState> {
    if (this.state) {
      return this.state;
    }
    if (!this.loadOperation) {
      this.loadOperation = this.repository
        .load()
        .then(value => {
          this.state = normalizeHydrationState(value);
          return this.state;
        })
        .finally(() => {
          this.loadOperation = null;
        });
    }
    return this.loadOperation;
  }

  async updateProfile(profile: HydrationProfile): Promise<HydrationState> {
    return this.enqueue(async () => {
      const current = await this.currentState();
      const nextProfile = validateHydrationProfile(profile);
      const next: HydrationState = {
        ...current,
        profile: nextProfile,
        // Remaining millilitres are derived from the configured bottle
        // capacity. Keeping observations after a capacity change would make a
        // later difference look like drinking or refilling, so start a fresh
        // comparison series while preserving the manual intake history.
        observations:
          nextProfile.capacityMl === current.profile.capacityMl
            ? current.observations
            : [],
      };
      return this.persist(next);
    });
  }

  async addManualIntake(amountMl: number): Promise<HydrationState> {
    return this.enqueue(async () => {
      const next = addManualIntake(await this.currentState(), amountMl);
      return this.persist(next);
    });
  }

  async recordObservation(
    measurement: HydrationMeasurement,
  ): Promise<HydrationObservationResult> {
    return this.enqueue(async () => {
      const result = recordObservation(await this.currentState(), measurement);
      await this.persist(result.state);
      return result;
    });
  }

  async addEstimatedIntake(
    amountMl: number,
    confidence: number | null,
  ): Promise<HydrationState> {
    return this.enqueue(async () => {
      const next = addAcousticIntake(
        await this.currentState(),
        amountMl,
        confidence,
      );
      return this.persist(next);
    });
  }

  private async currentState(): Promise<HydrationState> {
    if (!this.state) {
      await this.load();
    }
    return this.state!;
  }

  private async persist(next: HydrationState): Promise<HydrationState> {
    await this.repository.save(next);
    this.state = next;
    return next;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(operation, operation);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
