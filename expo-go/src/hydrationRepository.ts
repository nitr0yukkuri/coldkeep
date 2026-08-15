import * as FileSystem from 'expo-file-system/legacy';

import type { HydrationRepository } from '../../src/features/shared/application/ports';
import {
  HydrationState,
  normalizeHydrationState,
} from '../../src/features/hydration/domain/hydration';

function stateUri(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('Expo document directory is unavailable');
  }
  return `${FileSystem.documentDirectory}coldkeep-hydration.json`;
}

export class ExpoHydrationRepository implements HydrationRepository {
  async load(): Promise<HydrationState | null> {
    const uri = stateUri();
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    const raw = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    try {
      return normalizeHydrationState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(state: HydrationState): Promise<void> {
    await FileSystem.writeAsStringAsync(
      stateUri(),
      JSON.stringify(state, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  }
}
