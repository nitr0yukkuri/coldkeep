import { NativeModules } from 'react-native';

import { MicrophonePermission } from '../../features/shared/application/ports';

type NativeIOSRecorder = {
  requestPermission(): Promise<boolean>;
};

export class IOSMicrophonePermission implements MicrophonePermission {
  async ensure(): Promise<boolean> {
    const recorder = NativeModules.ColdKeepAudioRecorder as
      | NativeIOSRecorder
      | undefined;
    if (!recorder?.requestPermission) {
      throw new Error('iOS microphone permission module is unavailable');
    }
    return recorder.requestPermission();
  }
}
