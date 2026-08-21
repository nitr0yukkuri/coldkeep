import {
  fillClassToLevel,
  levelToFillClass,
  remainingMlFromShake,
  unknownShakePrediction,
} from '../src/features/scan/domain/shakeFillLevel';
import { classifyShakeAudio } from '../publicShakeClassifier';

test('shake classes map to broad remaining-volume bands', () => {
  expect(fillClassToLevel('empty')).toBe(0);
  expect(fillClassToLevel('half')).toBe(50);
  expect(fillClassToLevel('full')).toBe(100);
  expect(levelToFillClass(0)).toBe('empty');
  expect(levelToFillClass(50)).toBe('half');
  expect(levelToFillClass(100)).toBe('full');
});

test('only a trained, confident shake model can produce millilitres', () => {
  const prediction = {
    fillClass: 'half' as const,
    fillLevel: 50 as const,
    confidence: 0.8,
    status: 'trained' as const,
  };
  expect(remainingMlFromShake(750, prediction)).toBe(375);
  expect(
    remainingMlFromShake(750, { ...prediction, confidence: 0.64 }),
  ).toBeNull();
  expect(
    remainingMlFromShake(750, { ...prediction, status: 'experimental' }),
  ).toBeNull();
  expect(unknownShakePrediction()).toEqual({
    fillClass: null,
    fillLevel: null,
    confidence: null,
    status: 'untrained',
  });
});

test('the checked-in shake artifact cannot silently reuse the pour model', () => {
  const result = classifyShakeAudio(new Float32Array(16_000), 16_000);
  expect(result.measurementAction).toBe('shake');
  expect(result.measurementStatus).toBe('untrained');
  expect(result.fillLevel).toBeNull();
  expect(result.fillConfidence).toBeNull();
});
