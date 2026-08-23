import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { File, FileMode } from 'expo-file-system';

import {
  CollectionLabels,
  CollectionRecord,
  collectionRecordToCsv,
  collectionExportFileNames,
  createRecordingId,
  normalizeCollectionManifest,
} from '../../src/features/collection/domain/collection';
import type {
  DatasetRepository,
  PcmAudio,
  RecordingRef,
} from '../../src/features/shared/application/ports';
import { encodePcm16WavBase64 } from '../../src/platform/audio/pcmWav';
import { writeStoreZipArchive } from '../../src/platform/archive/storeZip';
import {
  readTextWithRecovery,
  writeTextAtomically,
} from '../../src/platform/storage/atomicTextFile';

function documentRoot(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable');
  }
  return `${FileSystem.documentDirectory}coldkeep-dataset/`;
}

function manifestFileOps() {
  return {
    exists: async (candidate: string) =>
      (await FileSystem.getInfoAsync(candidate)).exists,
    readFile: (candidate: string) =>
      FileSystem.readAsStringAsync(candidate, {
        encoding: FileSystem.EncodingType.UTF8,
      }),
    writeFile: (candidate: string, contents: string) =>
      FileSystem.writeAsStringAsync(candidate, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      }),
    moveFile: (from: string, to: string) => FileSystem.moveAsync({ from, to }),
    unlink: (candidate: string) =>
      FileSystem.deleteAsync(candidate, { idempotent: true }),
  };
}

async function readCollectionManifest(uri: string): Promise<string | null> {
  return readTextWithRecovery(uri, manifestFileOps(), contents => {
    try {
      collectionExportFileNames(normalizeCollectionManifest(contents));
      return true;
    } catch {
      return false;
    }
  });
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
    const root = documentRoot();
    const audioDirectory = `${root}audio/`;
    const metadataDirectory = `${root}metadata/`;
    const manifestUri = `${root}manifest.csv`;
    // Validate the manifest before creating any audio/metadata files. An app
    // upgrade with an old CSV schema must not leave orphaned recordings when
    // the append is rejected.
    const existing = await readCollectionManifest(manifestUri);
    const normalizedExisting = normalizeCollectionManifest(existing);
    const existingNames = collectionExportFileNames(normalizedExisting);
    const baseRecordingId = createRecordingId(labels, recordedAt);
    let recordingId = baseRecordingId;
    let suffix = 1;
    while (
      existingNames.has(`audio/${recordingId}.wav`) ||
      (await FileSystem.getInfoAsync(`${audioDirectory}${recordingId}.wav`)).exists ||
      (await FileSystem.getInfoAsync(`${metadataDirectory}${recordingId}.json`)).exists
    ) {
      recordingId = `${baseRecordingId}-${suffix}`;
      suffix += 1;
    }
    const audioFilename = `audio/${recordingId}.wav`;
    const record: CollectionRecord = {
      ...labels,
      recordingId,
      labelSource: 'coldkeep_measured',
      recordedAt: recordedAt.toISOString(),
      audioFilename,
      sampleRateHz: audio.sampleRate,
      channels: 1,
      bitDepth: 16,
      durationSeconds: audio.samples.length / audio.sampleRate,
      platform: Platform.OS,
    };

    const audioUri = `${root}${audioFilename}`;
    const metadataUri = `${metadataDirectory}${recordingId}.json`;
    try {
      await FileSystem.makeDirectoryAsync(audioDirectory, {
        intermediates: true,
      });
      await FileSystem.makeDirectoryAsync(metadataDirectory, {
        intermediates: true,
      });
      await FileSystem.writeAsStringAsync(
        audioUri,
        encodePcm16WavBase64(audio),
        { encoding: FileSystem.EncodingType.Base64 },
      );
      await FileSystem.writeAsStringAsync(
        metadataUri,
        JSON.stringify(record, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 },
      );
      await writeTextAtomically(
        manifestUri,
        `${normalizedExisting.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
        manifestFileOps(),
      );
    } catch (error) {
      await FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(
        () => undefined,
      );
      await FileSystem.deleteAsync(metadataUri, { idempotent: true }).catch(
        () => undefined,
      );
      await FileSystem.deleteAsync(`${manifestUri}.tmp`, {
        idempotent: true,
      }).catch(() => undefined);
      throw error;
    }
    return record;
  }

  async readManifest(): Promise<string | null> {
    const manifestUri = `${documentRoot()}manifest.csv`;
    return readCollectionManifest(manifestUri);
  }

  async createExportArchive(): Promise<string> {
    const root = documentRoot();
    const manifestUri = `${root}manifest.csv`;
    const manifest = await readCollectionManifest(manifestUri);
    if (manifest === null) {
      throw new Error('No recordings have been saved yet');
    }
    const allowedNames = collectionExportFileNames(manifest);
    const files = await this.listFiles(root, root, allowedNames);
    const foundNames = new Set(files.map(file => file.name));
    const missingNames = [...allowedNames].filter(name => !foundNames.has(name));
    if (missingNames.length > 0) {
      throw new Error(`Dataset is incomplete; missing ${missingNames.join(', ')}`);
    }
    const archiveDirectory = `${root}exports/`;
    await FileSystem.makeDirectoryAsync(archiveDirectory, {
      intermediates: true,
    });
    const archiveUri = `${archiveDirectory}coldkeep-dataset-${Date.now()}.zip`;
    const archiveFile = new File(archiveUri);
    archiveFile.create({ intermediates: true, overwrite: true });
    const handle = archiveFile.open(FileMode.Truncate);
    let completed = false;
    try {
      await writeStoreZipArchive(
        files.map(file => ({
          name: file.name,
          readBase64: () =>
            FileSystem.readAsStringAsync(file.uri, {
              encoding: FileSystem.EncodingType.Base64,
            }),
        })),
        { write: bytes => handle.writeBytes(bytes) },
      );
      completed = true;
    } finally {
      handle.close();
      if (!completed) {
        await FileSystem.deleteAsync(archiveUri, { idempotent: true });
      }
    }
    return archiveUri;
  }

  private async listFiles(
    directory: string,
    root: string,
    allowedNames: Set<string>,
  ): Promise<Array<{ name: string; uri: string }>> {
    const names = await FileSystem.readDirectoryAsync(directory);
    const files: Array<{ name: string; uri: string }> = [];
    for (const name of names) {
      if (name.endsWith('.zip')) {
        continue;
      }
      const uri = `${directory}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.isDirectory) {
        files.push(...(await this.listFiles(`${uri}/`, root, allowedNames)));
      } else {
        const relativeName = uri.slice(root.length);
        if (!allowedNames.has(relativeName)) {
          continue;
        }
        files.push({
          name: relativeName,
          uri,
        });
      }
    }
    return files;
  }
}
