import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

import { HydrationPanel } from '../src/features/hydration/ui/HydrationPanel';

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join('');
  }
  return '';
}

test('explains loading and surfaces profile save feedback in the hydration tab', () => {
  const renderer = ReactTestRenderer.create(
    <HydrationPanel
      state={null}
      capacityText="500"
      autoRecordedIntakeMl={null}
      onChangeCapacity={jest.fn()}
      onSaveProfile={jest.fn()}
      modelActionLabel="振る"
      loading
      feedback="保存中…"
    />,
  );
  const values = renderer.root
    .findAllByType(Text)
    .map(node => textContent(node.props.children));

  expect(values).toContain('保存済みデータを読み込み中…');
  expect(values).toContain('保存中…');
  expect(renderer.root.findAllByType(TextInput)[0]?.props.editable).toBe(false);
  expect(renderer.root.findAllByType(TouchableOpacity)[0]?.props.disabled).toBe(
    true,
  );
  renderer.unmount();
});
