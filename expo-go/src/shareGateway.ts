import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';

import type { ShareGateway } from '../../src/features/shared/application/ports';

/** Expo Go-compatible file sharing; unlike RN Share it sends a real file. */
export class ExpoShareGateway implements ShareGateway {
  async shareText(title: string, text: string): Promise<void> {
    await Share.share({ title, message: text });
  }

  async shareFile(title: string, uri: string): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('ファイル共有がこの端末で利用できません');
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/zip',
      dialogTitle: title,
      UTI: 'public.zip-archive',
    });
  }
}
