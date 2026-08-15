/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

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
import ColdKeepScreen from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });
});

test('shows an explicit unknown ice result after a successful scan', async () => {
  const hydrationState = {
    profile: { capacityMl: 500, dailyGoalMl: 1_500 },
    observations: [],
    intakes: [],
  };
  const app = {
    collectionActions: ['pour', 'shake', 'still'],
    recording: {
      start: jest.fn(async () => ({ uri: 'file:///test.wav' })),
      stop: jest.fn(async () => ({ uri: 'file:///test.wav' })),
      cleanup: jest.fn(async () => undefined),
    },
    scan: {
      execute: jest.fn(async () => ({
        containsWater: true,
        waterConfidence: 0.9,
        fillLevel: 50,
        fillConfidence: 0.8,
        icePresence: null,
        iceConfidence: null,
        iceStatus: 'untrained',
        engine: 'typescript',
      })),
    },
    collect: { execute: jest.fn() },
    exportDataset: { execute: jest.fn() },
    hydration: {
      load: jest.fn(async () => hydrationState),
      updateProfile: jest.fn(),
      addManualIntake: jest.fn(),
      recordObservation: jest.fn(async () => ({
        state: hydrationState,
        estimatedConsumedMl: null,
        observation: {
          observationId: 'observation-test',
          recordedAt: '2026-08-15T00:00:00.000Z',
          remainingMl: 250,
          fillLevel: 50,
          confidence: 0.8,
          source: 'acoustic',
        },
      })),
      addEstimatedIntake: jest.fn(),
    },
  } as never;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<ColdKeepScreen app={app} />);
    await Promise.resolve();
  });

  const textContent = (value: unknown): string => {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(textContent).join('');
    }
    return '';
  };

  const buttonFor = (label: string) =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(button =>
        button
          .findAllByType(Text)
          .some(text => textContent(text.props.children) === label),
      );

  await ReactTestRenderer.act(async () => {
    await buttonFor('チェックする')?.props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    await buttonFor('停止して確認')?.props.onPress();
  });

  const textValues = renderer.root
    .findAllByType(Text)
    .map(text => textContent(text.props.children));
  expect(textValues).toContain('氷の有無');
  expect(textValues).toContain('未判定');

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});
