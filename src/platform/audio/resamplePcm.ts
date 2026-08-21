/**
 * PCM resampling shared by the native and Expo Go paths.
 *
 * Keeping this in the platform/audio layer ensures that an in-memory Expo
 * recording is fed into the exact same feature extractor as a WAV file. The
 * downsampling filter mirrors the Python training pipeline.
 */
export function resamplePcm(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
    throw new Error('Source sample rate must be positive');
  }
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    throw new Error('Target sample rate must be positive');
  }
  if (sourceRate === targetRate) {
    return samples;
  }
  if (samples.length === 0) {
    return new Float32Array(0);
  }
  const filtered =
    targetRate < sourceRate
      ? lowPassFilter(samples, sourceRate, targetRate)
      : samples;
  const length = Math.max(
    1,
    Math.round((samples.length * targetRate) / sourceRate),
  );
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const source = (index * sourceRate) / targetRate;
    const left = Math.min(Math.floor(source), filtered.length - 1);
    const right = Math.min(left + 1, filtered.length - 1);
    const fraction = source - left;
    output[index] =
      filtered[left] * (1 - fraction) + filtered[right] * fraction;
  }
  return output;
}

/** Matches ml/audio_features.py: a 127-tap Hamming-windowed low-pass before
 * downsampling. Without this step high-frequency phone noise aliases into the
 * mel bands and the deployed/native path no longer matches training. */
function lowPassFilter(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  const taps = 127;
  const cutoff = 0.94 * (targetRate / sourceRate);
  const center = (taps - 1) / 2;
  const kernel = new Float64Array(taps);
  let kernelSum = 0;
  for (let tap = 0; tap < taps; tap += 1) {
    const position = tap - center;
    const sinc =
      position === 0
        ? 1
        : Math.sin(Math.PI * cutoff * position) / (Math.PI * cutoff * position);
    const value =
      cutoff *
      sinc *
      (0.54 - 0.46 * Math.cos((2 * Math.PI * tap) / (taps - 1)));
    kernel[tap] = value;
    kernelSum += value;
  }
  for (let tap = 0; tap < taps; tap += 1) {
    kernel[tap] /= kernelSum;
  }
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    let sum = 0;
    for (let tap = 0; tap < taps; tap += 1) {
      const sourceIndex = index + tap - center;
      if (sourceIndex >= 0 && sourceIndex < samples.length) {
        sum += samples[sourceIndex] * kernel[tap];
      }
    }
    output[index] = sum;
  }
  return output;
}
