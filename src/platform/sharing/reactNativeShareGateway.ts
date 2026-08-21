import { Share } from 'react-native';

import { ShareGateway } from '../../features/shared/application/ports';

export class ReactNativeShareGateway implements ShareGateway {
  async shareText(title: string, text: string): Promise<void> {
    await Share.share({ title, message: text });
  }

  async shareFile(title: string, uri: string): Promise<void> {
    // iOS treats `url` as a shareable file attachment. Android versions of
    // React Native may expose only the text field, so include the URI as a
    // fallback rather than silently reporting success with no payload.
    await Share.share({ title, url: uri, message: uri });
  }
}
