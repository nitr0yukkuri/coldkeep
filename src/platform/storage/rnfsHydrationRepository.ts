import * as RNFS from 'react-native-fs';

import { HydrationRepository } from '../../features/shared/application/ports';
import {
  HydrationState,
  normalizeHydrationState,
} from '../../features/hydration/domain/hydration';
import { readTextWithRecovery, writeTextAtomically } from './atomicTextFile';

function statePath(): string {
  return `${RNFS.DocumentDirectoryPath}/coldkeep-hydration.json`;
}

export class RnfsHydrationRepository implements HydrationRepository {
  async load(): Promise<HydrationState | null> {
    const path = statePath();
    const raw = await readTextWithRecovery(
      path,
      {
        exists: RNFS.exists,
        readFile: candidate => RNFS.readFile(candidate, 'utf8'),
        writeFile: (candidate, contents) =>
          RNFS.writeFile(candidate, contents, 'utf8'),
        moveFile: RNFS.moveFile,
        unlink: RNFS.unlink,
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
    const path = statePath();
    await writeTextAtomically(path, JSON.stringify(state, null, 2), {
      exists: RNFS.exists,
      readFile: candidate => RNFS.readFile(candidate, 'utf8'),
      writeFile: (candidate, contents) =>
        RNFS.writeFile(candidate, contents, 'utf8'),
      moveFile: RNFS.moveFile,
      unlink: RNFS.unlink,
    });
  }
}
