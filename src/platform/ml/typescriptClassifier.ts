import { classifyPublicAudio } from '../../../publicAudioClassifier';
import {
  AudioClassifier,
  AudioInput,
} from '../../features/shared/application/ports';
import { ScanResult } from '../../features/scan/domain/scanResult';

export class TypeScriptClassifierAdapter implements AudioClassifier {
  async classify(input: AudioInput): Promise<ScanResult> {
    return classifyPublicAudio(input.audio.samples, input.audio.sampleRate);
  }
}
