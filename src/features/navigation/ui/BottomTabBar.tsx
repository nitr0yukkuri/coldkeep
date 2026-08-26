import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_TABS, AppTab } from '../domain/appTab';

type BottomTabBarProps = {
  activeTab: AppTab;
  onChange(tab: AppTab): void;
};

export function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {APP_TABS.map(tab => {
        const selected = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.tabPressed,
            ]}
          >
            <Text style={[styles.icon, selected && styles.iconSelected]}>
              {tab.icon}
            </Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 68,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 5,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#dce7e9',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabSelected: { backgroundColor: '#e8f4f6' },
  tabPressed: { opacity: 0.72 },
  icon: {
    color: '#8b9ba0',
    fontSize: 21,
    lineHeight: 23,
    fontWeight: '700',
  },
  iconSelected: { color: '#087ea4' },
  label: {
    color: '#8b9ba0',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  labelSelected: { color: '#087ea4' },
});
