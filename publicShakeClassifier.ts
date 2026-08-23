import shakeModelArtifact from './ml/artifacts/shake_fill_level_pilot.json';
import shakeIceAmountArtifact from './ml/artifacts/shake_ice_amount_pilot.json';
import researchIceAmountArtifact from './ml/artifacts/research_external_mixture_shake_ice_amount.json';
import { resamplePcm } from './src/platform/audio/resamplePcm';
import {
  averagedPrediction,
  extractWindowFeatures,
  extractTransientFeatures,
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

/**
 * A deliberately non-production artifact generated from synthetic waveform
 * mixtures.  It is kept separate from the measured ColdKeep artifact so an
 * experimental demo can exercise the end-to-end path without changing the
 * production label contract.
 */
type ResearchIceAmountArtifact = {
  status: 'research_only';
  sampleRate: number;
  windowSamples: number;
  hopSamples: number;
  featureSize: number;
  featureSchema?: {
    name: string;
    version: number;
  };
  classes: string[];
  model: LinearModel | null;
  provenance?: {
    labelsUsedForProductionTraining?: boolean;
    productionArtifactUpdated?: boolean;
  };
};

export type ShakeClassifierOptions = {
  /** Enable the non-production acoustic preview explicitly for UX demos. */
  allowExperimentalPreview?: boolean;
  /** Enable the research-only 149-feature ice preview explicitly. */
  allowExperimentalIcePreview?: boolean;
};

const artifact = shakeModelArtifact as ShakeModelArtifact;
const iceArtifact = shakeIceAmountArtifact as ShakeIceAmountArtifact;
const researchIceArtifact =
  researchIceAmountArtifact as ResearchIceAmountArtifact;

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
    (value.status === 'trained' ||
      value.status === 'experimental' ||
      value.status === 'untrained') &&
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

function isValidIceArtifact(value: ShakeIceAmountArtifact): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    (value.status === 'trained' ||
      value.status === 'experimental' ||
      value.status === 'untrained') &&
    Array.isArray(value.classes) &&
    value.sampleRate === 16_000 &&
    value.windowSamples === 16_000 &&
    value.hopSamples === 8_000 &&
    value.featureSize === 128 &&
    value.classes.length === 3 &&
    value.classes[0] === 'none' &&
    value.classes[1] === 'few' &&
    value.classes[2] === 'many' &&
    value.featureSchema?.name === 'log_mel_summary_v1' &&
    value.featureSchema?.version === 1 &&
    (value.model === null ||
      isValidLinearModel(value.model, value.featureSize, value.classes.length))
  );
}

function isValidResearchIceArtifact(
  value: ResearchIceAmountArtifact,
): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    value.status === 'research_only' &&
    Array.isArray(value.classes) &&
    value.sampleRate === 16_000 &&
    value.windowSamples === 16_000 &&
    value.hopSamples === 8_000 &&
    value.featureSize === 149 &&
    value.classes.length === 3 &&
    value.classes[0] === 'none' &&
    value.classes[1] === 'few' &&
    value.classes[2] === 'many' &&
    value.featureSchema?.name === 'external_single_event_mixture_v1' &&
    value.featureSchema?.version === 1 &&
    value.provenance?.labelsUsedForProductionTraining === false &&
    value.provenance?.productionArtifactUpdated === false &&
    value.model !== null &&
    isValidLinearModel(value.model, value.featureSize, value.classes.length)
  );
}

