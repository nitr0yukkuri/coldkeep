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
};

type ShakeIceAmountArtifact = {
  status: 'trained' | 'experimental' | 'untrained';
  sampleRate: number;
  windowSamples: number;
  hopSamples: number;
  featureSize: number;
  classes: IceAmountClass[];
  model: LinearModel | null;
};

const artifact = shakeModelArtifact as ShakeModelArtifact;
const iceArtifact = shakeIceAmountArtifact as ShakeIceAmountArtifact;

function unknownPrediction(): PublicAudioPrediction {
  const prediction = unknownShakePrediction(artifact.status);
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
    iceAmountStatus: iceArtifact.status,
    engine: 'typescript',
    measurementAction: 'shake',
    measurementStatus: prediction.status,
  };
}

/**
 * Classify a shake recording only when a gated phone/water-bottle artifact is
 * present. The checked-in artifact is intentionally untrained so a public
 * pour model can never be silently reused for a different physical action.
 */
export function classifyShakeAudio(
  input: Float32Array,
  sourceRate: number,
): PublicAudioPrediction {
  if (
    artifact.status === 'untrained' ||
    artifact.model === null ||
    artifact.classes.length !== 3
  ) {
    return unknownPrediction();
  }
  const samples = resamplePcm(input, sourceRate, artifact.sampleRate);
  const features = recordingWindows(samples).map(extractWindowFeatures);
  const probabilities = averagedPrediction(features, artifact.model);
  const bestIndex = probabilities.reduce(
    (best, value, index) => (value > probabilities[best] ? index : best),
    0,
  );
  const fillClass = artifact.classes[bestIndex];
  const confidence = probabilities[bestIndex] ?? 0;
  const fillLevel = fillClassToLevel(fillClass);
  let iceAmount: IceAmountClass | null = null;
  let iceAmountConfidence: number | null = null;
  if (
    iceArtifact.status !== 'untrained' &&
    iceArtifact.model !== null &&
    iceArtifact.classes.length === 3 &&
    iceArtifact.sampleRate === artifact.sampleRate
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
    iceStatus: iceArtifact.status === 'trained' ? 'trained' : 'untrained',
    iceAmount,
    iceAmountConfidence,
    iceAmountStatus: iceArtifact.status,
    engine: 'typescript',
    measurementAction: 'shake',
    measurementStatus: artifact.status,
  };
}
