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
  isObservationFromToday,
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
  loading?: boolean;
  feedback?: string | null;
  loadError?: string | null;
  onRetryLoad?(): void;
};

export function HydrationPanel({
  state,
  capacityText,
  autoRecordedIntakeMl,
  onChangeCapacity,
  onSaveProfile,
  modelActionLabel,
  disabled = false,
  loading = false,
  feedback = null,
  loadError = null,
  onRetryLoad,
}: HydrationPanelProps) {
  const observation = state ? latestObservation(state) : null;
  const intakeMl = state ? todayIntakeMl(state) : 0;
  const observationIsToday =
    observation !== null && isObservationFromToday(observation);
  const observationIsReliable =
    observation?.confidence !== null &&
    observation?.confidence !== undefined &&
    observation.confidence >= MIN_ACOUSTIC_CONFIDENCE;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>今日の水分</Text>
          <Text style={styles.subtitle}>
            {loading
              ? '保存済みデータを読み込み中…'
              : loadError
                ? '保存済みデータを読み込めませんでした'
                : '振る音から自動で記録します'}
          </Text>
        </View>
        <Text style={styles.total}>{loading || loadError ? '—' : intakeMl + ' mL'}</Text>
      </View>

      <HydrationHistoryChart state={state} loading={loading} error={loadError} />

      <View style={styles.capacitySection}>
        <View style={styles.capacityCopy}>
          <Text style={styles.inputLabel}>水筒容量</Text>
          <Text style={styles.capacityHint}>
            {loading
              ? 'データを読み込み中です'
              : loadError
                ? '読み込みに失敗しました'
                : '容量だけ最初に設定してください'}
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
              editable={!disabled && !loading && !loadError}
            />
            <Text style={styles.inputUnit}>mL</Text>
          </View>
          <TouchableOpacity
            disabled={disabled || loading || !!loadError}
            accessibilityRole="button"
            style={[
              styles.saveButton,
              (disabled || loading || loadError) && styles.saveButtonDisabled,
            ]}
            onPress={onSaveProfile}
          >
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadError ? (
        <View style={styles.loadErrorBox}>
          <Text style={styles.loadErrorText} accessibilityLiveRegion="polite">
            {loadError}
          </Text>
          {onRetryLoad ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="水分データを再読み込み"
              style={styles.retryButton}
              onPress={onRetryLoad}
            >
              <Text style={styles.retryButtonText}>再読み込み</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      {observation && (observationIsToday || autoRecordedIntakeMl !== null) ? (
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
  saveButtonDisabled: { backgroundColor: '#9aa9ad' },
  feedback: { color: '#087ea4', fontSize: 12, lineHeight: 18, marginTop: 10 },
  loadErrorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff7f3',
  },
  loadErrorText: { color: '#9b5f4c', fontSize: 12, lineHeight: 18 },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 10,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2b9aa',
  },
  retryButtonText: { color: '#9b5f4c', fontSize: 12, fontWeight: '800' },
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