function effectiveIceStatus(): ShakeIceAmountArtifact['status'] {
  if (!isValidIceArtifact(iceArtifact)) {
    return 'untrained';
  }
  if (
    iceArtifact.status === 'trained' &&
    (iceArtifact.model === null ||
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

function recordingWindowsFor(
  samples: Float32Array,
  windowSamples: number,
  hopSamples: number,
): Float32Array[] {
  if (samples.length <= windowSamples) {
    const padded = new Float32Array(windowSamples);
    padded.set(samples);
    return [padded];
  }
  const starts: number[] = [];
  for (
    let start = 0;
    start + windowSamples <= samples.length;
    start += hopSamples
  ) {
    starts.push(start);
  }
  const tail = samples.length - windowSamples;
  if (starts[starts.length - 1] !== tail) {
    starts.push(tail);
  }
  return starts.map(start => samples.slice(start, start + windowSamples));
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
  const windows = recordingWindowsFor(
    samples,
    artifact.windowSamples,
    artifact.hopSamples,
  );
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
  const fillArtifactValid = isValidShakeArtifact(artifact);
  const fillStatus = fillArtifactValid
    ? effectiveStatus(artifact.status, artifact.model)
    : 'untrained';
  const iceStatus = effectiveIceStatus();
  const iceReady =
    iceStatus === 'trained' &&
    isValidIceArtifact(iceArtifact) &&
    iceArtifact.model !== null &&
    isValidLinearModel(
      iceArtifact.model,
      iceArtifact.featureSize,
      iceArtifact.classes.length,
    );
  const fillReady =
    fillStatus === 'trained' &&
    fillArtifactValid &&
    artifact.model !== null &&
    isValidLinearModel(artifact.model, artifact.featureSize, artifact.classes.length);
  const fillPreviewEnabled =
    options.allowExperimentalPreview === true &&
    fillArtifactValid &&
    ((artifact.model === null && artifact.heuristic === 'energy-profile-v1') ||
      (artifact.model !== null && fillStatus === 'experimental'));
  const researchIcePreviewEnabled =
    options.allowExperimentalIcePreview === true &&
    isValidResearchIceArtifact(researchIceArtifact);

  // The ice amount artifact is a separate task. It must remain usable when
  // the fill-level artifact has not been trained yet; otherwise promoting an
  // ice model alone would silently leave the user-facing ice result untrained.
  if (
    !fillReady &&
    !fillPreviewEnabled &&
    !iceReady &&
    !researchIcePreviewEnabled
  ) {
    return unknownPrediction();
  }

  const analysisSampleRate = fillArtifactValid
    ? artifact.sampleRate
    : iceReady
      ? iceArtifact.sampleRate
      : researchIceArtifact.sampleRate;
  const analysisWindowSamples = fillArtifactValid
    ? artifact.windowSamples
    : iceReady
      ? iceArtifact.windowSamples
      : researchIceArtifact.windowSamples;
  const analysisHopSamples = fillArtifactValid
    ? artifact.hopSamples
    : iceReady
      ? iceArtifact.hopSamples
      : researchIceArtifact.hopSamples;
  const samples = resamplePcm(input, sourceRate, analysisSampleRate);
  const windows = recordingWindowsFor(
    samples,
    analysisWindowSamples,
    analysisHopSamples,
  );
  const features = windows.map(extractWindowFeatures);

  let fillClass: ShakeFillClass | null = null;
  let fillLevel: 0 | 50 | 100 | null = null;
  let fillConfidence: number | null = null;
  let measurementStatus: ShakeModelArtifact['status'] = 'untrained';
  let containsWater = false;
  if (fillPreviewEnabled && artifact.model === null) {
    const estimate = estimateExperimentalShake(input, sourceRate);
    fillClass = estimate.fillClass;
    fillLevel = estimate.fillLevel;
    fillConfidence = estimate.confidence;
    measurementStatus = 'experimental';
    containsWater = true;
  } else if (fillReady || fillPreviewEnabled) {
    const probabilities = averagedPrediction(features, artifact.model!);
    const bestIndex = probabilities.reduce(
      (best, value, index) => (value > probabilities[best] ? index : best),
      0,
    );
    fillClass = artifact.classes[bestIndex];
    fillConfidence = probabilities[bestIndex] ?? 0;
    fillLevel = fillClassToLevel(fillClass);
    measurementStatus = fillReady ? 'trained' : 'experimental';
    containsWater = true;
  }
  let iceAmount: IceAmountClass | null = null;
  let iceAmountConfidence: number | null = null;
  if (
    iceReady &&
    iceArtifact.model !== null
  ) {
    const iceProbabilities = averagedPrediction(features, iceArtifact.model);
    const iceIndex = iceProbabilities.reduce(
      (best, value, index) => (value > iceProbabilities[best] ? index : best),
      0,
    );
    iceAmount = iceArtifact.classes[iceIndex] ?? null;
    iceAmountConfidence = iceProbabilities[iceIndex] ?? null;
  } else if (researchIcePreviewEnabled && researchIceArtifact.model !== null) {
    const researchFeatures = features.map((featureVector, index) => [
      ...featureVector,
      ...extractTransientFeatures(
        windows[index],
        researchIceArtifact.sampleRate,
      ),
    ]);
    const researchProbabilities = averagedPrediction(
      researchFeatures,
      researchIceArtifact.model,
    );
    const researchIndex = researchProbabilities.reduce(
      (best, value, index) =>
        value > researchProbabilities[best] ? index : best,
      0,
    );
    iceAmount = (researchIceArtifact.classes[researchIndex] ?? null) as
      | IceAmountClass
      | null;
    // Research scores are intentionally capped below the production trust
    // threshold.  They are for pipeline/UX validation, never hydration math.
    iceAmountConfidence = Math.min(
      0.59,
      researchProbabilities[researchIndex] ?? 0,
    );
  }
  const exposedIceAmountStatus = iceReady
    ? 'trained'
    : researchIcePreviewEnabled
      ? 'experimental'
      : iceStatus;
  return {
    // A shake class describes the amount of content, including empty. Water
    // presence is not a separate task here, so it is not presented as a
    // positive/negative material claim by the UI.
    containsWater,
    waterConfidence: fillConfidence ?? 0,
    fillLevel,
    fillConfidence,
    icePresence:
      iceAmount !== null ? iceAmountClassToPresence(iceAmount) : null,
    iceConfidence: iceAmountConfidence,
    iceStatus: iceStatus === 'trained' ? 'trained' : 'untrained',
    iceAmount,
    iceAmountConfidence,
    iceAmountStatus: exposedIceAmountStatus,
    engine: 'typescript',
    measurementAction: 'shake',
    measurementStatus,
  };
}
