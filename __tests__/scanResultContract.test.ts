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
