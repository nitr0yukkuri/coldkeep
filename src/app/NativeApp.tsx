import React, { useMemo } from 'react';

import ColdKeepScreen from '../../App';
import { createAppDependencies } from './compositionRoot';
import { isCollectionMode } from './runtimeMode';
import { CollectionScreen } from '../features/collection/ui/CollectionScreen';

export default function NativeApp() {
  const app = useMemo(() => createAppDependencies(), []);
  return isCollectionMode ? (
    <CollectionScreen app={app} />
  ) : (
    <ColdKeepScreen app={app} />
  );
}
