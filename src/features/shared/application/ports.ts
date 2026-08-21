import {
  CollectionLabels,
  CollectionRecord,
} from '../../collection/domain/collection';
import { ScanResult } from '../../scan/domain/scanResult';
import { ScanAction } from '../../scan/domain/scanResult';
import { HydrationState } from '../../hydration/domain/hydration';

export type PcmAudio = {
  samples: Float32Array;
  sampleRate: number;
};

export type RecordingRef = {
  uri: string;
  /**
   * Expo Go can capture PCM in memory because it cannot load our custom
   * native WAV recorder. Native adapters leave this unset and continue to
   * use the file URI path.
   */
  audio?: PcmAudio;
};

export type AudioInput = {
  recording: RecordingRef;
  audio: PcmAudio;
  /** The physical action the caller asked the classifier to measure. */
  action?: ScanAction;
};

export interface MicrophonePermission {
  ensure(): Promise<boolean>;
}

export interface AudioRecorder {
  start(): Promise<RecordingRef>;
  stop(): Promise<RecordingRef>;
  cleanup(recording: RecordingRef): Promise<void>;
}

export interface AudioReader {
  read(recording: RecordingRef): Promise<PcmAudio>;
}

export interface AudioClassifier {
  classify(input: AudioInput): Promise<ScanResult>;
}

export interface DatasetRepository {
  save(
    recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord>;
  readManifest(): Promise<string | null>;
  /** Creates a portable archive containing manifest, metadata, and WAV files. */
  createExportArchive(): Promise<string>;
}

export interface ShareGateway {
  shareText(title: string, text: string): Promise<void>;
  shareFile(title: string, uri: string): Promise<void>;
}

export interface HydrationRepository {
  load(): Promise<HydrationState | null>;
  save(state: HydrationState): Promise<void>;
}
