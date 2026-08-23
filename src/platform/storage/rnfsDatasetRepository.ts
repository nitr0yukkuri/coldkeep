import { Platform } from 'react-native';
import * as RNFS from 'react-native-fs';

import {
  CollectionLabels,
  CollectionRecord,
  collectionRecordToCsv,
  collectionExportFileNames,
  createRecordingId,
  normalizeCollectionManifest,
} from '../../features/collection/domain/collection';
import {
  DatasetRepository,
  RecordingRef,
} from '../../features/shared/application/ports';
import { PcmAudio } from '../../features/shared/application/ports';
import { encodeBase64, writeStoreZipArchive } from '../archive/storeZip';
import { readTextWithRecovery, writeTextAtomically } from './atomicTextFile';

function localPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function collectionRoot(): string {
  return `${RNFS.DocumentDirectoryPath}/coldkeep-dataset/`;
}

function manifestFileOps() {
  return {
    exists: RNFS.exists,
    readFile: (candidate: string) => RNFS.readFile(candidate, 'utf8'),
    writeFile: (candidate: string, contents: string) =>
      RNFS.writeFile(candidate, contents, 'utf8'),
    moveFile: RNFS.moveFile,
    unlink: RNFS.unlink,
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
    const root = collectionRoot();
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
      (await RNFS.exists(`${audioDirectory}${recordingId}.wav`)) ||
      (await RNFS.exists(`${metadataDirectory}${recordingId}.json`))
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

    const audioPath = `${root}${audioFilename}`;
    const metadataPath = `${metadataDirectory}${recordingId}.json`;
    try {
      await RNFS.mkdir(audioDirectory);
      await RNFS.mkdir(metadataDirectory);
      await RNFS.copyFile(localPath(recording.uri), audioPath);
      await RNFS.writeFile(metadataPath, JSON.stringify(record, null, 2), 'utf8');
      await writeTextAtomically(
        manifestUri,
        `${normalizedExisting.trimEnd()}\n${collectionRecordToCsv(record)}\n`,
        manifestFileOps(),
      );
    } catch (error) {
      // The manifest is the source of truth. If it was not committed, remove
      // files created for this attempt so a failed capture cannot accumulate
      // orphaned audio/metadata or a stale manifest temp file.
      await RNFS.unlink(audioPath).catch(() => undefined);
      await RNFS.unlink(metadataPath).catch(() => undefined);
      await RNFS.unlink(`${manifestUri}.tmp`).catch(() => undefined);
      throw error;
    }
    return record;
  }

  async readManifest(): Promise<string | null> {
    const manifestUri = `${collectionRoot()}manifest.csv`;
    return readCollectionManifest(manifestUri);
  }

  async createExportArchive(): Promise<string> {
    const root = collectionRoot();
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
    await RNFS.mkdir(archiveDirectory);
    const archivePath = `${archiveDirectory}coldkeep-dataset-${Date.now()}.zip`;
    let initialized = false;
    try {
      await writeStoreZipArchive(
        files.map(file => ({
          name: file.name,
          readBase64: () => RNFS.readFile(file.path, 'base64'),
        })),
        {
          write: async bytes => {
            const encoded = encodeBase64(bytes);
            if (initialized) {
              await RNFS.appendFile(archivePath, encoded, 'base64');
            } else {
              await RNFS.writeFile(archivePath, encoded, 'base64');
              initialized = true;
            }
          },
        },
      );
    } catch (error) {
      await RNFS.unlink(archivePath).catch(() => undefined);
      throw error;
    }
    return `file://${archivePath}`;
  }

  private async listFiles(
    directory: string,
    root: string,
    allowedNames: Set<string>,
  ): Promise<Array<{ name: string; path: string }>> {
    const entries = await RNFS.readDir(directory);
    const files: Array<{ name: string; path: string }> = [];
    for (const entry of entries) {
      if (entry.name.endsWith('.zip')) {
        continue;
      }
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(entry.path, root, allowedNames)));
      } else {
        const name = entry.path.slice(root.length).replace(/\\/g, '/');
        if (!allowedNames.has(name)) {
          continue;
        }
        files.push({
          name,
          path: entry.path,
        });
      }
    }
    return files;
  }
}
