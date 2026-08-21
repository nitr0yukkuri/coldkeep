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
import { createStoreZipBase64 } from '../archive/storeZip';
import { writeTextAtomically } from './atomicTextFile';

function localPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function collectionRoot(): string {
  return `${RNFS.DocumentDirectoryPath}/coldkeep-dataset/`;
}

export class RnfsDatasetRepository implements DatasetRepository {
  private saveQueue: Promise<void> = Promise.resolve();

  async save(
    recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    const operation = this.saveInternal(recording, labels, audio);
    this.saveQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async saveInternal(
    recording: RecordingRef,
    labels: CollectionLabels,
    audio: PcmAudio,
  ): Promise<CollectionRecord> {
    await this.saveQueue;
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
    await writeTextAtomically(
      manifestUri,
      `${existing.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
      {
        exists: RNFS.exists,
        readFile: candidate => RNFS.readFile(candidate, 'utf8'),
        writeFile: (candidate, contents) =>
          RNFS.writeFile(candidate, contents, 'utf8'),
        moveFile: RNFS.moveFile,
        unlink: RNFS.unlink,
      },
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

  async createExportArchive(): Promise<string> {
    const root = collectionRoot();
    const manifestUri = `${root}manifest.csv`;
    if (!(await RNFS.exists(manifestUri))) {
      throw new Error('No recordings have been saved yet');
    }
    const files = await this.readFiles(root, root);
    const archiveDirectory = `${root}exports/`;
    await RNFS.mkdir(archiveDirectory);
    const archivePath = `${archiveDirectory}coldkeep-dataset-${Date.now()}.zip`;
    await RNFS.writeFile(archivePath, createStoreZipBase64(files), 'base64');
    return `file://${archivePath}`;
  }

  private async readFiles(
    directory: string,
    root: string,
  ): Promise<Array<{ name: string; base64: string }>> {
    const entries = await RNFS.readDir(directory);
    const files: Array<{ name: string; base64: string }> = [];
    for (const entry of entries) {
      if (entry.name.endsWith('.zip')) {
        continue;
      }
      if (entry.isDirectory()) {
        files.push(...(await this.readFiles(entry.path, root)));
      } else {
        files.push({
          name: entry.path.slice(root.length).replace(/\\/g, '/'),
          base64: await RNFS.readFile(entry.path, 'base64'),
        });
      }
    }
    return files;
  }
}
