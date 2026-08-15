/**
 * The public pour model normalizes each window before classification. Without
 * a front-door signal check, microphone silence or a disconnected input can
 * therefore be stretched into a high-confidence water prediction.
 *
 * The thresholds are deliberately below the quietest verified ACM-S2 water
 * recording (roughly 0.004 RMS after PCM16 normalization) while rejecting
 * zero/near-zero PCM. They are an input-quality gate, not a classifier.
 */
export const MIN_SCAN_SIGNAL_RMS = 0.0025;
export const MIN_SCAN_SIGNAL_PEAK = 0.02;

export function hasUsableScanSignal(samples: Float32Array): boolean {
  if (samples.length === 0) {
    return false;
  }

  let mean = 0;
  let peak = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      return false;
    }
    mean += sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  mean /= samples.length;

  let squared = 0;
  for (const sample of samples) {
    const centered = sample - mean;
    squared += centered * centered;
  }
  const rms = Math.sqrt(squared / samples.length);
  return rms >= MIN_SCAN_SIGNAL_RMS && peak >= MIN_SCAN_SIGNAL_PEAK;
}
