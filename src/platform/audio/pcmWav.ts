/* eslint-disable no-bitwise */

import type { PcmAudio } from '../../features/shared/application/ports';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const combined = (first << 16) | (second << 8) | third;
    output += BASE64_ALPHABET[(combined >> 18) & 63];
    output += BASE64_ALPHABET[(combined >> 12) & 63];
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(combined >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64_ALPHABET[combined & 63] : '=';
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** Encode the canonical mono float PCM representation as a 16-bit WAV file. */
export function encodePcm16WavBase64(audio: PcmAudio): string {
  if (!Number.isInteger(audio.sampleRate) || audio.sampleRate <= 0) {
    throw new Error('Audio sample rate must be a positive integer');
  }
  const dataLength = audio.samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < audio.samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, audio.samples[index]));
    const pcm = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    view.setInt16(44 + index * 2, pcm, true);
  }
  return encodeBase64(bytes);
}
