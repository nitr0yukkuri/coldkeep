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

  constructor(private readonly repository: HydrationRepository) {}

  async load(): Promise<HydrationState> {
    this.state = normalizeHydrationState(await this.repository.load());
    return this.state;
  }

  async updateProfile(profile: HydrationProfile): Promise<HydrationState> {
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
  }

  async addManualIntake(amountMl: number): Promise<HydrationState> {
    const next = addManualIntake(await this.currentState(), amountMl);
    return this.persist(next);
  }

  async recordObservation(
    measurement: HydrationMeasurement,
  ): Promise<HydrationObservationResult> {
    const result = recordObservation(await this.currentState(), measurement);
    await this.persist(result.state);
    return result;
  }

  async addEstimatedIntake(
    amountMl: number,
    confidence: number | null,
  ): Promise<HydrationState> {
    const next = addAcousticIntake(
      await this.currentState(),
      amountMl,
      confidence,
    );
    return this.persist(next);
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
}
