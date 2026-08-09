import { PermissionsAndroid, Platform } from 'react-native';

import { MicrophonePermission } from '../../features/shared/application/ports';

export class AndroidMicrophonePermission implements MicrophonePermission {
  async ensure(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (Platform.Version < 23) {
      return true;
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'ColdKeep microphone access',
        message: '水筒の音を録音するためにマイクを使用します。',
        buttonPositive: '許可',
        buttonNegative: '拒否',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
}
