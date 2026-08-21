import * as FileSystem from 'expo-file-system/legacy';

import type { HydrationRepository } from '../../src/features/shared/application/ports';
import {
  HydrationState,
  normalizeHydrationState,
} from '../../src/features/hydration/domain/hydration';
import {
  readTextWithRecovery,
  writeTextAtomically,
} from '../../src/platform/storage/atomicTextFile';

function stateUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable');
  }
  return `${FileSystem.documentDirectory}coldkeep-hydration.json`;
}

export class ExpoHydrationRepository implements HydrationRepository {
  async load(): Promise<HydrationState | null> {
    const uri = stateUri();
    const raw = await readTextWithRecovery(
      uri,
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
      rawContents => {
        try {
          const value = JSON.parse(rawContents) as {
            profile?: { capacityMl?: unknown; dailyGoalMl?: unknown };
          } | null;
          return Boolean(
            value &&
              value.profile &&
              Number.isFinite(Number(value.profile.capacityMl)) &&
              Number.isFinite(Number(value.profile.dailyGoalMl)),
          );
        } catch {
          return false;
        }
      },
    );
    if (raw === null) {
      return null;
    }
    try {
      return normalizeHydrationState(JSON.parse(raw));
    } catch (error) {
      throw new Error(
        `Hydration state is corrupted and could not be recovered: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async save(state: HydrationState): Promise<void> {
    const uri = stateUri();
    await writeTextAtomically(uri, JSON.stringify(state, null, 2), {
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
    });
  }
}
