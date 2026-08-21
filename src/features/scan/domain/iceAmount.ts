/**
 * Coarse ice-amount classes for the same shake recording used by the fill
 * model. Exact cube counts are deliberately not exposed: collisions depend on
 * cube size, water level, bottle geometry and shake strength.
 */
export const ICE_AMOUNT_CLASSES = ['none', 'few', 'many'] as const;

export type IceAmountClass = (typeof ICE_AMOUNT_CLASSES)[number];
export type IceAmountStatus = 'trained' | 'experimental' | 'untrained';

export const ICE_AMOUNT_CONFIDENCE_THRESHOLD = 0.65;

export type IceAmountPrediction = {
  amountClass: IceAmountClass | null;
  confidence: number | null;
  status: IceAmountStatus;
};

/** Map collection ground truth to robust acoustic bands, not exact counts. */
export function iceCountToAmountClass(count: number): IceAmountClass {
  if (!Number.isFinite(count) || count <= 0) {
    return 'none';
  }
  return count <= 2 ? 'few' : 'many';
}

export function iceAmountClassLabel(amountClass: IceAmountClass): string {
  switch (amountClass) {
    case 'none':
      return 'なし';
    case 'few':
      return '少ない';
    case 'many':
      return '多い';
  }
}

export function iceAmountClassToPresence(amountClass: IceAmountClass): boolean {
  return amountClass !== 'none';
}

export function unknownIceAmountPrediction(
  status: IceAmountStatus = 'untrained',
): IceAmountPrediction {
  return { amountClass: null, confidence: null, status };
}
