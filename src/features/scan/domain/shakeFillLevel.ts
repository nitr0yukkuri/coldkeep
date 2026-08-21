/**
 * The shake model predicts broad fill bands.  It deliberately does not
 * promise arbitrary millilitre precision: the acoustic signal is calibrated
 * against the user's configured capacity only after a labelled, session-held
 * out model has been produced.
 */
export const SHAKE_FILL_CLASSES = ['empty', 'half', 'full'] as const;

export type ShakeFillClass = (typeof SHAKE_FILL_CLASSES)[number];
export type ShakeMeasurementStatus = 'trained' | 'experimental' | 'untrained';

export type ShakeFillPrediction = {
  fillClass: ShakeFillClass | null;
  fillLevel: 0 | 50 | 100 | null;
  confidence: number | null;
  status: ShakeMeasurementStatus;
};

export const SHAKE_CONFIDENCE_THRESHOLD = 0.65;

export function fillClassToLevel(
  fillClass: ShakeFillClass,
): 0 | 50 | 100 {
  switch (fillClass) {
    case 'empty':
      return 0;
    case 'half':
      return 50;
    case 'full':
      return 100;
  }
}

export function levelToFillClass(
  fillLevel: 0 | 50 | 100,
): ShakeFillClass {
  switch (fillLevel) {
    case 0:
      return 'empty';
    case 50:
      return 'half';
    case 100:
      return 'full';
  }
}

/**
 * Convert a reliable broad class into a remaining-volume estimate.  The
 * result is null for a missing/untrained/low-confidence prediction so the UI
 * cannot accidentally turn a pilot output into a hydration event.
 */
export function remainingMlFromShake(
  capacityMl: number,
  prediction: ShakeFillPrediction,
): number | null {
  if (
    !Number.isFinite(capacityMl) ||
    capacityMl <= 0 ||
    prediction.status !== 'trained' ||
    prediction.fillLevel === null ||
    prediction.confidence === null ||
    !Number.isFinite(prediction.confidence) ||
    prediction.confidence < SHAKE_CONFIDENCE_THRESHOLD
  ) {
    return null;
  }
  return Math.round((capacityMl * prediction.fillLevel) / 100);
}

export function unknownShakePrediction(
  status: ShakeMeasurementStatus = 'untrained',
): ShakeFillPrediction {
  return { fillClass: null, fillLevel: null, confidence: null, status };
}
