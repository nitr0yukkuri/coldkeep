import {
  AudioClassifier,
  AudioReader,
  RecordingRef,
} from '../../shared/application/ports';
import { hasUsableScanSignal } from '../domain/audioQuality';
import { normalizeScanResult, ScanResult } from '../domain/scanResult';

export class ScanBottleUseCase {
  constructor(
    private readonly reader: AudioReader,
    private readonly classifiers: readonly AudioClassifier[],
  ) {}

  async execute(recording: RecordingRef): Promise<ScanResult> {
    const audio = await this.reader.read(recording);
    if (
      audio.samples.length === 0 ||
      !Number.isFinite(audio.sampleRate) ||
      audio.sampleRate <= 0
    ) {
      throw new Error('Recording contains invalid PCM audio');
    }
    const durationSeconds = audio.samples.length / audio.sampleRate;
    if (durationSeconds < 1) {
      throw new Error('Recording must be at least one second');
    }
    if (!hasUsableScanSignal(audio.samples)) {
      throw new Error(
        '有効な音声信号がありません。水筒へ水を注ぐ音を録音してください',
      );
    }

    let lastError: unknown = null;
    for (const classifier of this.classifiers) {
      try {
        return normalizeScanResult(
          await classifier.classify({ recording, audio }),
        );
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('No audio classifier is available');
  }
}
