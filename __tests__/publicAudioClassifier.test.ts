import goldenFeatures from '../ml/fixtures/audio_features_golden.json';
import {
  classifyPublicAudio,
  extractTransientFeatures,
  extractWindowFeatures,
} from '../publicAudioClassifier';

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

test('typescript feature extractor matches the cross-runtime golden fixture', () => {
  const samples = new Float32Array(goldenFeatures.length);
  Object.entries(goldenFeatures.pcm16Impulses).forEach(([offset, value]) => {
    samples[Number(offset)] = Number(value) / 32768;
  });
  const logMel = extractWindowFeatures(samples);
  const transient = extractTransientFeatures(samples);
  expect(logMel).toHaveLength(goldenFeatures.logMel.length);
  expect(transient).toHaveLength(goldenFeatures.transient.length);
  logMel.forEach((value, index) => {
    expect(value).toBeCloseTo(goldenFeatures.logMel[index], 3);
  });
  transient.forEach((value, index) => {
    expect(value).toBeCloseTo(goldenFeatures.transient[index], 3);
  });
});
