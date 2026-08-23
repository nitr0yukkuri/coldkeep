import { NativeModules, Platform, Share } from 'react-native';

import { ShareGateway } from '../../features/shared/application/ports';

export class ReactNativeShareGateway implements ShareGateway {
  async shareText(title: string, text: string): Promise<void> {
    await Share.share({ title, message: text });
  }

  async shareFile(title: string, uri: string): Promise<void> {
    if (Platform.OS === 'android') {
      const fileShare = NativeModules.ColdKeepFileShare as
        | { shareZip(path: string, shareTitle: string): Promise<void> }
        | undefined;
      if (!fileShare?.shareZip) {
        throw new Error('Android file sharing is unavailable');
      }
      await fileShare.shareZip(uri, title);
      return;
    }

    // React Native's `url` attachment option is supported on iOS. Android
    // uses the dedicated FileProvider bridge above so a private file is not
    // downgraded to a plain text path.
    await Share.share({ title, url: uri });
  }
}
