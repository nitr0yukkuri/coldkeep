import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HydrationState } from '../domain/hydration';

type DayPoint = {
  key: string;
  label: string;
  amountMl: number;
  isToday: boolean;
};

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDayPoints(state: HydrationState, now = new Date()): DayPoint[] {
  const totals = new Map<string, number>();
  for (const intake of state.intakes) {
    const date = new Date(intake.recordedAt);
    if (!Number.isFinite(date.getTime())) {
      continue;
    }
    const key = localDayKey(date);
    totals.set(key, (totals.get(key) ?? 0) + intake.amountMl);
  }

  const todayKey = localDayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(now.getDate() - (6 - index));
    const key = localDayKey(date);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      amountMl: totals.get(key) ?? 0,
      isToday: key === todayKey,
    };
  });
}

type HydrationHistoryChartProps = {
  state: HydrationState | null;
};

export function HydrationHistoryChart({ state }: HydrationHistoryChartProps) {
  const points = state ? createDayPoints(state) : [];
  const maxMl = Math.max(...points.map(point => point.amountMl), 1);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel="過去7日間の飲水量グラフ"
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>7日間の摂取量</Text>
          <Text style={styles.subtitle}>保存済みの摂取量を自動集計</Text>
        </View>
        <Text style={styles.unit}>mL</Text>
      </View>
      <View style={styles.chart}>
        {points.map(point => {
          const height = Math.max(4, (point.amountMl / maxMl) * 100);
          return (
            <View key={point.key} style={styles.column}>
              <Text style={styles.amountLabel}>{point.amountMl} mL</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${height}%` },
                    point.isToday && styles.todayBar,
                  ]}
                />
              </View>
              <Text
                style={[styles.dayLabel, point.isToday && styles.todayLabel]}
              >
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.todaySwatch]} />
          <Text style={styles.legendText}>今日</Text>
        </View>
        <Text style={styles.legendText}>未記録日は0 mL</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#17323b', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, marginTop: 5 },
  unit: { color: '#087ea4', fontSize: 12, fontWeight: '800' },
  chart: {
    height: 156,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 18,
    position: 'relative',
  },
  column: { flex: 1, height: '100%', alignItems: 'center' },
  amountLabel: {
    height: 18,
    color: '#73878c',
    fontSize: 10,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    maxWidth: 30,
    height: 96,
    justifyContent: 'flex-end',
    borderRadius: 8,
    backgroundColor: '#edf4f5',
    overflow: 'hidden',
  },
  bar: { width: '100%', borderRadius: 8, backgroundColor: '#8ecbd2' },
  todayBar: { backgroundColor: '#087ea4' },
  dayLabel: { height: 20, marginTop: 6, color: '#73878c', fontSize: 10 },
  todayLabel: { color: '#087ea4', fontWeight: '800' },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
  todaySwatch: { backgroundColor: '#087ea4' },
  legendText: { color: '#8b9ba0', fontSize: 10 },
});
