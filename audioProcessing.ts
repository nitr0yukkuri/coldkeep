/* eslint-disable no-bitwise */

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type WavAudio = {
  samples: Float32Array;
  sampleRate: number;
};

function decodeBase64(base64: string): Uint8Array {
  let clean = base64.replace(/\s/g, '');
  while (clean.endsWith('=')) {
    clean = clean.slice(0, -1);
  }
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outputIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(clean[index]);
    const b = BASE64_ALPHABET.indexOf(clean[index + 1]);
    const c = BASE64_ALPHABET.indexOf(clean[index + 2]);
    const d = BASE64_ALPHABET.indexOf(clean[index + 3]);

    if (a < 0 || b < 0 || (index + 2 < clean.length && c < 0)) {
      throw new Error('Invalid base64 audio data');
    }

    bytes[outputIndex++] = (a << 2) | (b >> 4);
    if (index + 2 < clean.length) {
      bytes[outputIndex++] = ((b & 15) << 4) | (c >> 2);
    }
    if (index + 3 < clean.length) {
      if (d < 0) {
        throw new Error('Invalid base64 audio data');
      }
      bytes[outputIndex++] = ((c & 3) << 6) | d;
    }
  }

  return bytes;
}

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

export function parsePcm16Wav(base64: string): WavAudio {
  const bytes = decodeBase64(base64);
  if (
    bytes.length < 44 ||
    readFourCC(bytes, 0) !== 'RIFF' ||
    readFourCC(bytes, 8) !== 'WAVE'
  ) {
    throw new Error('Recording is not a WAV file');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = readFourCC(bytes, offset);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;

    if (chunkEnd > bytes.length) {
      throw new Error('WAV file contains a truncated chunk');
    }

    if (chunkId === 'fmt ') {
      if (chunkLength < 16) {
        throw new Error('WAV format chunk is invalid');
      }
      audioFormat = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataLength = chunkLength;
    }

    offset = chunkEnd + (chunkLength % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error('Recording must use 16-bit PCM WAV');
  }
  if (channels < 1 || sampleRate < 1 || dataOffset < 0 || dataLength < 2) {
    throw new Error('WAV file is missing audio metadata or samples');
  }

  const frameSize = channels * 2;
  const frameCount = Math.floor(dataLength / frameSize);
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let monoSample = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = dataOffset + frame * frameSize + channel * 2;
      monoSample += view.getInt16(sampleOffset, true) / 32768;
    }
    samples[frame] = monoSample / channels;
  }

  return { samples, sampleRate };
}

export function fitAudioToInput(
  samples: Float32Array,
  inputSize: number,
): Float32Array {
  if (!Number.isInteger(inputSize) || inputSize <= 0) {
    throw new Error('Model input size must be a positive integer');
  }

  const fitted = new Float32Array(inputSize);
  if (samples.length >= inputSize) {
    const start = Math.floor((samples.length - inputSize) / 2);
    fitted.set(samples.subarray(start, start + inputSize));
  } else {
    const start = Math.floor((inputSize - samples.length) / 2);
    fitted.set(samples, start);
  }
  return fitted;
}
