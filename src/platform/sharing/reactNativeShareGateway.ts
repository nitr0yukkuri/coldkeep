import { Share } from 'react-native';

import { ShareGateway } from '../../features/shared/application/ports';

export class ReactNativeShareGateway implements ShareGateway {
  async shareText(title: string, text: string): Promise<void> {
    await Share.share({ title, message: text });
  }
}
