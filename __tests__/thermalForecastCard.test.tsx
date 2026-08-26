import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Pressable } from 'react-native';

import { ThermalForecastCard } from '../src/features/thermal/ui/ThermalForecastCard';

describe('ThermalForecastCard environment mode', () => {
  test('lets users mark indoor conditions without entering room temperature', async () => {
    const onChangeEnvironment = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ThermalForecastCard
          capacityMl={500}
          iceAmount="none"
          environment="outdoor"
          currentWaterTempText="6"
          ambientTempText="30"
          elapsedMinutesText="0"
          onChangeEnvironment={onChangeEnvironment}
          onChangeCurrentWaterTemp={jest.fn()}
          onChangeAmbientTemp={jest.fn()}
          onChangeElapsedMinutes={jest.fn()}
        />,
      );
    });

    const indoorButton = renderer.root
      .findAllByType(Pressable)
      .find(button => button.props.accessibilityState?.selected === false);
    expect(indoorButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      indoorButton?.props.onPress();
    });

    expect(onChangeEnvironment).toHaveBeenCalledWith('indoor_unknown');
    renderer.unmount();
  });
});
