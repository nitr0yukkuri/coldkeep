/* eslint-disable no-bitwise */

import modelArtifact from './ml/artifacts/public_audio_baseline.json';
import { resamplePcm } from './src/platform/audio/resamplePcm';

export type LinearModel = {
  classes: number[];
  featureMean: number[];
  featureScale: number[];
  weights: number[][];
  bias: number[];
};

export type ModelArtifact = {
  sampleRate: number;
  windowSamples: number;
  hopSamples: number;
  melBins: number;
  featureSize: number;
  models: {
    fill_level_water: LinearModel;
    water_presence: LinearModel;
  };
};

export type PublicAudioPrediction = {
  containsWater: boolean;
  waterConfidence: number;
  fillLevel: 0 | 50 | 90 | 100 | null;
  fillConfidence: number | null;
  icePresence: boolean | null;
  iceConfidence: number | null;
  iceStatus: 'untrained' | 'trained';
  iceAmount: 'none' | 'few' | 'many' | null;
  iceAmountConfidence: number | null;
  iceAmountStatus: 'trained' | 'experimental' | 'untrained';
  engine: 'typescript' | 'rust';
  measurementAction?: 'pour' | 'shake';
  measurementStatus?: 'trained' | 'experimental' | 'untrained';
};

const artifact = modelArtifact as ModelArtifact;
const FFT_SIZE = 512;
const FRAME_SIZE = 400;
const FRAME_HOP = 160;

function fftPower(frame: Float32Array): Float64Array {
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  for (let index = 0; index < FRAME_SIZE; index += 1) {
    real[index] =
      frame[index] *
      (0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FRAME_SIZE - 1)));
  }
  for (let index = 1, reversed = 0; index < FFT_SIZE; index += 1) {
    let bit = FFT_SIZE >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
    }
  }
  for (let length = 2; length <= FFT_SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < FFT_SIZE; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal =
          real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary =
          real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  const power = new Float64Array(FFT_SIZE / 2 + 1);
  for (let index = 0; index < power.length; index += 1) {
    power[index] = real[index] ** 2 + imaginary[index] ** 2;
  }
  return power;
}

function hzToMel(frequency: number): number {
  return 2595 * Math.log10(1 + frequency / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function makeMelFilters(): Float64Array[] {
  const minimumMel = hzToMel(60);
  const maximumMel = hzToMel(7600);
  const edges = Array.from({ length: artifact.melBins + 2 }, (_, index) =>
    melToHz(
      minimumMel + ((maximumMel - minimumMel) * index) / (artifact.melBins + 1),
    ),
  );
  return Array.from({ length: artifact.melBins }, (_, bin) => {
    const filter = new Float64Array(FFT_SIZE / 2 + 1);
    let sum = 0;
    for (let index = 0; index < filter.length; index += 1) {
      const frequency = (index * artifact.sampleRate) / FFT_SIZE;
      const rising = (frequency - edges[bin]) / (edges[bin + 1] - edges[bin]);
      const falling =
        (edges[bin + 2] - frequency) / (edges[bin + 2] - edges[bin + 1]);
      filter[index] = Math.max(0, Math.min(rising, falling));
      sum += filter[index];
    }
    for (let index = 0; index < filter.length; index += 1) {
      filter[index] /= Math.max(sum, 1e-9);
    }
    return filter;
  });
}

const melFilters = makeMelFilters();

export function extractWindowFeatures(input: Float32Array): number[] {
  const samples = new Float32Array(input);
  let mean = 0;
  for (const sample of samples) {
    mean += sample;
  }
  mean /= samples.length;
  let squared = 0;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] -= mean;
    squared += samples[index] ** 2;
  }
  const gain =
    0.05 / Math.max(Math.sqrt(squared / samples.length + 1e-12), 1e-5);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.max(-1, Math.min(1, samples[index] * gain));
  }

  const logMel: number[][] = [];
  for (
    let start = 0;
    start + FRAME_SIZE <= samples.length;
    start += FRAME_HOP
  ) {
    const power = fftPower(samples.subarray(start, start + FRAME_SIZE));
    logMel.push(
      melFilters.map(filter => {
        let energy = 0;
        for (let index = 0; index < filter.length; index += 1) {
          energy += power[index] * filter[index];
        }
        return Math.log(Math.max(energy, 1e-10));
      }),
    );
  }
  const delta = logMel
    .slice(1)
    .map((row, index) => row.map((value, bin) => value - logMel[index][bin]));
  const summarize = (rows: number[][]) => {
    const means = Array(artifact.melBins).fill(0) as number[];
    const deviations = Array(artifact.melBins).fill(0) as number[];
    for (const row of rows) {
      row.forEach((value, bin) => {
        means[bin] += value / rows.length;
      });
    }
    for (const row of rows) {
      row.forEach((value, bin) => {
        deviations[bin] += (value - means[bin]) ** 2 / rows.length;
      });
    }
    return [...means, ...deviations.map(Math.sqrt)];
  };
  return [...summarize(logMel), ...summarize(delta)];
}

