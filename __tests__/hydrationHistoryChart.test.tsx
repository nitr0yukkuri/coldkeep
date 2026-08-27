import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { createDefaultHydrationState } from '../src/features/hydration/domain/hydration';
import { HydrationHistoryChart } from '../src/features/hydration/ui/HydrationHistoryChart';

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join('');
  }
  return '';
}

test('shows zero for each unrecorded day in the seven-day chart', () => {
  const renderer = ReactTestRenderer.create(
    <HydrationHistoryChart state={createDefaultHydrationState()} />,
  );
  const values = renderer.root
    .findAllByType(Text)
    .map(node => textContent(node.props.children));

  expect(values.filter(value => value === '0 mL')).toHaveLength(7);
  expect(values).toContain('未記録日は0 mL');
});
test('shows an explicit loading state before persisted hydration data arrives', () => {
  const renderer = ReactTestRenderer.create(
    <HydrationHistoryChart state={null} loading />,
  );
  const values = renderer.root
    .findAllByType(Text)
    .map(node => textContent(node.props.children));

  expect(values).toContain('保存済みデータを読み込み中…');
  expect(values).not.toContain('0 mL');
  renderer.unmount();
});
