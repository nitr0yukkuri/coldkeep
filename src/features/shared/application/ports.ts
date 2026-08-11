import {
  CollectionLabels,
  CollectionRecord,
} from '../../collection/domain/collection';
import { ScanResult } from '../../scan/domain/scanResult';

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
}

export interface ShareGateway {
  shareText(title: string, text: string): Promise<void>;
}
