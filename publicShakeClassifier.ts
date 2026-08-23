import shakeModelArtifact from './ml/artifacts/shake_fill_level_pilot.json';
import shakeIceAmountArtifact from './ml/artifacts/shake_ice_amount_pilot.json';
import { resamplePcm } from './src/platform/audio/resamplePcm';
import {
  averagedPrediction,
  extractWindowFeatures,
  recordingWindows,
  LinearModel,
} from './publicAudioClassifier';
import {
  fillClassToLevel,
  ShakeFillClass,
  unknownShakePrediction,
} from './src/features/scan/domain/shakeFillLevel';
import {
  IceAmountClass,
  iceAmountClassToPresence,
} from './src/features/scan/domain/iceAmount';
import { PublicAudioPrediction } from './publicAudioClassifier';

type ShakeModelArtifact = {
  status: 'trained' | 'experimental' | 'untrained';
  sampleRate: number;
  windowSamples: number;
  hopSamples: number;
  featureSize: number;
  classes: ShakeFillClass[];
  model: LinearModel | null;
  heuristic?: 'energy-profile-v1';
};

type ShakeIceAmountArtifact = {
  status: 'trained' | 'experimental' | 'untrained';
  sampleRate: number;
  windowSamples: number;
  hopSamples: number;
  featureSize: number;
  featureSchema?: {
    name: string;
    version: number;
  };
  classes: IceAmountClass[];
  model: LinearModel | null;
};

export type ShakeClassifierOptions = {
  /** Enable the non-production acoustic preview explicitly for UX demos. */
  allowExperimentalPreview?: boolean;
};

const artifact = shakeModelArtifact as ShakeModelArtifact;
const iceArtifact = shakeIceAmountArtifact as ShakeIceAmountArtifact;

function effectiveStatus(
  status: ShakeModelArtifact['status'],
  model: LinearModel | null,
): ShakeModelArtifact['status'] {
  if (
    status === 'trained' &&
    !isValidLinearModel(model, artifact.featureSize, artifact.classes.length)
  ) {
    return 'untrained';
  }
  return status;
}

/**
 * Treat an artifact as untrained when its numeric shape is not safe for the
 * on-device linear predictor.  A checked-in JSON file is an input boundary;
 * silently indexing a short weight row would otherwise produce NaN
 * probabilities and a false confident class.
 */
function isValidLinearModel(
  model: LinearModel | null,
  featureSize: number,
  classCount: number,
): model is LinearModel {
  if (model === null || !Number.isInteger(featureSize) || featureSize <= 0) {
    return false;
  }
  if (
    !Array.isArray(model.classes) ||
    model.classes.length !== classCount ||
    !Array.isArray(model.featureMean) ||
    model.featureMean.length !== featureSize ||
    !Array.isArray(model.featureScale) ||
    model.featureScale.length !== featureSize ||
    !Array.isArray(model.weights) ||
    model.weights.length !== featureSize ||
    !Array.isArray(model.bias) ||
    model.bias.length !== classCount
  ) {
    return false;
  }
  if (
    !model.classes.every((value, index) => value === index) ||
    !model.featureMean.every(Number.isFinite) ||
    !model.featureScale.every(value => Number.isFinite(value) && value > 0) ||
    !model.bias.every(Number.isFinite)
  ) {
    return false;
  }
  return model.weights.every(
    row =>
      Array.isArray(row) &&
      row.length === classCount &&
      row.every(Number.isFinite),
  );
}

function isValidShakeArtifact(value: ShakeModelArtifact): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    Array.isArray(value.classes) &&
    value.sampleRate === 16_000 &&
    value.windowSamples === 16_000 &&
    value.hopSamples === 8_000 &&
    value.featureSize === 128 &&
    value.classes.length === 3 &&
    value.classes[0] === 'empty' &&
    value.classes[1] === 'half' &&
    value.classes[2] === 'full' &&
    (value.model === null ||
      isValidLinearModel(value.model, value.featureSize, value.classes.length))
  );
}

