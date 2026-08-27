import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

import { HistoryScreen } from '../src/features/history/ui/HistoryScreen';
import type { HydrationState } from '../src/features/hydration/domain/hydration';

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
test('shows the total history count while limiting the rendered list', () => {
  const state: HydrationState = {
    profile: { capacityMl: 500, dailyGoalMl: 1500 },
    observations: Array.from({ length: 12 }, (_, index) => ({
      observationId: 'observation-' + index,
      recordedAt:
        '2026-08-27T00:' + String(index).padStart(2, '0') + ':00.000Z',
      remainingMl: 500 - index * 10,
      fillLevel: 100 as const,
      confidence: 0.9,
      source: 'acoustic' as const,
    })),
    intakes: [],
  };
  const renderer = ReactTestRenderer.create(
    <HistoryScreen state={state} onOpenMeasure={jest.fn()} />,
  );
  const values = renderer.root
    .findAllByType(Text)
    .map(node => String(node.props.children));

  expect(values).toContain('12');
  expect(
    renderer.root
      .findAllByType(Text)
      .filter(node => node.props.children === '残量を測定'),
  ).toHaveLength(10);
  renderer.unmount();
});
