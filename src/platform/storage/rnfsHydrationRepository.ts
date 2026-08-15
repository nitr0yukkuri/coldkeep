import * as RNFS from 'react-native-fs';

import {
  HydrationRepository,
} from '../../features/shared/application/ports';
import {
  HydrationState,
  normalizeHydrationState,
} from '../../features/hydration/domain/hydration';

function statePath(): string {
  return `${RNFS.DocumentDirectoryPath}/coldkeep-hydration.json`;
}

export class RnfsHydrationRepository implements HydrationRepository {
  async load(): Promise<HydrationState | null> {
    const path = statePath();
    if (!(await RNFS.exists(path))) {
      return null;
    }
    const raw = await RNFS.readFile(path, 'utf8');
    try {
      return normalizeHydrationState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(state: HydrationState): Promise<void> {
    await RNFS.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
  }
}
