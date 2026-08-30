import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { APP_TABS, AppTab } from '../domain/appTab';

type BottomTabBarProps = {
  activeTab: AppTab;
  onChange(tab: AppTab): void;
  disabled?: boolean;
};

export function BottomTabBar({
  activeTab,
  onChange,
  disabled = false,
}: BottomTabBarProps) {
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {APP_TABS.map(tab => {
        const selected = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (!disabled) {
                onChange(tab.key);
              }
            }}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              disabled && styles.tabDisabled,
              pressed && styles.tabPressed,
            ]}
          >
            <Ionicons
              name={tab.icon}
              size={23}
              color={selected ? '#087ea4' : '#8b9ba0'}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
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
  tabDisabled: { opacity: 0.5 },

  label: {
    color: '#8b9ba0',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  labelSelected: { color: '#087ea4' },
});
