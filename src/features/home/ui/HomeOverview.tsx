import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DEFAULT_HYDRATION_PROFILE,
  HydrationState,
  latestObservation,
  todayIntakeMl,
} from '../../hydration/domain/hydration';

type HomeOverviewProps = {
  state: HydrationState | null;
  waterDisplay: string;
  iceDisplay: string;
  hasScanResult: boolean;
  onOpenMeasure(): void;
};

export function HomeOverview({
  state,
  waterDisplay,
  iceDisplay,
  hasScanResult,
  onOpenMeasure,
}: HomeOverviewProps) {
  const observation = state ? latestObservation(state) : null;
  const intakeMl = state ? todayIntakeMl(state) : 0;
  const capacityMl =
    state?.profile.capacityMl ?? DEFAULT_HYDRATION_PROFILE.capacityMl;

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>現在の状態</Text>
          <Text style={styles.subtitle}>
            各機能の結果をここでまとめて確認できます
          </Text>
        </View>
        <Text style={styles.capacity}>{capacityMl} mL</Text>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>残量</Text>
          <Text style={styles.metricValue}>
            {hasScanResult ? waterDisplay : '未測定'}
          </Text>
          <Text style={styles.metricHint}>
            {observation
              ? `最終測定 ${observation.remainingMl} mL`
              : '振るタブで測定'}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>氷</Text>
          <Text style={styles.metricValue}>
            {hasScanResult ? iceDisplay : '未測定'}
          </Text>
          <Text style={styles.metricHint}>音からの目安</Text>
        </View>
      </View>

      <View style={styles.hydrationRow}>
        <Text style={styles.hydrationLabel}>今日の飲水</Text>
        <Text style={styles.hydrationValue}>{intakeMl} mL</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="振るタブを開く"
        onPress={onOpenMeasure}
        style={({ pressed }) => [styles.measureLink, pressed && styles.pressed]}
      >
        <Text style={styles.measureLinkText}>振るタブで測定する →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headingCopy: { flex: 1 },
  title: { color: '#17323b', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, lineHeight: 18, marginTop: 5 },
  capacity: { color: '#087ea4', fontSize: 17, fontWeight: '800' },
  metricRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  metricCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f4fafb',
  },
  metricLabel: { color: '#587177', fontSize: 12, fontWeight: '700' },
  metricValue: {
    color: '#087ea4',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
  },
  metricHint: { color: '#8b9ba0', fontSize: 11, lineHeight: 16, marginTop: 5 },
  hydrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e7eff0',
  },
  hydrationLabel: { color: '#36515a', fontSize: 13, fontWeight: '700' },
  hydrationValue: { color: '#168276', fontSize: 18, fontWeight: '800' },
  measureLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 18,
    borderRadius: 11,
    backgroundColor: '#e8f4f6',
  },
  measureLinkText: { color: '#087ea4', fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
