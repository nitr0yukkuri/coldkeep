export type InferenceEngine = 'typescript' | 'rust';

export type ScanResult = {
  containsWater: boolean;
  waterConfidence: number;
  fillLevel: 50 | 90 | null;
  fillConfidence: number | null;
  icePresence: boolean | null;
  iceConfidence: number | null;
  iceStatus: 'untrained' | 'trained';
  engine: InferenceEngine;
};

export function unknownScanResult(engine: InferenceEngine = 'typescript'): ScanResult {
  return {
    containsWater: false,
    waterConfidence: 0,
    fillLevel: null,
    fillConfidence: null,
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained',
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
  const iceConfidence = result.icePresence === null
    ? null
    : clampConfidence(result.iceConfidence);

  return {
    ...result,
    waterConfidence,
    fillLevel,
    fillConfidence,
    iceConfidence,
  };
}
