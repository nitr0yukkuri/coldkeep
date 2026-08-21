import { NativeModules } from 'react-native';

import {
  AudioClassifier,
  AudioInput,
} from '../../features/shared/application/ports';
import { normalizeScanResult } from '../../features/scan/domain/scanResult';

type NativeRustClassifier = {
  classifyWav(uri: string): Promise<ReturnType<typeof normalizeScanResult>>;
  classifyShakeWav?(uri: string): Promise<ReturnType<typeof normalizeScanResult>>;
};

export class RustClassifierAdapter implements AudioClassifier {
  async classify(input: AudioInput) {
    const classifier = NativeModules.RustAudioClassifier as
      | NativeRustClassifier
      | undefined;
    if (!classifier) {
      throw new Error('Rust inference is unavailable');
    }
    if (input.action === 'shake') {
      if (!classifier.classifyShakeWav) {
        throw new Error('Rust shake inference is unavailable');
      }
      return normalizeScanResult(
        await classifier.classifyShakeWav(input.recording.uri),
      );
    }
    return normalizeScanResult(await classifier.classifyWav(input.recording.uri));
  }
}
