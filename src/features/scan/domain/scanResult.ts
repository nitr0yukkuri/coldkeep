import {
  ICE_AMOUNT_CONFIDENCE_THRESHOLD,
  ICE_AMOUNT_CLASSES,
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
  measurementAction: ScanAction;
  /** Whether the action-specific model is deployable for user-facing math. */
  measurementStatus: ScanMeasurementStatus;
  icePresence: boolean | null;
  iceConfidence: number | null;
  iceStatus: 'untrained' | 'trained';
  /** Coarse shake-ice output; never an exact cube count. */
  iceAmount: IceAmountClass | null;
  iceAmountConfidence: number | null;
  iceAmountStatus: ScanMeasurementStatus;
  engine: InferenceEngine;
};

/** Raw classifier payload accepted at the application boundary. Native
 * bridges and older model artifacts may omit the action/status fields; the
 * boundary fills those fields conservatively and never treats them as
 * deployable by default. */
export type ScanResultInput = Partial<ScanResult>;

export type ScanResultNormalizationOptions = {
  /**
   * Research-only opt-in.  Experimental ice values stay hidden by default so
   * an unvalidated artifact cannot become a normal product claim.
   */
  allowExperimentalIceAmount?: boolean;
};

/**
 * The public baseline is not calibrated enough to turn every softmax output
 * into a user-facing claim. Keep the threshold explicit at the boundary so
 * low-confidence scans can be shown as `未判定` and never feed hydration math.
 */
export const MIN_SCAN_CONFIDENCE = 0.65;
export const MIN_ICE_CONFIDENCE = 0.65;
export const MIN_EXPERIMENTAL_ICE_CONFIDENCE = 0.34;

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

function isScanAction(value: unknown): value is ScanAction {
  return value === 'pour' || value === 'shake';
}

function normalizeStatus(value: unknown): ScanMeasurementStatus {
  return value === 'trained' || value === 'experimental' || value === 'untrained'
    ? value
    : 'untrained';
}

function normalizeFillLevel(
  action: ScanAction,
  value: unknown,
): ScanResult['fillLevel'] {
  if (action === 'shake' && (value === 0 || value === 50 || value === 100)) {
    return value;
  }
  if (action === 'pour' && (value === 50 || value === 90)) {
    return value;
  }
  return null;
}

function normalizeIceAmount(value: unknown): IceAmountClass | null {
  return ICE_AMOUNT_CLASSES.includes(value as IceAmountClass)
    ? (value as IceAmountClass)
    : null;
}

/**
 * Enforces the public result contract at the application boundary.
 * A classifier is not allowed to expose a fill level when it predicts no water.
 */
export function normalizeScanResult(
  result: ScanResultInput,
  expectedAction?: ScanAction,
  options: ScanResultNormalizationOptions = {},
): ScanResult {
  const action =
    expectedAction ??
    (isScanAction(result.measurementAction) ? result.measurementAction : 'pour');
  const actionMatches =
    result.measurementAction === undefined ||
    result.measurementAction === action;
  const measurementStatus: ScanMeasurementStatus = actionMatches
    ? normalizeStatus(result.measurementStatus)
    : 'untrained';
  const containsWater = result.containsWater === true;
  const waterConfidence = clampConfidence(result.waterConfidence ?? 0) ?? 0;
  const fillLevel =
    containsWater && actionMatches
      ? normalizeFillLevel(action, result.fillLevel)
      : null;
  const fillConfidence =
    containsWater && actionMatches
      ? clampConfidence(result.fillConfidence ?? null)
      : null;
  const hasBooleanIcePresence =
    result.icePresence === true || result.icePresence === false;
  const candidateIceConfidence = !hasBooleanIcePresence
      ? null
      : clampConfidence(result.iceConfidence ?? null);
  const iceIsReliable =
    result.iceStatus === 'trained' &&
    hasBooleanIcePresence &&
    candidateIceConfidence !== null &&
    candidateIceConfidence >= MIN_ICE_CONFIDENCE;
  const normalizedIceAmount = normalizeIceAmount(result.iceAmount);
  const candidateIceAmountConfidence = clampConfidence(
    result.iceAmountConfidence ?? null,
  );
  const iceAmountIsReliable =
    action === 'shake' &&
    actionMatches &&
    result.iceAmountStatus === 'trained' &&
    normalizedIceAmount !== null &&
    candidateIceAmountConfidence !== null &&
    candidateIceAmountConfidence >= ICE_AMOUNT_CONFIDENCE_THRESHOLD;
  const iceAmountIsExperimental =
    options.allowExperimentalIceAmount === true &&
    action === 'shake' &&
    actionMatches &&
    result.iceAmountStatus === 'experimental' &&
    normalizedIceAmount !== null &&
    candidateIceAmountConfidence !== null &&
    candidateIceAmountConfidence >= MIN_EXPERIMENTAL_ICE_CONFIDENCE;
  const normalizedIcePresence = iceIsReliable
    ? (result.icePresence as boolean)
    : iceAmountIsExperimental
      ? normalizedIceAmount !== 'none'
      : null;
  const normalizedIceConfidence = iceIsReliable
    ? candidateIceConfidence
    : iceAmountIsExperimental
      ? candidateIceAmountConfidence
      : null;

  return {
    containsWater,
    waterConfidence,
    fillLevel,
    fillConfidence,
    measurementAction: action,
    measurementStatus,
    icePresence: normalizedIcePresence,
    iceConfidence: normalizedIceConfidence,
    iceStatus: result.iceStatus === 'trained' ? 'trained' : 'untrained',
    iceAmount: iceAmountIsReliable || iceAmountIsExperimental
      ? normalizedIceAmount
      : null,
    iceAmountConfidence: iceAmountIsReliable || iceAmountIsExperimental
      ? candidateIceAmountConfidence
      : null,
    iceAmountStatus:
      result.iceAmountStatus === 'trained' ||
      result.iceAmountStatus === 'experimental'
        ? result.iceAmountStatus
        : 'untrained',
    engine: result.engine === 'rust' ? 'rust' : 'typescript',
  };
}
