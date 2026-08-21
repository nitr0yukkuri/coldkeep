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
import { createStoreZipBase64 } from '../../src/platform/archive/storeZip';
import { writeTextAtomically } from '../../src/platform/storage/atomicTextFile';

function documentRoot(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable');
  }
  return `${FileSystem.documentDirectory}coldkeep-dataset/`;
}

export class ExpoDatasetRepository implements DatasetRepository {
  private saveQueue: Promise<void> = Promise.resolve();

  async save(
    _recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    const operation = this.saveInternal(labels, audio);
    this.saveQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async saveInternal(
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    await this.saveQueue;
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

    await FileSystem.makeDirectoryAsync(audioDirectory, {
      intermediates: true,
    });
    await FileSystem.makeDirectoryAsync(metadataDirectory, {
      intermediates: true,
    });
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
    await writeTextAtomically(
      manifestUri,
      `${existing.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
      {
        exists: async candidate =>
          (await FileSystem.getInfoAsync(candidate)).exists,
        readFile: candidate =>
          FileSystem.readAsStringAsync(candidate, {
            encoding: FileSystem.EncodingType.UTF8,
          }),
        writeFile: (candidate, contents) =>
          FileSystem.writeAsStringAsync(candidate, contents, {
            encoding: FileSystem.EncodingType.UTF8,
          }),
        moveFile: (from, to) => FileSystem.moveAsync({ from, to }),
        unlink: candidate =>
          FileSystem.deleteAsync(candidate, { idempotent: true }),
      },
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

  async createExportArchive(): Promise<string> {
    const root = documentRoot();
    const manifestUri = `${root}manifest.csv`;
    if (!(await FileSystem.getInfoAsync(manifestUri)).exists) {
      throw new Error('No recordings have been saved yet');
    }
    const files = await this.readFiles(root, root);
    const archiveDirectory = `${root}exports/`;
    await FileSystem.makeDirectoryAsync(archiveDirectory, {
      intermediates: true,
    });
    const archiveUri = `${archiveDirectory}coldkeep-dataset-${Date.now()}.zip`;
    await FileSystem.writeAsStringAsync(
      archiveUri,
      createStoreZipBase64(files),
      { encoding: FileSystem.EncodingType.Base64 },
    );
    return archiveUri;
  }

  private async readFiles(
    directory: string,
    root: string,
  ): Promise<Array<{ name: string; base64: string }>> {
    const names = await FileSystem.readDirectoryAsync(directory);
    const files: Array<{ name: string; base64: string }> = [];
    for (const name of names) {
      if (name.endsWith('.zip')) {
        continue;
      }
      const uri = `${directory}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.isDirectory) {
        files.push(...(await this.readFiles(`${uri}/`, root)));
      } else {
        files.push({
          name: uri.slice(root.length),
          base64: await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
        });
      }
    }
    return files;
  }
}
