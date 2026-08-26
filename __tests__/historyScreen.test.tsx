import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

import { HistoryScreen } from '../src/features/history/ui/HistoryScreen';

test('empty history state gives the user a clear next action', () => {
  const onOpenMeasure = jest.fn();
  const renderer = ReactTestRenderer.create(
    <HistoryScreen state={null} onOpenMeasure={onOpenMeasure} />,
  );

  const values = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .filter(value => typeof value === 'string');
  expect(values).toContain('まだ記録がありません');
  expect(values).toContain('振って測定する');

  const button = renderer.root
    .findAllByType(Pressable)
    .find(node => node.props.accessibilityLabel === '振って測定する');
  button?.props.onPress();
  expect(onOpenMeasure).toHaveBeenCalledTimes(1);
});
