import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import {
  COLLECTION_CSV_HEADER,
  CollectionLabels,
  CollectionRecord,
  collectionRecordToCsv,
  createRecordingId,
} from '../../src/features/collection/domain/collection';
import type {
  DatasetRepository,
  PcmAudio,
  RecordingRef,
} from '../../src/features/shared/application/ports';
import { encodePcm16WavBase64 } from '../../src/platform/audio/pcmWav';

function documentRoot(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable');
  }
  return `${FileSystem.documentDirectory}coldkeep-dataset/`;
}

export class ExpoDatasetRepository implements DatasetRepository {
  async save(
    _recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    const recordedAt = new Date();
    const recordingId = createRecordingId(labels, recordedAt);
    const root = documentRoot();
    const audioDirectory = `${root}audio/`;
    const metadataDirectory = `${root}metadata/`;
    const audioFilename = `audio/${recordingId}.wav`;
    const manifestUri = `${root}manifest.csv`;
    const record: CollectionRecord = {
      ...labels,
      recordingId,
      recordedAt: recordedAt.toISOString(),
      audioFilename,
      sampleRateHz: audio.sampleRate,
      channels: 1,
      bitDepth: 16,
      durationSeconds: audio.samples.length / audio.sampleRate,
      platform: Platform.OS,
    };

    await FileSystem.makeDirectoryAsync(audioDirectory, { intermediates: true });
    await FileSystem.makeDirectoryAsync(metadataDirectory, { intermediates: true });
    await FileSystem.writeAsStringAsync(
      `${root}${audioFilename}`,
      encodePcm16WavBase64(audio),
      { encoding: FileSystem.EncodingType.Base64 },
    );
    await FileSystem.writeAsStringAsync(
      `${metadataDirectory}${recordingId}.json`,
      JSON.stringify(record, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    const manifestInfo = await FileSystem.getInfoAsync(manifestUri);
    const existing = manifestInfo.exists
      ? await FileSystem.readAsStringAsync(manifestUri, {
          encoding: FileSystem.EncodingType.UTF8,
        })
      : COLLECTION_CSV_HEADER;
    await FileSystem.writeAsStringAsync(
      manifestUri,
      `${existing.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    return record;
  }

  async readManifest(): Promise<string | null> {
    const manifestUri = `${documentRoot()}manifest.csv`;
    const info = await FileSystem.getInfoAsync(manifestUri);
    if (!info.exists) {
      return null;
    }
    return FileSystem.readAsStringAsync(manifestUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}
