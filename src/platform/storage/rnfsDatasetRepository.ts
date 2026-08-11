import { Platform } from 'react-native';
import * as RNFS from 'react-native-fs';

import {
  COLLECTION_CSV_HEADER,
  CollectionLabels,
  CollectionRecord,
  collectionRecordToCsv,
  createRecordingId,
} from '../../features/collection/domain/collection';
import {
  DatasetRepository,
  RecordingRef,
} from '../../features/shared/application/ports';
import { PcmAudio } from '../../features/shared/application/ports';

function localPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function collectionRoot(): string {
  return `${RNFS.DocumentDirectoryPath}/coldkeep-dataset/`;
}

export class RnfsDatasetRepository implements DatasetRepository {
  async save(
    recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    const recordedAt = new Date();
    const recordingId = createRecordingId(labels, recordedAt);
    const root = collectionRoot();
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

    await RNFS.mkdir(audioDirectory);
    await RNFS.mkdir(metadataDirectory);
    await RNFS.copyFile(localPath(recording.uri), `${root}${audioFilename}`);
    await RNFS.writeFile(
      `${metadataDirectory}${recordingId}.json`,
      JSON.stringify(record, null, 2),
      'utf8',
    );
    const manifestExists = await RNFS.exists(manifestUri);
    const existing = manifestExists
      ? await RNFS.readFile(manifestUri, 'utf8')
      : COLLECTION_CSV_HEADER;
    await RNFS.writeFile(
      manifestUri,
      `${existing.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
      'utf8',
    );
    return record;
  }

  async readManifest(): Promise<string | null> {
    const manifestUri = `${collectionRoot()}manifest.csv`;
    if (!(await RNFS.exists(manifestUri))) {
      return null;
    }
    return RNFS.readFile(manifestUri, 'utf8');
  }
}
