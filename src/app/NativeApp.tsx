import React, { useMemo } from 'react';

import ColdKeepScreen from '../../App';
import { createAppDependencies } from './compositionRoot';

export default function NativeApp() {
  const app = useMemo(() => createAppDependencies(), []);
  return <ColdKeepScreen app={app} />;
}
