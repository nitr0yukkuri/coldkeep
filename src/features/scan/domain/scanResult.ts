import {
  ICE_AMOUNT_CONFIDENCE_THRESHOLD,
  type IceAmountClass,
} from './iceAmount';

export type InferenceEngine = 'typescript' | 'rust';
export type ScanAction = 'pour' | 'shake';
export type ScanMeasurementStatus = 'trained' | 'experimental' | 'untrained';

export type ScanResult = {
  containsWater: boolean;
  waterConfidence: number;
  /** Pour models use 50/90; shake models use 0/50/100. */
  fillLevel: 0 | 50 | 90 | 100 | null;
  fillConfidence: number | null;
  /** Which physical action the returned model was trained for. */
  measurementAction?: ScanAction;
  /** Whether the action-specific model is deployable for user-facing math. */
  measurementStatus?: ScanMeasurementStatus;
  icePresence: boolean | null;
  iceConfidence: number | null;
  iceStatus: 'untrained' | 'trained';
  /** Coarse shake-ice output; never an exact cube count. */
  iceAmount: IceAmountClass | null;
  iceAmountConfidence: number | null;
  iceAmountStatus: ScanMeasurementStatus;
  engine: InferenceEngine;
};

/**
 * The public baseline is not calibrated enough to turn every softmax output
 * into a user-facing claim. Keep the threshold explicit at the boundary so
 * low-confidence scans can be shown as `未判定` and never feed hydration math.
 */
export const MIN_SCAN_CONFIDENCE = 0.65;
export const MIN_ICE_CONFIDENCE = 0.65;

export function unknownScanResult(
  engine: InferenceEngine = 'typescript',
): ScanResult {
  return {
    containsWater: false,
    waterConfidence: 0,
    fillLevel: null,
    fillConfidence: null,
    measurementAction: 'pour',
    measurementStatus: 'untrained',
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained',
    iceAmount: null,
    iceAmountConfidence: null,
    iceAmountStatus: 'untrained',
    engine,
  };
}

function clampConfidence(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Enforces the public result contract at the application boundary.
 * A classifier is not allowed to expose a fill level when it predicts no water.
 */
export function normalizeScanResult(result: ScanResult): ScanResult {
  const waterConfidence = clampConfidence(result.waterConfidence) ?? 0;
  const fillLevel = result.containsWater ? result.fillLevel : null;
  const fillConfidence = result.containsWater
    ? clampConfidence(result.fillConfidence)
    : null;
  const candidateIceConfidence =
    result.icePresence === null ? null : clampConfidence(result.iceConfidence);
  const iceIsReliable =
    result.iceStatus === 'trained' &&
    result.icePresence !== null &&
    candidateIceConfidence !== null &&
    candidateIceConfidence >= MIN_ICE_CONFIDENCE;
  const candidateIceAmountConfidence = clampConfidence(
    result.iceAmountConfidence,
  );
  const iceAmountIsReliable =
    result.iceAmountStatus === 'trained' &&
    result.iceAmount !== null &&
    candidateIceAmountConfidence !== null &&
    candidateIceAmountConfidence >= ICE_AMOUNT_CONFIDENCE_THRESHOLD;

  return {
    ...result,
    waterConfidence,
    fillLevel,
    fillConfidence,
    icePresence: iceIsReliable ? result.icePresence : null,
    iceConfidence: iceIsReliable ? candidateIceConfidence : null,
    iceAmount: iceAmountIsReliable ? result.iceAmount : null,
    iceAmountConfidence: iceAmountIsReliable
      ? candidateIceAmountConfidence
      : null,
    iceAmountStatus: result.iceAmountStatus,
  };
}
