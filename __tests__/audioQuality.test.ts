import {
  hasUsableScanSignal,
  MIN_SCAN_SIGNAL_PEAK,
  MIN_SCAN_SIGNAL_RMS,
} from '../src/features/scan/domain/audioQuality';

function sine(amplitude: number, length = 16_000): Float32Array {
  return Float32Array.from({ length }, (_, index) =>
    amplitude * Math.sin((2 * Math.PI * 700 * index) / length),
  );
}

test('rejects empty, silent, and non-finite input', () => {
  expect(hasUsableScanSignal(new Float32Array())).toBe(false);
  expect(hasUsableScanSignal(new Float32Array(16_000))).toBe(false);

  const invalid = sine(0.05);
  invalid[100] = Number.NaN;
  expect(hasUsableScanSignal(invalid)).toBe(false);
});

test('rejects a DC offset even when the absolute peak is large', () => {
  const offset = Float32Array.from({ length: 16_000 }, () => 0.1);
  expect(Math.max(...offset.map(Math.abs))).toBeGreaterThan(MIN_SCAN_SIGNAL_PEAK);
  expect(hasUsableScanSignal(offset)).toBe(false);
});

test('rejects a quiet signal below the calibrated RMS floor', () => {
  const quiet = sine(MIN_SCAN_SIGNAL_RMS / 2);
  expect(hasUsableScanSignal(quiet)).toBe(false);
});

test('accepts a finite signal with usable RMS and peak', () => {
  const signal = sine(0.05);
  expect(hasUsableScanSignal(signal)).toBe(true);
});
