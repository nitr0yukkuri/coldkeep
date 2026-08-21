import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { CollectionScreen } from '../src/features/collection/ui/CollectionScreen';

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