function effectiveIceStatus(): ShakeIceAmountArtifact['status'] {
  if (!iceArtifact || typeof iceArtifact !== 'object') {
    return 'untrained';
  }
  const validShape =
    Array.isArray(iceArtifact.classes) &&
    iceArtifact.sampleRate === 16_000 &&
    iceArtifact.windowSamples === 16_000 &&
    iceArtifact.hopSamples === 8_000 &&
    iceArtifact.featureSize === 128 &&
    iceArtifact.classes.length === 3 &&
    iceArtifact.classes[0] === 'none' &&
    iceArtifact.classes[1] === 'few' &&
    iceArtifact.classes[2] === 'many' &&
    iceArtifact.featureSchema?.name === 'log_mel_summary_v1' &&
    iceArtifact.featureSchema?.version === 1;
  if (
    iceArtifact.status === 'trained' &&
    (!validShape ||
      !isValidLinearModel(
        iceArtifact.model,
        iceArtifact.featureSize,
        iceArtifact.classes.length,
      ))
  ) {
    return 'untrained';
  }
  return iceArtifact.status;
}

function unknownPrediction(): PublicAudioPrediction {
  const artifactStatus = isValidShakeArtifact(artifact)
    ? effectiveStatus(artifact.status, artifact.model)
    : 'untrained';
  const prediction = unknownShakePrediction(
    artifactStatus,
  );
  const iceStatus = effectiveIceStatus();
  return {
    containsWater: false,
    waterConfidence: 0,
    fillLevel: prediction.fillLevel,
    fillConfidence: prediction.confidence,
    icePresence: null,
    iceConfidence: null,
    iceStatus: 'untrained',
    iceAmount: null,
    iceAmountConfidence: null,
    iceAmountStatus: iceStatus,
    engine: 'typescript',
    measurementAction: 'shake',
    measurementStatus: prediction.status,
  };
}

export type ExperimentalShakeEstimate = {
  fillClass: ShakeFillClass;
  fillLevel: 0 | 50 | 100;
  confidence: number;
};

/**
 * Return a deliberately low-confidence, explainable preview estimate.
 *
 * This is not a trained water-bottle model. It maps the dominant mel-energy
 * profile to broad acoustic bands so the end-to-end VORN demo can show the
 * result path before the labelled phone/water-bottle dataset is complete.
 * The caller marks the result experimental, and the app never converts it to
 * a hydration event. The estimate is therefore useful for UX validation but
 * must not be presented as accuracy or arbitrary millilitre measurement.
 */
export function estimateExperimentalShake(
  input: Float32Array,
  sourceRate: number,
): ExperimentalShakeEstimate {
  const samples = resamplePcm(input, sourceRate, artifact.sampleRate);
  const windows = recordingWindows(samples);
  const profiles = windows.map(window => {
    const features = extractWindowFeatures(window);
    const melMeans = features.slice(0, 32);
    let totalEnergy = 0;
    let weightedBin = 0;
    for (let index = 0; index < melMeans.length; index += 1) {
      const energy = Math.exp(melMeans[index] - Math.max(...melMeans));
      totalEnergy += energy;
      weightedBin += energy * index;
    }
    const centroid = weightedBin / Math.max(totalEnergy, 1e-9);
    return centroid / Math.max(melMeans.length - 1, 1);
  });
  const average =
    profiles.reduce((total, value) => total + value, 0) /
    Math.max(profiles.length, 1);
  const deviation = Math.sqrt(
    profiles.reduce((total, value) => total + (value - average) ** 2, 0) /
      Math.max(profiles.length, 1),
  );
  const fillClass: ShakeFillClass =
    average < 0.34 ? 'full' : average > 0.66 ? 'empty' : 'half';
  const fillLevel = fillClassToLevel(fillClass);
  const consistency = Math.max(0, 1 - deviation * 3);
  const confidence = Math.min(0.59, Math.max(0.42, 0.46 + consistency * 0.1));
  return { fillClass, fillLevel, confidence };
}

