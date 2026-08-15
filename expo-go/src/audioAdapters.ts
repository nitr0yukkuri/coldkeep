import {
  AudioStream,
  AudioStreamBuffer,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

import type {
  AudioReader,
  AudioRecorder,
  MicrophonePermission,
  RecordingRef,
} from '../../src/features/shared/application/ports';
import { PcmCaptureAccumulator } from '../../src/platform/audio/pcmCapture';

export class ExpoMicrophonePermission implements MicrophonePermission {
  async ensure(): Promise<boolean> {
    const permission = await requestRecordingPermissionsAsync();
    return permission.granted;
  }
}

export class ExpoPcmRecorderAdapter implements AudioRecorder {
  private readonly accumulator = new PcmCaptureAccumulator();

  private recordingId = 0;

  private active = false;

  constructor(private readonly stream: AudioStream) {}

  append(buffer: AudioStreamBuffer): void {
    this.accumulator.append({
      data: buffer.data,
      channels: buffer.channels,
      sampleRate: buffer.sampleRate,
      encoding: 'int16',
    });
  }

  async start(): Promise<RecordingRef> {
    if (this.active) {
      throw new Error('Recording is already in progress');
    }
    this.accumulator.start();
    try {
      await this.stream.start();
      this.active = true;
      this.recordingId += 1;
      return { uri: `memory://expo-recording-${this.recordingId}` };
    } catch (error) {
      this.accumulator.abort();
      throw error;
    }
  }

  async stop(): Promise<RecordingRef> {
    if (!this.active) {
      throw new Error('No recording is in progress');
    }
    this.active = false;
    try {
      this.stream.stop();
      // AudioStream.stop() is synchronous, but the final onBuffer event can be
      // queued on the JS event loop. A macrotask yield lets that event arrive
      // before the accumulator is finalized, avoiding truncated recordings.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const audio = this.accumulator.finish();
      return {
        uri: `memory://expo-recording-${this.recordingId}`,
        audio,
      };
    } catch (error) {
      this.accumulator.abort();
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // The returned RecordingRef owns only a JS Float32Array. Releasing the
    // caller's reference is sufficient for GC; native stream resources are
    // released by stop().
  }
}

export class ExpoAudioReader implements AudioReader {
  async read(recording: RecordingRef) {
    if (!recording.audio) {
      throw new Error('Expo recording does not contain PCM audio');
    }
    return recording.audio;
  }
}
