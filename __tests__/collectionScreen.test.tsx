import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

import { CollectionScreen } from '../src/features/collection/ui/CollectionScreen';

test('stops the recording timer while saving', async () => {
  let resolveStop!: (recording: { uri: string }) => void;
  const app = {
    recording: {
      start: jest.fn(async () => ({ uri: 'file:///collection.wav' })),
      stop: jest.fn(
        () =>
          new Promise<{ uri: string }>(resolve => {
            resolveStop = resolve;
          }),
      ),
      cleanup: jest.fn(async () => undefined),
    },
    collect: {
      execute: jest.fn(async () => ({ recordingId: 'sample-1' })),
    },
    exportDataset: { execute: jest.fn() },
  } as never;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CollectionScreen app={app} />);
  });

  const deviceInput = renderer.root
    .findAllByType(TextInput)
    .find(input => input.props.accessibilityLabel === '端末');
  await ReactTestRenderer.act(async () => {
    deviceInput?.props.onChangeText('test-device');
  });

  const recordButton = () =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(
        button => button.props.accessibilityLabel === '振り音を録音して保存',
      );
  await ReactTestRenderer.act(async () => {
    await recordButton()?.props.onPress();
  });

  const stopButton = () =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(button => button.props.accessibilityLabel === '録音を停止して保存');
  let stopPromise!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    stopPromise = stopButton()?.props.onPress();
    await Promise.resolve();
  });

  const texts = renderer.root
    .findAllByType(Text)
    .map(text => text.props.children)
    .flat()
    .filter((value): value is string => typeof value === 'string');
  expect(texts).toContain('保存中…');
  expect(texts).not.toContain('0.0秒');

  resolveStop({ uri: 'file:///collection.wav' });
  await ReactTestRenderer.act(async () => {
    await stopPromise;
  });
  renderer.unmount();
});
test('renders data collection as a standalone screen', async () => {
  const app = {
    recording: {
      start: jest.fn(async () => ({ uri: 'file:///collection.wav' })),
      stop: jest.fn(async () => ({ uri: 'file:///collection.wav' })),
      cleanup: jest.fn(async () => undefined),
    },
    collect: { execute: jest.fn() },
    exportDataset: { execute: jest.fn() },
  } as never;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CollectionScreen app={app} />);
  });

  const textContent = renderer.root
    .findAllByType(Text)
    .map(text => text.props.children)
    .flat()
    .filter((value): value is string => typeof value === 'string');

  expect(textContent).toContain('振り音データ収集');
  expect(textContent).toContain('振り音を録音する');
  renderer.unmount();
});
test('ignores a duplicate recording start while the native start is pending', async () => {
  let resolveStart!: (recording: { uri: string }) => void;
  const start = jest.fn(
    () =>
      new Promise<{ uri: string }>(resolve => {
        resolveStart = resolve;
      }),
  );
  const app = {
    recording: {
      start,
      stop: jest.fn(async () => ({ uri: 'file:///collection.wav' })),
      cleanup: jest.fn(async () => undefined),
    },
    collect: { execute: jest.fn() },
    exportDataset: { execute: jest.fn() },
  } as never;

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CollectionScreen app={app} />);
  });
  const deviceInput = renderer.root
    .findAllByType(TextInput)
    .find(input => input.props.accessibilityLabel === '端末');
  await ReactTestRenderer.act(async () => {
    deviceInput?.props.onChangeText('test-device');
  });

  const recordButton = () =>
    renderer.root
      .findAllByType(TouchableOpacity)
      .find(
        button => button.props.accessibilityLabel === '振り音を録音して保存',
      );
  let firstStart!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    firstStart = recordButton()?.props.onPress();
    recordButton()?.props.onPress();
    await Promise.resolve();
  });

  expect(start).toHaveBeenCalledTimes(1);
  resolveStart({ uri: 'file:///collection.wav' });
  await ReactTestRenderer.act(async () => {
    await firstStart;
  });
  renderer.unmount();
});