export function recordingWindows(samples: Float32Array): Float32Array[] {
  if (samples.length <= artifact.windowSamples) {
    const padded = new Float32Array(artifact.windowSamples);
    padded.set(samples);
    return [padded];
  }
  const starts: number[] = [];
  for (
    let start = 0;
    start + artifact.windowSamples <= samples.length;
    start += artifact.hopSamples
  ) {
    starts.push(start);
  }
  const tail = samples.length - artifact.windowSamples;
  if (starts[starts.length - 1] !== tail) {
    starts.push(tail);
  }
  return starts.map(start =>
    samples.slice(start, start + artifact.windowSamples),
  );
}

function predict(features: number[], model: LinearModel): number[] {
  const logits = model.bias.map((bias, output) => {
    let value = bias;
    for (let feature = 0; feature < features.length; feature += 1) {
      const normalized =
        (features[feature] - model.featureMean[feature]) /
        Math.max(model.featureScale[feature], 1e-5);
      value += normalized * model.weights[feature][output];
    }
    return value;
  });
  const maximum = Math.max(...logits);
  const exponentials = logits.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
}

export function averagedPrediction(
  features: number[][],
  model: LinearModel,
): number[] {
  const average = model.classes.map(() => 0);
  for (const window of features) {
    predict(window, model).forEach((value, index) => {
      average[index] += value / features.length;
    });
  }
  return average;
}

export function classifyPublicAudio(
  input: Float32Array,
  sourceRate: number,
): PublicAudioPrediction {
  const samples = resamplePcm(input, sourceRate, artifact.sampleRate);
  const features = recordingWindows(samples).map(extractWindowFeatures);
  const waterModel = artifact.models.water_presence;
  const waterProbabilities = averagedPrediction(features, waterModel);
  const waterIndex = waterModel.classes.indexOf(1);
  const waterConfidence = waterProbabilities[waterIndex];
  const containsWater = waterConfidence >= 0.5;

  if (!containsWater) {
    return {
      containsWater,
      waterConfidence: 1 - waterConfidence,
      fillLevel: null,
      fillConfidence: null,
      icePresence: null,
      iceConfidence: null,
      iceStatus: 'untrained',
      iceAmount: null,
      iceAmountConfidence: null,
      iceAmountStatus: 'untrained',
      engine: 'typescript',
      measurementAction: 'pour',
      measurementStatus: 'trained',
    };
  }
  const fillModel = artifact.models.fill_level_water;
  const fillProbabilities = averagedPrediction(features, fillModel);
  const bestIndex = fillProbabilities[0] >= fillProbabilities[1] ? 0 : 1;
  return {
    containsWater,
    waterConfidence,
    fillLevel: fillModel.classes[bestIndex] === 1 ? 50 : 90,
    fillConfidence: fillProbabilities[bestIndex],
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained',
    iceAmount: null,
    iceAmountConfidence: null,
    iceAmountStatus: 'untrained',
    engine: 'typescript',
    measurementAction: 'pour',
    measurementStatus: 'trained',
  };
}
