import { classifyPublicAudio } from '../../../publicAudioClassifier';
import {
  classifyShakeAudio,
  ShakeClassifierOptions,
} from '../../../publicShakeClassifier';
import {
  AudioClassifier,
  AudioInput,
} from '../../features/shared/application/ports';
import { ScanResult } from '../../features/scan/domain/scanResult';
import { normalizeScanResult } from '../../features/scan/domain/scanResult';

export class TypeScriptClassifierAdapter implements AudioClassifier {
  constructor(
    private readonly shakeOptions: ShakeClassifierOptions = {},
  ) {}

  async classify(input: AudioInput): Promise<ScanResult> {
    if (input.action === 'shake') {
      return normalizeScanResult(
        classifyShakeAudio(
          input.audio.samples,
          input.audio.sampleRate,
          this.shakeOptions,
        ),
        'shake',
      );
    }
    return normalizeScanResult(
      classifyPublicAudio(input.audio.samples, input.audio.sampleRate),
      'pour',
    );
  }
}
