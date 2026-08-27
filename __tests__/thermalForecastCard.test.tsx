import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { ThermalForecastCard } from '../src/features/thermal/ui/ThermalForecastCard';

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join('');
  }
  return '';
}

const handlers = {
  onChangeCurrentWaterTemp: jest.fn(),
  onChangeAmbientTemp: jest.fn(),
  onChangeElapsedMinutes: jest.fn(),
};

test('surfaces the domain validation message for invalid thermal input', () => {
  const renderer = ReactTestRenderer.create(
    <ThermalForecastCard
      capacityMl={20}
      iceAmount="none"
      currentWaterTempText="6"
      ambientTempText="30"
      elapsedMinutesText="0"
      {...handlers}
    />,
  );
  const values = renderer.root
    .findAllByType(Text)
    .map(node => textContent(node.props.children));

  expect(values).toContain('水筒容量は100〜10000mLで設定してください');
  expect(values).toContain('入力値を確認してから、もう一度予測してください。');
  renderer.unmount();
});
