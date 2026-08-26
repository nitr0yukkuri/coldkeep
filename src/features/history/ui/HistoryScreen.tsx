import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import type {
  HydrationIntake,
  HydrationObservation,
  HydrationState,
} from '../../hydration/domain/hydration';

type HistoryScreenProps = {
  state: HydrationState | null;
  onOpenMeasure(): void;
};

type HistoryRecord =
  | { kind: 'observation'; value: HydrationObservation }
  | { kind: 'intake'; value: HydrationIntake };

function recordTime(recordedAt: string): string {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) {
    return '時刻不明';
  }
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryScreen({ state, onOpenMeasure }: HistoryScreenProps) {
  const records: HistoryRecord[] = state
    ? [
        ...state.observations.map(value => ({
          kind: 'observation' as const,
          value,
        })),
        ...state.intakes.map(value => ({ kind: 'intake' as const, value })),
      ]
        .sort(
          (left, right) =>
            new Date(right.value.recordedAt).getTime() -
            new Date(left.value.recordedAt).getTime(),
        )
        .slice(0, 10)
    : [];

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.title}>最近の記録</Text>
          <Text style={styles.subtitle}>振るだけで残量と飲水量を残せます</Text>
        </View>
        <Text style={styles.count}>{records.length}</Text>
      </View>

      {records.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={30} color="#087ea4" />
          </View>
          <Text style={styles.emptyTitle}>まだ記録がありません</Text>
          <Text style={styles.emptyText}>
            水筒を振って測定すると、残量と飲水量がここに残ります。
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="振って測定する"
            onPress={onOpenMeasure}
            style={({ pressed }) => [
              styles.measureButton,
              pressed && styles.measureButtonPressed,
            ]}
          >
            <Text style={styles.measureButtonText}>振って測定する</Text>
            <Ionicons name="arrow-forward" size={16} color="#087ea4" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {records.map(record => (
            <View
              key={`${record.kind}-${record.value.recordedAt}-${
                record.kind === 'observation'
                  ? record.value.observationId
                  : record.value.intakeId
              }`}
              style={styles.row}
            >
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>
                  {record.kind === 'observation' ? '残量を測定' : '飲水を記録'}
                </Text>
                <Text style={styles.rowMeta}>
                  {recordTime(record.value.recordedAt)} ·{' '}
                  {record.kind === 'observation'
                    ? `残量 ${record.value.remainingMl} mL`
                    : `${record.value.amountMl} mL`}
                </Text>
              </View>
              <Text style={styles.rowSource}>
                {record.kind === 'observation'
                  ? record.value.source === 'acoustic'
                    ? '音響'
                    : '—'
                  : record.value.source === 'acoustic'
                    ? '自動'
                    : '手動'}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  title: { color: '#17323b', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, marginTop: 5 },
  count: { color: '#087ea4', fontSize: 24, fontWeight: '800' },
  emptyState: {
    marginTop: 22,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#f4fafb',
    alignItems: 'center',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: '#dff1f3',
  },
  emptyTitle: {
    color: '#36515a',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyText: {
    color: '#73878c',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textAlign: 'center',
  },
  measureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#b7dfe4',
  },
  measureButtonText: { color: '#087ea4', fontSize: 13, fontWeight: '800' },
  measureButtonPressed: { opacity: 0.72 },
  list: { marginTop: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#e7eff0',
  },
  rowCopy: { flex: 1 },
  rowTitle: { color: '#36515a', fontSize: 13, fontWeight: '700' },
  rowMeta: { color: '#73878c', fontSize: 12, marginTop: 4 },
  rowSource: { color: '#087ea4', fontSize: 11, fontWeight: '700' },
});
