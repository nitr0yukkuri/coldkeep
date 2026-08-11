import { NativeModules } from 'react-native';
import * as RNFS from 'react-native-fs';

import {
  AudioRecorder,
  RecordingRef,
} from '../../features/shared/application/ports';

type NativeIOSRecorder = {
  start(): Promise<string>;
  stop(): Promise<string>;
};

function getNativeRecorder(): NativeIOSRecorder {
  const recorder = NativeModules.ColdKeepAudioRecorder as
    | NativeIOSRecorder
    | undefined;
  if (!recorder) {
    throw new Error('iOS WAV recorder is unavailable');
  }
  return recorder;
}

function localPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

export class IOSWavRecorderAdapter implements AudioRecorder {
  async start(): Promise<RecordingRef> {
    return { uri: await getNativeRecorder().start() };
  }

  async stop(): Promise<RecordingRef> {
    return { uri: await getNativeRecorder().stop() };
  }

  async cleanup(recording: RecordingRef): Promise<void> {
    await RNFS.unlink(localPath(recording.uri)).catch(() => undefined);
  }
}
