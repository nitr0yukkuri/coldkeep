import {
  iceAmountClassLabel,
  iceAmountClassToPresence,
  iceCountToAmountClass,
  unknownIceAmountPrediction,
} from '../src/features/scan/domain/iceAmount';
import { normalizeScanResult } from '../src/features/scan/domain/scanResult';

test('maps exact collection counts to public coarse ice bands', () => {
  expect(iceCountToAmountClass(0)).toBe('none');
  expect(iceCountToAmountClass(1)).toBe('few');
  expect(iceCountToAmountClass(2)).toBe('few');
  expect(iceCountToAmountClass(3)).toBe('many');
  expect(iceCountToAmountClass(99)).toBe('many');
  expect(iceAmountClassLabel('none')).toBe('なし');
  expect(iceAmountClassLabel('few')).toBe('少ない');
  expect(iceAmountClassLabel('many')).toBe('多い');
  expect(iceAmountClassToPresence('none')).toBe(false);
  expect(iceAmountClassToPresence('few')).toBe(true);
  expect(iceAmountClassToPresence('many')).toBe(true);
});

test('unknown ice prediction is explicit until a trained artifact exists', () => {
  expect(unknownIceAmountPrediction()).toEqual({
    amountClass: null,
    confidence: null,
    status: 'untrained',
  });
});

test('normalization only exposes a trained coarse ice result above the gate', () => {
  const base = {
    containsWater: true,
    waterConfidence: 0.9,
    fillLevel: 50 as const,
    fillConfidence: 0.9,
    measurementAction: 'shake' as const,
    measurementStatus: 'trained' as const,
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained' as const,
    iceAmount: 'many' as const,
    iceAmountConfidence: 0.9,
    iceAmountStatus: 'trained' as const,
    engine: 'typescript' as const,
  };
  expect(normalizeScanResult(base).iceAmount).toBe('many');
  expect(
    normalizeScanResult({
      ...base,
      iceAmountConfidence: 0.64,
    }).iceAmount,
  ).toBeNull();
  expect(
    normalizeScanResult({
      ...base,
      iceAmountStatus: 'experimental',
    }).iceAmount,
  ).toBeNull();
});
