import { classifyPublicAudio } from '../publicAudioClassifier';

test('public audio classifier returns finite probabilities', () => {
  const samples = new Float32Array(16000);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = 0.05 * Math.sin((2 * Math.PI * 700 * index) / 16000);
  }
  const result = classifyPublicAudio(samples, 16000);
  expect(Number.isFinite(result.waterConfidence)).toBe(true);
  expect(result.waterConfidence).toBeGreaterThanOrEqual(0);
  expect(result.waterConfidence).toBeLessThanOrEqual(1);
  if (result.fillConfidence !== null) {
    expect(result.fillConfidence).toBeGreaterThanOrEqual(0);
    expect(result.fillConfidence).toBeLessThanOrEqual(1);
  }
});

