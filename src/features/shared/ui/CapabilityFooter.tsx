import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Capability = {
  symbol: string;
  label: string;
  description: string;
  tint: string;
};

const CAPABILITIES: readonly Capability[] = [
  { symbol: '⌁', label: '振るだけ', description: '音で測定', tint: '#d9f2f4' },
  { symbol: '◒', label: '残量', description: 'ざっくり確認', tint: '#e4f4f4' },
  { symbol: '❄', label: '氷量', description: 'あり・なし', tint: '#dceff7' },
  { symbol: '＋', label: '飲水', description: '自動で記録', tint: '#e5f5f0' },
  { symbol: '↗', label: '温度', description: '4時間予測', tint: '#e8f2f7' },
];

export function CapabilityFooter() {
  return (
    <View
      style={styles.footer}
      accessible
      accessibilityLabel="ColdKeepでできること"
    >
      <Text style={styles.heading}>ColdKeepでできること</Text>
      <View style={styles.items}>
        {CAPABILITIES.map(capability => (
          <View
            key={capability.label}
            style={styles.item}
            accessible
            accessibilityLabel={`${capability.label}。${capability.description}`}
          >
            <View style={[styles.icon, { backgroundColor: capability.tint }]}>
              <Text style={styles.symbol}>{capability.symbol}</Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {capability.label}
            </Text>
            <Text style={styles.description} numberOfLines={1}>
              {capability.description}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    width: '100%',
    marginTop: 24,
    paddingTop: 18,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#dce7e9',
  },
  heading: {
    color: '#36515a',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  items: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  symbol: {
    color: '#087ea4',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  label: {
    color: '#36515a',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
  },
  description: {
    color: '#8b9ba0',
    fontSize: 9,
    marginTop: 3,
  },
});
