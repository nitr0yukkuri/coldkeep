/* eslint-disable no-bitwise */

import { fitAudioToInput, parsePcm16Wav } from '../audioProcessing';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = a * 65536 + b * 256 + c;
    result += BASE64_ALPHABET[Math.floor(combined / 262144) % 64];
    result += BASE64_ALPHABET[Math.floor(combined / 4096) % 64];
    result +=
      index + 1 < bytes.length
        ? BASE64_ALPHABET[Math.floor(combined / 64) % 64]
        : '=';
    result += index + 2 < bytes.length ? BASE64_ALPHABET[combined % 64] : '=';
  }
  return result;
}

function writeText(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function createStereoWav(): string {
  const sampleValues = [32767, -32768, 16384, 16384];
  const dataLength = sampleValues.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  writeText(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(bytes, 8, 'WAVE');
  writeText(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 64000, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeText(bytes, 36, 'data');
  view.setUint32(40, dataLength, true);
  sampleValues.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });
  return toBase64(bytes);
}

test('parses PCM16 WAV metadata and averages stereo channels', () => {
  const result = parsePcm16Wav(createStereoWav());

  expect(result.sampleRate).toBe(16000);
  expect(result.samples).toHaveLength(2);
  expect(result.samples[0]).toBeCloseTo(-1 / 65536, 5);
  expect(result.samples[1]).toBeCloseTo(0.5, 5);
});

test('rejects a file that is not WAV', () => {
  expect(() => parsePcm16Wav('bm90IGEgd2F2')).toThrow(
    'Recording is not a WAV file',
  );
});

test('rejects a WAV data chunk with an incomplete sample frame', () => {
  const bytes = new Uint8Array(
    // Decode the small fixture locally so the malformed length can be changed.
    (() => {
      const clean = createStereoWav();
      const output: number[] = [];
      for (let index = 0; index < clean.length; index += 4) {
        const a = BASE64_ALPHABET.indexOf(clean[index]);
        const b = BASE64_ALPHABET.indexOf(clean[index + 1]);
        const c = BASE64_ALPHABET.indexOf(clean[index + 2]);
        const d = BASE64_ALPHABET.indexOf(clean[index + 3]);
        output.push((a << 2) | (b >> 4));
        if (c >= 0) {
          output.push(((b & 15) << 4) | (c >> 2));
        }
        if (d >= 0) {
          output.push(((c & 3) << 6) | d);
        }
      }
      return output;
    })(),
  );
  new DataView(bytes.buffer).setUint32(40, 7, true);
  expect(() => parsePcm16Wav(toBase64(bytes))).toThrow(
    'incomplete sample frame',
  );
});

test('center-crops long audio deterministically', () => {
  const result = fitAudioToInput(new Float32Array([1, 2, 3, 4, 5]), 3);

  expect(Array.from(result)).toEqual([2, 3, 4]);
});

test('centers short audio and zero-pads it', () => {
  const result = fitAudioToInput(new Float32Array([1, 2]), 6);

  expect(Array.from(result)).toEqual([0, 0, 1, 2, 0, 0]);
});
