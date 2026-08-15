/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/test/documents',
  readFile: jest.fn(async () => ''),
  writeFile: jest.fn(async () => undefined),
  copyFile: jest.fn(async () => undefined),
  mkdir: jest.fn(async () => undefined),
  exists: jest.fn(async () => false),
  unlink: jest.fn(async () => undefined),
}));

jest.mock('../src/app/compositionRoot', () => ({
  createAppDependencies: () => ({
    collectionActions: ['pour', 'shake', 'still'],
    recording: {
      start: jest.fn(async () => ({ uri: 'file:///test.wav' })),
      stop: jest.fn(async () => ({ uri: 'file:///test.wav' })),
      cleanup: jest.fn(async () => undefined),
    },
    scan: { execute: jest.fn() },
    collect: { execute: jest.fn() },
    exportDataset: { execute: jest.fn() },
    hydration: {
      load: jest.fn(async () => ({
        profile: { capacityMl: 500, dailyGoalMl: 1500 },
        observations: [],
        intakes: [],
      })),
      updateProfile: jest.fn(),
      addManualIntake: jest.fn(),
      recordObservation: jest.fn(),
      addEstimatedIntake: jest.fn(),
    },
  }),
}));

import App from '../src/app/NativeApp';

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
});
