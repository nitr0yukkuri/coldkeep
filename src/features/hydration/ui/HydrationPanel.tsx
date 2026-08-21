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
  reliableObservationDeltaMl,
  todayIntakeMl,
} from '../domain/hydration';

type HydrationPanelProps = {
  state: HydrationState | null;
  capacityText: string;
  goalText: string;
  intakeText: string;
  estimatedIntakeMl: number | null;
  onChangeCapacity(value: string): void;
  onChangeGoal(value: string): void;
  onChangeIntake(value: string): void;
  onSaveProfile(): void;
  onAddManualIntake(amountOverride?: string): void;
  onAcceptEstimatedIntake(): void;
  modelActionLabel: string;
  disabled?: boolean;
};

export function HydrationPanel({
  state,
  capacityText,
  goalText,
  intakeText,
  estimatedIntakeMl,
  onChangeCapacity,
  onChangeGoal,
  onChangeIntake,
  onSaveProfile,
  onAddManualIntake,
  onAcceptEstimatedIntake,
  modelActionLabel,
  disabled = false,
}: HydrationPanelProps) {
  const intakeMl = state ? todayIntakeMl(state) : 0;
  const goalMl = state?.profile.dailyGoalMl ?? 1_500;
  const progress = Math.min(1, goalMl > 0 ? intakeMl / goalMl : 0);
  const observation = state ? latestObservation(state) : null;
  const remainingDeltaMl = state ? reliableObservationDeltaMl(state) : null;
  const observationIsReliable =
    observation?.confidence !== null &&
    observation?.confidence !== undefined &&
    observation.confidence >= MIN_ACOUSTIC_CONFIDENCE;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>今日の水分</Text>
          <Text style={styles.subtitle}>飲んだ量を自分で記録できます</Text>
        </View>
        <Text style={styles.total}>{intakeMl} mL</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.goalText}>目標 {goalMl} mL</Text>

      <View style={styles.inputRow}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>水筒容量</Text>
          <TextInput
            style={styles.input}
            value={capacityText}
            onChangeText={onChangeCapacity}
            keyboardType="number-pad"
            editable={!disabled}
          />
          <Text style={styles.inputUnit}>mL</Text>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>1日の目標</Text>
          <TextInput
            style={styles.input}
            value={goalText}
            onChangeText={onChangeGoal}
            keyboardType="number-pad"
            editable={!disabled}
          />
          <Text style={styles.inputUnit}>mL</Text>
        </View>
      </View>
      <TouchableOpacity
        disabled={disabled}
        style={styles.secondaryButton}
        onPress={onSaveProfile}
      >
        <Text style={styles.secondaryButtonText}>設定を保存</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>飲んだ量を追加</Text>
      <View style={styles.quickRow}>
        {[100, 250, 500].map(amount => (
          <TouchableOpacity
            key={amount}
            disabled={disabled}
            style={styles.quickButton}
            onPress={() => {
              onChangeIntake(String(amount));
              onAddManualIntake(String(amount));
            }}
          >
            <Text style={styles.quickButtonText}>＋{amount} mL</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.customRow}>
        <TextInput
          style={styles.customInput}
          value={intakeText}
          onChangeText={onChangeIntake}
          keyboardType="number-pad"
          placeholder="任意の量"
          placeholderTextColor="#8b9ba0"
          editable={!disabled}
        />
        <TouchableOpacity
          disabled={disabled}
          style={styles.addButton}
          onPress={() => onAddManualIntake()}
        >
          <Text style={styles.addButtonText}>追加</Text>
        </TouchableOpacity>
      </View>

      {observation ? (
        <View style={styles.observationBox}>
          <Text style={styles.observationText}>
            現在の推定残量: 約{observation.remainingMl} mL
          </Text>
          {!observationIsReliable ? (
            <Text style={styles.observationSubtext}>
              モデル確率が低いため、飲水量の差分は作成しません
            </Text>
          ) : remainingDeltaMl === null ? (
            <Text style={styles.observationSubtext}>
              次の音響チェック結果と比較すると飲水量候補を確認できます
            </Text>
          ) : remainingDeltaMl > 0 ? (
            <Text style={styles.observationSubtext}>
              前回から約{remainingDeltaMl} mL減少
            </Text>
          ) : remainingDeltaMl < 0 ? (
            <Text style={styles.observationSubtext}>
              前回から約{Math.abs(remainingDeltaMl)} mL増加（補充など）
            </Text>
          ) : (
            <Text style={styles.observationSubtext}>前回から変化なし</Text>
          )}
        </View>
      ) : null}
      {estimatedIntakeMl ? (
        <View style={styles.estimateBox}>
          <Text style={styles.estimateText}>
            前回の残量との差は約{estimatedIntakeMl} mLです
          </Text>
          <Text style={styles.estimateSubtext}>
            補充・こぼれがあった場合は飲水量として記録しないでください
          </Text>
          <TouchableOpacity
            disabled={disabled}
            style={styles.estimateButton}
            onPress={onAcceptEstimatedIntake}
          >
            <Text style={styles.estimateButtonText}>飲水量として記録</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.note}>
        「{modelActionLabel}
        」音のモデルによる残量観測は参考値です。水筒・距離・動作・周囲の音で誤差が出ます。必要なら手動で修正してください。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  titleCopy: { flex: 1 },
  title: { color: '#17323b', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#73878c', fontSize: 12, marginTop: 3 },
  total: { color: '#087ea4', fontSize: 21, fontWeight: '800' },
  progressTrack: {
    height: 9,
    marginTop: 14,
    borderRadius: 5,
    backgroundColor: '#e4eef0',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#087ea4' },
  goalText: {
    color: '#73878c',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'right',
  },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  inputGroup: { flex: 1, position: 'relative' },
  inputLabel: { color: '#62747a', fontSize: 12, marginBottom: 5 },
  input: {
    color: '#17323b',
    backgroundColor: '#f8fbfb',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    paddingRight: 30,
  },
  inputUnit: {
    position: 'absolute',
    right: 9,
    bottom: 10,
    color: '#73878c',
    fontSize: 11,
  },
  secondaryButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  secondaryButtonText: { color: '#087ea4', fontSize: 12, fontWeight: '700' },
  sectionLabel: {
    color: '#36515a',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: '#e8f4f6',
  },
  quickButtonText: { color: '#087ea4', fontSize: 12, fontWeight: '700' },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  customInput: {
    flex: 1,
    color: '#17323b',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  addButton: {
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: '#087ea4',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  observationBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#f4fafb',
  },
  observationText: { color: '#36515a', fontSize: 12 },
  observationSubtext: { color: '#587177', fontSize: 12, marginTop: 4 },
  estimateBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: '#fff7e6',
  },
  estimateText: { color: '#765a1f', fontSize: 12 },
  estimateSubtext: {
    color: '#8a6d32',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  estimateButton: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  estimateButtonText: { color: '#9a6d14', fontSize: 12, fontWeight: '700' },
  note: { color: '#8b9ba0', fontSize: 11, lineHeight: 16, marginTop: 12 },
});
