import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

import { HomeOverview } from '../src/features/home/ui/HomeOverview';
import { HydrationState } from '../src/features/hydration/domain/hydration';
import { BottomTabBar } from '../src/features/navigation/ui/BottomTabBar';

describe('BottomTabBar', () => {
  it('renders five product areas and reports the selected tab', () => {
    const onChange = jest.fn();
    const renderer = ReactTestRenderer.create(
      <BottomTabBar activeTab="home" onChange={onChange} />,
    );

    const labels = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter(value => typeof value === 'string');

    expect(
      labels.filter(value =>
        ['ホーム', '振る', '水分', '温度', '履歴'].includes(value as string),
      ),
    ).toEqual(['ホーム', '振る', '水分', '温度', '履歴']);
    const tabs = renderer.root.findAllByType(Pressable);
    expect(tabs).toHaveLength(5);
    expect(
      tabs.filter(node => node.props.accessibilityState?.selected),
    ).toHaveLength(1);
    tabs[1]?.props.onPress();
    expect(onChange).toHaveBeenCalledWith('measure');
  });
});

it('disables every tab while an operation is active', () => {
  const onChange = jest.fn();
  const renderer = ReactTestRenderer.create(
    <BottomTabBar activeTab="measure" onChange={onChange} disabled />,
  );

  const tabs = renderer.root.findAllByType(Pressable);
  expect(tabs).toHaveLength(5);
  expect(tabs.every(tab => tab.props.disabled === true)).toBe(true);
  expect(
    tabs.every(tab => tab.props.accessibilityState?.disabled === true),
  ).toBe(true);

  tabs[0]?.props.onPress();
  expect(onChange).not.toHaveBeenCalled();
  renderer.unmount();
});
describe('HomeOverview', () => {
  it('shows the latest saved residual when there is no fresh scan result', () => {
    const state: HydrationState = {
      profile: { capacityMl: 500, dailyGoalMl: 1500 },
      observations: [
        {
          observationId: 'obs-1',
          recordedAt: new Date().toISOString(),
          remainingMl: 250,
          fillLevel: 50,
          confidence: 0.9,
          source: 'acoustic',
        },
      ],
      intakes: [],
    };
    const renderer = ReactTestRenderer.create(
      <HomeOverview
        state={state}
        waterDisplay="未判定"
        iceDisplay="未判定"
        hasScanResult={false}
        onOpenMeasure={jest.fn()}
      />,
    );

    const values = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter(value => typeof value === 'string');

    expect(values).toContain('残量 250 mL');
    renderer.unmount();
  });
  it('keeps measurement controls in the measure tab', () => {
    const renderer = ReactTestRenderer.create(
      <HomeOverview
        state={null}
        waterDisplay="未判定"
        iceDisplay="未判定"
        hasScanResult={false}
        onOpenMeasure={jest.fn()}
      />,
    );
    const values = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .filter(value => typeof value === 'string');

    expect(values).toContain('現在の状態');
    expect(values).not.toContain('振って測定する');
    expect(
      renderer.root
        .findAllByType(Pressable)
        .filter(node => node.props.accessibilityLabel === '振るタブを開く'),
    ).toHaveLength(1);
  });
});
