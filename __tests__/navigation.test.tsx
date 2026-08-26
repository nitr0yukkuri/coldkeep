import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';

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

    expect(labels).toEqual([
      '⌂',
      'ホーム',
      '⌁',
      '振る',
      '＋',
      '水分',
      '℃',
      '温度',
      '▥',
      '履歴',
    ]);
    const tabs = renderer.root.findAllByType(Pressable);
    expect(tabs).toHaveLength(5);
    expect(
      tabs.filter(node => node.props.accessibilityState?.selected),
    ).toHaveLength(1);
    tabs[1]?.props.onPress();
    expect(onChange).toHaveBeenCalledWith('measure');
  });
});
