/**
 * Linear PCM resampling shared by the native and Expo Go paths.
 *
 * Keeping this in the platform/audio layer ensures that an in-memory Expo
 * recording is fed into the exact same feature extractor as a WAV file.
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
  const length = Math.max(1, Math.round((samples.length * targetRate) / sourceRate));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const source = (index * sourceRate) / targetRate;
    const left = Math.min(Math.floor(source), samples.length - 1);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = source - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}