/**
 * Classify a shake recording only through the explicit shake artifact. The
 * checked-in preview artifact is experimental, so a public pour model can
 * never be silently reused for a different physical action.
 */
export function classifyShakeAudio(
  input: Float32Array,
  sourceRate: number,
  options: ShakeClassifierOptions = {},
): PublicAudioPrediction {
  if (
    !isValidShakeArtifact(artifact) ||
    (effectiveStatus(artifact.status, artifact.model) !== 'trained' &&
      !options.allowExperimentalPreview)
  ) {
    return unknownPrediction();
  }
  const samples = resamplePcm(input, sourceRate, artifact.sampleRate);
  const features = recordingWindows(samples).map(extractWindowFeatures);
  if (
    artifact.model === null &&
    artifact.heuristic === 'energy-profile-v1' &&
    options.allowExperimentalPreview === true
  ) {
    const estimate = estimateExperimentalShake(input, sourceRate);
    return {
      containsWater: true,
      waterConfidence: estimate.confidence,
      fillLevel: estimate.fillLevel,
      fillConfidence: estimate.confidence,
      icePresence: null,
      iceConfidence: null,
      iceStatus: 'untrained',
      iceAmount: null,
      iceAmountConfidence: null,
      iceAmountStatus: effectiveIceStatus(),
      engine: 'typescript',
      measurementAction: 'shake',
      measurementStatus: 'experimental',
    };
  }
  if (
    artifact.model === null ||
    !isValidLinearModel(artifact.model, artifact.featureSize, artifact.classes.length)
  ) {
    return unknownPrediction();
  }
  const probabilities = averagedPrediction(features, artifact.model);
  const bestIndex = probabilities.reduce(
    (best, value, index) => (value > probabilities[best] ? index : best),
    0,
  );
  const fillClass = artifact.classes[bestIndex];
  const confidence = probabilities[bestIndex] ?? 0;
  const fillLevel = fillClassToLevel(fillClass);
  const iceStatus = effectiveIceStatus();
  let iceAmount: IceAmountClass | null = null;
  let iceAmountConfidence: number | null = null;
  if (
    iceStatus !== 'untrained' &&
    iceArtifact.model !== null &&
    iceArtifact.classes.length === 3 &&
    iceArtifact.sampleRate === artifact.sampleRate &&
    iceArtifact.windowSamples === artifact.windowSamples &&
    iceArtifact.hopSamples === artifact.hopSamples &&
    iceArtifact.featureSize === artifact.featureSize &&
    iceArtifact.featureSchema?.name === 'log_mel_summary_v1' &&
    iceArtifact.featureSchema?.version === 1 &&
    isValidLinearModel(
      iceArtifact.model,
      iceArtifact.featureSize,
      iceArtifact.classes.length,
    )
  ) {
    const iceProbabilities = averagedPrediction(features, iceArtifact.model);
    const iceIndex = iceProbabilities.reduce(
      (best, value, index) => (value > iceProbabilities[best] ? index : best),
      0,
    );
    iceAmount = iceArtifact.classes[iceIndex] ?? null;
    iceAmountConfidence = iceProbabilities[iceIndex] ?? null;
  }
  return {
    // A shake class describes the amount of content, including empty. Water
    // presence is not a separate task here, so it is not presented as a
    // positive/negative material claim by the UI.
    containsWater: true,
    waterConfidence: confidence,
    fillLevel,
    fillConfidence: confidence,
    icePresence:
      iceAmount !== null ? iceAmountClassToPresence(iceAmount) : null,
    iceConfidence: iceAmountConfidence,
    iceStatus: iceStatus === 'trained' ? 'trained' : 'untrained',
    iceAmount,
    iceAmountConfidence,
    iceAmountStatus: iceStatus,
    engine: 'typescript',
    measurementAction: 'shake',
    measurementStatus: artifact.status,
  };
}
