import { NativeModules } from 'react-native';

import {
  AudioClassifier,
  AudioInput,
} from '../../features/shared/application/ports';
import {
  normalizeScanResult,
  ScanResultInput,
} from '../../features/scan/domain/scanResult';

type NativeRustClassifier = {
  classifyWav(uri: string): Promise<ScanResultInput>;
  classifyShakeWav?(uri: string): Promise<ScanResultInput>;
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
      const result = normalizeScanResult(
        await classifier.classifyShakeWav(input.recording.uri),
        'shake',
      );
      // The native path intentionally has no heuristic preview. Let the
      // configured TypeScript adapter provide the generic experimental
      // estimate when the fill artifact is still untrained, unless the
      // independently trained ice artifact already produced a useful result.
      if (
        result.measurementStatus === 'untrained' &&
        result.iceAmountStatus !== 'trained'
      ) {
        throw new Error('Rust shake model is untrained; use experimental fallback');
      }
      return result;
    }
    return normalizeScanResult(
      await classifier.classifyWav(input.recording.uri),
      'pour',
    );
  }
}
