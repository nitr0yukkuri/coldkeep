import {
  fillClassToLevel,
  levelToFillClass,
  remainingMlFromShake,
  unknownShakePrediction,
} from '../src/features/scan/domain/shakeFillLevel';
import { classifyShakeAudio } from '../publicShakeClassifier';
import { TypeScriptClassifierAdapter } from '../src/platform/ml/typescriptClassifier';

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

test('the production shake path stays untrained without a model', () => {
  const input = new Float32Array(16_000);
  for (let index = 0; index < input.length; index += 1) {
    input[index] = Math.sin((2 * Math.PI * 440 * index) / 16_000) * 0.1;
  }
  const result = classifyShakeAudio(input, 16_000);
  expect(result.measurementAction).toBe('shake');
  expect(result.measurementStatus).toBe('untrained');
  expect(result.fillLevel).toBeNull();
});

test('the research ice preview requires explicit opt-in and stays experimental', () => {
  const input = new Float32Array(16_000);
  input[400] = 0.2;

  const disabled = classifyShakeAudio(input, 16_000);
  expect(disabled.iceAmount).toBeNull();
  expect(disabled.iceAmountStatus).toBe('untrained');

  const preview = classifyShakeAudio(input, 16_000, {
    allowExperimentalIcePreview: true,
  });
  expect(preview.iceAmount).toMatch(/^(none|few|many)$/);
  expect(preview.iceAmountStatus).toBe('experimental');
  expect(preview.iceAmountConfidence).toBeLessThan(0.65);
  expect(preview.measurementAction).toBe('shake');
});

test('the preview shake estimate requires an explicit opt-in', () => {
  const input = new Float32Array(16_000);
  for (let index = 0; index < input.length; index += 1) {
    input[index] = Math.sin((2 * Math.PI * 440 * index) / 16_000) * 0.1;
  }
  const result = classifyShakeAudio(input, 16_000, {
    allowExperimentalPreview: true,
  });
  expect(result.measurementStatus).toBe('experimental');
  expect(result.fillLevel).not.toBeNull();
  expect(result.fillConfidence).toBeLessThan(0.65);
});

test('the app adapter enables the generic experimental shake preview', async () => {
  const input = new Float32Array(16_000);
  for (let index = 0; index < input.length; index += 1) {
    input[index] = Math.sin((2 * Math.PI * 440 * index) / 16_000) * 0.1;
  }
  const adapter = new TypeScriptClassifierAdapter({
    allowExperimentalPreview: true,
  });
  const result = await adapter.classify({
    recording: { uri: 'file:///preview.wav' },
    audio: { samples: input, sampleRate: 16_000 },
    action: 'shake',
  });
  expect(result.measurementStatus).toBe('experimental');
  expect(result.fillLevel).not.toBeNull();
  expect(result.iceAmount).toBeNull();
});

test('a trained ice artifact is usable while the fill artifact is untrained', () => {
  const model = {
    classes: [0, 1, 2],
    featureMean: Array(128).fill(0),
    featureScale: Array(128).fill(1),
    weights: Array.from({ length: 128 }, () => [0, 0, 0]),
    bias: [0, 0, 5],
  };
  jest.resetModules();
  jest.doMock('../ml/artifacts/shake_fill_level_pilot.json', () => ({
    __esModule: true,
    default: {
      version: 1,
      task: 'shake_fill_level',
      status: 'untrained',
      classes: ['empty', 'half', 'full'],
      sampleRate: 16_000,
      windowSamples: 16_000,
      hopSamples: 8_000,
      featureSize: 128,
      model: null,
    },
  }));
  jest.doMock('../ml/artifacts/shake_ice_amount_pilot.json', () => ({
    __esModule: true,
    default: {
      version: 1,
      task: 'shake_ice_amount',
      status: 'trained',
      classes: ['none', 'few', 'many'],
      sampleRate: 16_000,
      windowSamples: 16_000,
      hopSamples: 8_000,
      featureSize: 128,
      featureSchema: { name: 'log_mel_summary_v1', version: 1 },
      model,
    },
  }));

  let classify!: typeof classifyShakeAudio;
  jest.isolateModules(() => {
    classify = require('../publicShakeClassifier').classifyShakeAudio;
  });
  const input = new Float32Array(16_000);
  input[400] = 0.2;
  const result = classify(input, 16_000);

  expect(result.measurementStatus).toBe('untrained');
  expect(result.fillLevel).toBeNull();
  expect(result.iceAmountStatus).toBe('trained');
  expect(result.iceAmount).toBe('many');
  expect(result.iceAmountConfidence).toBeGreaterThan(0.9);
  jest.dontMock('../ml/artifacts/shake_fill_level_pilot.json');
  jest.dontMock('../ml/artifacts/shake_ice_amount_pilot.json');
  jest.resetModules();
});
