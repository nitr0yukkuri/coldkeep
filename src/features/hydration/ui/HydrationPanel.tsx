import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  HydrationState,
  MIN_ACOUSTIC_CONFIDENCE,
  latestObservation,
  todayIntakeMl,
} from '../domain/hydration';
import { HydrationHistoryChart } from './HydrationHistoryChart';

type HydrationPanelProps = {
  state: HydrationState | null;
  capacityText: string;
  autoRecordedIntakeMl: number | null;
  onChangeCapacity(value: string): void;
  onSaveProfile(): void;
  modelActionLabel: string;
  disabled?: boolean;
};

export function HydrationPanel({
  state,
  capacityText,
  autoRecordedIntakeMl,
  onChangeCapacity,
  onSaveProfile,
  modelActionLabel,
  disabled = false,
}: HydrationPanelProps) {
  const observation = state ? latestObservation(state) : null;
  const intakeMl = state ? todayIntakeMl(state) : 0;
  const observationIsReliable =
    observation?.confidence !== null &&
    observation?.confidence !== undefined &&
    observation.confidence >= MIN_ACOUSTIC_CONFIDENCE;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>今日の水分</Text>
          <Text style={styles.subtitle}>振る音から自動で記録します</Text>
        </View>
        <Text style={styles.total}>{intakeMl} mL</Text>
      </View>

      <HydrationHistoryChart state={state} />

      <View style={styles.capacitySection}>
        <View style={styles.capacityCopy}>
          <Text style={styles.inputLabel}>水筒容量</Text>
          <Text style={styles.capacityHint}>
            容量だけ最初に設定してください
          </Text>
        </View>
        <View style={styles.capacityInputRow}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={capacityText}
              onChangeText={onChangeCapacity}
              keyboardType="number-pad"
              accessibilityLabel="水筒容量"
              editable={!disabled}
            />
            <Text style={styles.inputUnit}>mL</Text>
          </View>
          <TouchableOpacity
            disabled={disabled}
            accessibilityRole="button"
            style={styles.saveButton}
            onPress={onSaveProfile}
          >
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      {observation ? (
        <View style={styles.observationBox}>
          <Text style={styles.observationText}>
            現在の推定残量: 約{observation.remainingMl} mL
          </Text>
          {autoRecordedIntakeMl !== null ? (
            <Text style={styles.observationSubtext}>
              音から約{autoRecordedIntakeMl} mLを自動記録しました
            </Text>
          ) : !observationIsReliable ? (
            <Text style={styles.observationSubtext}>
              信頼度が低いため、飲水量は自動記録しません
            </Text>
          ) : (
            <Text style={styles.observationSubtext}>
              次の測定で残量の差分を自動計算します
            </Text>
          )}
        </View>
      ) : null}

      <Text style={styles.note}>
        「{modelActionLabel}」音の信頼度が十分なときだけ、残量の差分を飲水量として自動記録します。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: 20,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  titleCopy: { flex: 1 },
  title: { color: '#17323b', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, marginTop: 5 },
  total: { color: '#087ea4', fontSize: 23, fontWeight: '800' },
  capacitySection: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#e2ecee',
  },
  capacityCopy: { marginBottom: 9 },
  inputLabel: { color: '#36515a', fontSize: 13, fontWeight: '700' },
  capacityHint: { color: '#73878c', fontSize: 11, marginTop: 3 },
  capacityInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  inputWrapper: { flex: 1, position: 'relative' },
  input: {
    color: '#17323b',
    backgroundColor: '#f8fbfb',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    paddingRight: 42,
  },
  inputUnit: {
    position: 'absolute',
    right: 12,
    top: 12,
    color: '#73878c',
    fontSize: 11,
  },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#087ea4',
  },
  saveButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  observationBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f4fafb',
  },
  observationText: { color: '#36515a', fontSize: 13, fontWeight: '700' },
  observationSubtext: { color: '#587177', fontSize: 12, lineHeight: 18, marginTop: 5 },
  note: { color: '#8b9ba0', fontSize: 11, lineHeight: 17, marginTop: 16 },
});
