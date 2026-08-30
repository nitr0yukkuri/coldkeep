import { normalizeScanResult } from '../src/features/scan/domain/scanResult';

test('does not trust a result from a different physical action', () => {
  const result = normalizeScanResult(
    {
      containsWater: true,
      waterConfidence: 0.95,
      fillLevel: 90,
      fillConfidence: 0.95,
      measurementAction: 'pour',
      measurementStatus: 'trained',
      engine: 'typescript',
    },
    'shake',
  );

  expect(result.measurementAction).toBe('shake');
  expect(result.measurementStatus).toBe('untrained');
  expect(result.fillLevel).toBeNull();
});

test('fails closed for malformed native status, fill level, and ice class values', () => {
  const result = normalizeScanResult({
    containsWater: true,
    waterConfidence: 0.99,
    fillLevel: 90,
    fillConfidence: 0.99,
    measurementAction: 'shake',
    measurementStatus: 'ship-it' as never,
    icePresence: 'yes' as never,
    iceConfidence: 0.99,
    iceStatus: 'trained',
    iceAmount: 'all' as never,
    iceAmountConfidence: 0.99,
    iceAmountStatus: 'trained',
    engine: 'typescript',
  });

  expect(result.measurementStatus).toBe('untrained');
  expect(result.fillLevel).toBeNull();
  expect(result.icePresence).toBeNull();
  expect(result.iceAmount).toBeNull();
});

test('ice amount is only trusted for a matching shake result', () => {
  const result = normalizeScanResult(
    {
      measurementAction: 'pour',
      iceAmount: 'many',
      iceAmountConfidence: 0.99,
      iceAmountStatus: 'trained',
    },
    'shake',
  );
  expect(result.iceAmount).toBeNull();
});

test('experimental ice amount requires an explicit research opt-in', () => {
  const input = {
    containsWater: false,
    waterConfidence: 0,
    measurementAction: 'shake' as const,
    measurementStatus: 'untrained' as const,
    iceAmount: 'few' as const,
    iceAmountConfidence: 0.59,
    iceAmountStatus: 'experimental' as const,
    engine: 'typescript' as const,
  };

  expect(normalizeScanResult(input, 'shake').iceAmount).toBeNull();
  const preview = normalizeScanResult(input, 'shake', {
    allowExperimentalIceAmount: true,
  });
  expect(preview.iceAmount).toBe('few');
  expect(preview.iceAmountStatus).toBe('experimental');
  expect(preview.icePresence).toBe(true);
  expect(preview.iceConfidence).toBe(0.59);
});
