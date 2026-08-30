import {
  AudioClassifier,
  AudioReader,
  RecordingRef,
} from '../../shared/application/ports';
import { hasUsableScanSignal } from '../domain/audioQuality';
import {
  normalizeScanResult,
  ScanResultNormalizationOptions,
  ScanAction,
  ScanResult,
} from '../domain/scanResult';

export const DEFAULT_SCAN_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}
export class ScanBottleUseCase {
  constructor(
    private readonly reader: AudioReader,
    private readonly classifiers: readonly AudioClassifier[],
    private readonly action: ScanAction = 'pour',
    private readonly normalizationOptions: ScanResultNormalizationOptions = {},
    private readonly timeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
  ) {}

  async execute(recording: RecordingRef): Promise<ScanResult> {
    return withTimeout(
      this.executeInternal(recording),
      this.timeoutMs,
      '音声解析がタイムアウトしました。もう一度お試しください',
    );
  }

  private async executeInternal(recording: RecordingRef): Promise<ScanResult> {
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
        `有効な音声信号がありません。${
          this.action === 'shake' ? '水筒を振る音' : '水筒へ水を注ぐ音'
        }を録音してください`,
      );
    }

    let lastError: unknown = null;
    for (const classifier of this.classifiers) {
      try {
        return normalizeScanResult(
          await classifier.classify({ recording, audio, action: this.action }),
          this.action,
          this.normalizationOptions,
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
