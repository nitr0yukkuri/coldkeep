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
