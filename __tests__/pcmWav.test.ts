import { parsePcm16Wav } from '../audioProcessing';
import { encodePcm16WavBase64 } from '../src/platform/audio/pcmWav';
import { resamplePcm } from '../src/platform/audio/resamplePcm';
import { PcmCaptureAccumulator } from '../src/platform/audio/pcmCapture';

test('encodes Expo PCM into a WAV that the native reader can parse', () => {
  const audio = {
    sampleRate: 16_000,
    samples: new Float32Array([-1, -0.5, 0, 0.5, 1]),
  };

  const parsed = parsePcm16Wav(encodePcm16WavBase64(audio));

  expect(parsed.sampleRate).toBe(16_000);
  expect(Array.from(parsed.samples)).toEqual([
    -1,
    expect.closeTo(-0.5, 1 / 32768),
    0,
    expect.closeTo(0.5, 1 / 32768),
    expect.closeTo(1, 1 / 32768),
  ]);
});

test('resamples in-memory PCM with the same linear interpolation used by inference', () => {
  const samples = new Float32Array([0, 1, 0]);
  const output = resamplePcm(samples, 3, 6);

  expect(Array.from(output)).toEqual([0, 0.5, 1, 0.5, 0, 0]);
});

test('rejects invalid sample rates before writing a WAV', () => {
  expect(() =>
    encodePcm16WavBase64({ sampleRate: 0, samples: new Float32Array([0]) }),
  ).toThrow('positive integer');
});

test('accumulates int16 stereo chunks as canonical mono PCM', () => {
  const accumulator = new PcmCaptureAccumulator();
  accumulator.start();
  const values = new Int16Array([32767, -32768, 0, 0]);
  accumulator.append({
    data: values.buffer,
    channels: 2,
    sampleRate: 16_000,
    encoding: 'int16',
  });

  const audio = accumulator.finish();

  expect(audio.sampleRate).toBe(16_000);
  expect(audio.samples.length).toBe(2);
  expect(audio.samples[0]).toBeCloseTo(-1 / 65536, 5);
  expect(audio.samples[1]).toBe(0);
});

test('aborting a PCM capture releases the accumulator for retry', () => {
  const accumulator = new PcmCaptureAccumulator();
  accumulator.start();
  accumulator.abort();

  expect(() => accumulator.finish()).toThrow('not in progress');
  expect(() => accumulator.start()).not.toThrow();
  accumulator.abort();
});
