import type { PcmAudio } from '../../features/shared/application/ports';
import { resamplePcm } from './resamplePcm';

export type PcmCaptureEncoding = 'float32' | 'int16';

export type PcmCaptureChunk = {
  data: ArrayBuffer;
  channels: number;
  sampleRate: number;
  encoding: PcmCaptureEncoding;
};

export const MAX_CAPTURE_SECONDS = 10;

type StoredChunk = {
  samples: Float32Array;
  sampleRate: number;
};

/**
 * Accumulates Expo AudioStream buffers without coupling the domain to Expo.
 * The output is always the same 16 kHz mono representation used by the
 * public classifier and by the native WAV recorder.
 */
export class PcmCaptureAccumulator {
  private chunks: StoredChunk[] = [];

  private capturing = false;

  private capturedSeconds = 0;

  start(): void {
    if (this.capturing) {
      throw new Error('PCM capture is already in progress');
    }
    this.chunks = [];
    this.capturedSeconds = 0;
    this.capturing = true;
  }

  append(chunk: PcmCaptureChunk): void {
    if (!this.capturing) {
      return;
    }
    if (!Number.isInteger(chunk.channels) || chunk.channels < 1) {
      throw new Error('PCM capture must contain at least one channel');
    }
    if (!Number.isFinite(chunk.sampleRate) || chunk.sampleRate <= 0) {
      throw new Error('PCM capture sample rate must be positive');
    }

    const values =
      chunk.encoding === 'int16'
        ? this.decodeInt16(chunk.data)
        : this.decodeFloat32(chunk.data);
    const frameCount = Math.floor(values.length / chunk.channels);
    const mono = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sum = 0;
      for (let channel = 0; channel < chunk.channels; channel += 1) {
        sum += values[frame * chunk.channels + channel];
      }
      mono[frame] = sum / chunk.channels;
    }
    if (mono.length > 0 && this.capturedSeconds < MAX_CAPTURE_SECONDS) {
      const remainingFrames = Math.floor(
        (MAX_CAPTURE_SECONDS - this.capturedSeconds) * chunk.sampleRate,
      );
      const bounded = mono.slice(0, Math.min(mono.length, remainingFrames));
      if (bounded.length > 0) {
        this.chunks.push({ samples: bounded, sampleRate: chunk.sampleRate });
        this.capturedSeconds += bounded.length / chunk.sampleRate;
      }
    }
  }

  finish(): PcmAudio {
    if (!this.capturing) {
      throw new Error('PCM capture is not in progress');
    }
    this.capturing = false;
    this.capturedSeconds = 0;
    const chunks = this.chunks;
    this.chunks = [];
    if (chunks.length === 0) {
      throw new Error('No PCM samples captured');
    }

    const sourceRate = chunks[0].sampleRate;
    const resampled = chunks.map(chunk =>
      chunk.sampleRate === sourceRate
        ? chunk.samples
        : resamplePcm(chunk.samples, chunk.sampleRate, sourceRate),
    );
    const sourceSamples = new Float32Array(
      resampled.reduce((total, samples) => total + samples.length, 0),
    );
    let offset = 0;
    for (const samples of resampled) {
      sourceSamples.set(samples, offset);
      offset += samples.length;
    }
    return {
      samples: resamplePcm(sourceSamples, sourceRate, 16_000),
      sampleRate: 16_000,
    };
  }

  abort(): void {
    this.capturing = false;
    this.chunks = [];
    this.capturedSeconds = 0;
  }

  private decodeInt16(data: ArrayBuffer): Float32Array {
    if (data.byteLength % 2 !== 0) {
      throw new Error('PCM16 capture contains an incomplete sample');
    }
    const values = new Int16Array(data);
    const output = new Float32Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      output[index] = values[index] / 32768;
    }
    return output;
  }

  private decodeFloat32(data: ArrayBuffer): Float32Array {
    if (data.byteLength % 4 !== 0) {
      throw new Error('Float32 capture contains an incomplete sample');
    }
    return new Float32Array(data);
  }
}
