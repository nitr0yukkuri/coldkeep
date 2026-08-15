import {
  AudioReader,
  DatasetRepository,
  RecordingRef,
} from '../../shared/application/ports';
import { hasUsableScanSignal } from '../../scan/domain/audioQuality';
import { CollectionLabels, CollectionRecord } from '../domain/collection';

export class CollectSampleUseCase {
  constructor(
    private readonly reader: AudioReader,
    private readonly repository: DatasetRepository,
  ) {}

  async execute(
    recording: RecordingRef,
    labels: CollectionLabels,
  ): Promise<CollectionRecord> {
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
        '有効な音声信号がありません。ラベルに対応する音を録音してください',
      );
    }
    return this.repository.save(recording, labels, audio);
  }
}
