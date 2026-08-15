import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AppDependencies } from './src/app/types';
import {
  COLLECTION_ACTION_LABELS,
  COLLECTION_ACTION_INSTRUCTIONS,
  COLLECTION_ACTIONS,
  CollectionDraft,
  CollectionLabels,
  MODEL_RECORDING_ACTION,
  validateCollectionDraft,
} from './src/features/collection/domain/collection';
import type { RecordingRef } from './src/features/shared/application/ports';
import {
  MIN_SCAN_CONFIDENCE,
  InferenceEngine,
} from './src/features/scan/domain/scanResult';
import {
  DEFAULT_HYDRATION_PROFILE,
  HydrationState,
} from './src/features/hydration/domain/hydration';
import { HydrationPanel } from './src/features/hydration/ui/HydrationPanel';

const initialCollectionDraft: CollectionDraft = {
  sessionId: 'session-01',
  containerId: 'bottle-01',
  deviceId: Platform.OS,
  capacityMl: '500',
  waterMl: '250',
  iceCount: '0',
  iceMassG: '0',
  temperatureC: '20',
  microphoneDistanceCm: '10',
  action: MODEL_RECORDING_ACTION,
};

const MetricCard = ({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: string | number;
  unit: string;
  color: string;
}) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text
      style={[
        styles.metricValue,
        typeof value === 'string' &&
          value.length > 6 &&
          styles.metricValueCompact,
        { color },
      ]}
    >
      {value}
    </Text>
    <Text style={styles.metricUnit}>{unit}</Text>
  </View>
);

const LabeledInput = ({
  label,
  value,
  onChangeText,
  numeric = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText(value: string): void;
  numeric?: boolean;
  editable?: boolean;
}) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, !editable && styles.disabledInput]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      autoCapitalize="none"
      editable={editable}
    />
  </View>
);

export default function ColdKeepScreen({ app }: { app: AppDependencies }) {
  const [mode, setMode] = useState<'scan' | 'collect'>('scan');
  const [status, setStatus] = useState('準備できました');
  const [content, setContent] = useState('UNKNOWN');
  const [fillLevel, setFillLevel] = useState('—');
  const [waterConfidence, setWaterConfidence] = useState<number | null>(null);
  const [fillConfidence, setFillConfidence] = useState<number | null>(null);
  const [inferenceEngine, setInferenceEngine] =
    useState<InferenceEngine | null>(null);
  const [icePresence, setIcePresence] = useState('UNKNOWN');
  const [hasScanResult, setHasScanResult] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState(
    initialCollectionDraft,
  );
  const [pendingLabels, setPendingLabels] = useState<CollectionLabels | null>(
    null,
  );
  const [savedRecordings, setSavedRecordings] = useState(0);
  const [hydrationState, setHydrationState] = useState<HydrationState | null>(
    null,
  );
  const [capacityText, setCapacityText] = useState(
    String(DEFAULT_HYDRATION_PROFILE.capacityMl),
  );
  const [goalText, setGoalText] = useState(
    String(DEFAULT_HYDRATION_PROFILE.dailyGoalMl),
  );
  const [intakeText, setIntakeText] = useState('250');
  const [estimatedIntakeMl, setEstimatedIntakeMl] = useState<number | null>(
    null,
  );
  const waterDisplay =
    content === 'WATER'
      ? '水あり'
      : content === 'NON-WATER'
        ? '水なし'
        : '未判定';
  const iceDisplay =
    icePresence === 'PRESENT'
      ? 'あり'
      : icePresence === 'ABSENT'
        ? 'なし'
        : '未判定';
  const hasResult = hasScanResult;
  const modelActionLabel = COLLECTION_ACTION_LABELS[MODEL_RECORDING_ACTION];
  const modelActionInstruction =
    COLLECTION_ACTION_INSTRUCTIONS[MODEL_RECORDING_ACTION];
  const formatProbability = (value: number | null) =>
    value === null ? '—' : `${Math.round(value * 100)}%`;

  useEffect(() => {
    if (mode === 'collect') {
      setStatus('データ収集の準備ができました');
    } else {
      setStatus('準備できました');
    }
  }, [mode]);

  useEffect(() => {
    let active = true;
    app.hydration
      .load()
      .then(state => {
        if (!active) {
          return;
        }
        setHydrationState(state);
        setCapacityText(String(state.profile.capacityMl));
        setGoalText(String(state.profile.dailyGoalMl));
      })
      .catch(error => {
        if (active) {
          setStatus(
            error instanceof Error
              ? error.message
              : '水分記録を読み込めませんでした',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [app]);

  const updateCollectionField = useCallback(
    <Key extends keyof CollectionDraft>(
      key: Key,
      value: CollectionDraft[Key],
    ) => {
      setCollectionDraft(current => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleScan = useCallback(
    async (recording: RecordingRef) => {
      try {
        setStatus('確認中…');
        setEstimatedIntakeMl(null);
        const result = await app.scan.execute(recording);
        const waterIsReliable =
          Number.isFinite(result.waterConfidence) &&
          result.waterConfidence >= MIN_SCAN_CONFIDENCE;
        const fillIsReliable =
          !result.containsWater ||
          (result.fillConfidence !== null &&
            Number.isFinite(result.fillConfidence) &&
            result.fillConfidence >= MIN_SCAN_CONFIDENCE);
        setHasScanResult(true);
        setContent(
          !waterIsReliable
            ? 'UNKNOWN'
            : result.containsWater
              ? 'WATER'
              : 'NON-WATER',
        );
        setFillLevel(
          result.fillLevel === null || !fillIsReliable
            ? 'N/A'
            : `${result.fillLevel}%`,
        );
        setWaterConfidence(result.waterConfidence);
        setFillConfidence(result.fillConfidence);
        setInferenceEngine(result.engine);
        setIcePresence(
          result.icePresence === null
            ? 'UNKNOWN'
            : result.icePresence
              ? 'PRESENT'
              : 'ABSENT',
        );
        if (
          waterIsReliable &&
          fillIsReliable &&
          result.containsWater &&
          result.fillLevel !== null
        ) {
          const confidences = [
            result.waterConfidence,
            result.fillConfidence,
          ].filter((value): value is number => value !== null);
          const hydrationResult = await app.hydration.recordObservation({
            remainingMl: Math.round(
              ((hydrationState?.profile.capacityMl ??
                DEFAULT_HYDRATION_PROFILE.capacityMl) *
                result.fillLevel) /
                100,
            ),
            fillLevel: result.fillLevel,
            confidence: confidences.length ? Math.min(...confidences) : null,
          });
          setHydrationState(hydrationResult.state);
          setEstimatedIntakeMl(hydrationResult.estimatedConsumedMl);
        }
        setStatus('確認が完了しました');
      } catch (error) {
        console.error(error);
        setContent('UNKNOWN');
        setHasScanResult(false);
        setFillLevel('—');
        setWaterConfidence(null);
        setFillConfidence(null);
        setInferenceEngine(null);
        setIcePresence('UNKNOWN');
        setStatus(
          error instanceof Error ? error.message : '確認に失敗しました',
        );
      }
    },
    [app, hydrationState?.profile.capacityMl],
  );

  async function saveHydrationProfile() {
    try {
      const state = await app.hydration.updateProfile({
        capacityMl: Number(capacityText),
        dailyGoalMl: Number(goalText),
      });
      setHydrationState(state);
      setCapacityText(String(state.profile.capacityMl));
      setGoalText(String(state.profile.dailyGoalMl));
      setStatus('水分設定を保存しました');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '水分設定を保存できませんでした',
      );
    }
  }

  async function addManualIntake(amountOverride?: string) {
    try {
      const state = await app.hydration.addManualIntake(
        Number(amountOverride ?? intakeText),
      );
      setHydrationState(state);
      setIntakeText('250');
      setStatus('飲水量を記録しました');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '飲水量を記録できませんでした',
      );
    }
  }

  async function acceptEstimatedIntake() {
    if (estimatedIntakeMl === null) {
      return;
    }
    try {
      const latest =
        hydrationState?.observations[hydrationState.observations.length - 1];
      const state = await app.hydration.addEstimatedIntake(
        estimatedIntakeMl,
        latest?.confidence ?? null,
      );
      setHydrationState(state);
      setEstimatedIntakeMl(null);
      setStatus('音響推定の飲水量を記録しました');
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : '推定飲水量を記録できませんでした',
      );
    }
  }

  async function startRecording() {
    if (isProcessing) {
      return;
    }
    try {
      const labels =
        mode === 'collect' ? validateCollectionDraft(collectionDraft) : null;
      await app.recording.start();

      setPendingLabels(labels);
      setIsRecording(true);
      setIsProcessing(false);
      setStatus('録音中…');
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setStatus(
        error instanceof Error ? error.message : '録音を開始できませんでした',
      );
    }
  }

  async function saveCollectionRecording(
    recording: RecordingRef,
    labels: CollectionLabels,
  ) {
    setStatus('録音を保存中…');
    const record = await app.collect.execute(recording, labels);
    setSavedRecordings(count => count + 1);
    setStatus(`保存しました（${record.recordingId}）`);
  }

  async function shareManifest() {
    try {
      await app.exportDataset.execute();
      setStatus('CSVを書き出しました');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'CSVを書き出せませんでした',
      );
    }
  }

  async function stopRecording() {
    if (!isRecording || isProcessing) {
      return;
    }
    setIsProcessing(true);
    let recording: RecordingRef | null = null;
    try {
      setStatus(mode === 'collect' ? '録音を保存中…' : '確認中…');
      recording = await app.recording.stop();

      setIsRecording(false);
      if (mode === 'collect') {
        if (!pendingLabels) {
          throw new Error('Collection labels were not captured');
        }
        await saveCollectionRecording(recording, pendingLabels);
      } else {
        await handleScan(recording);
      }
      setPendingLabels(null);
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setPendingLabels(null);
      setStatus(
        error instanceof Error ? error.message : '録音を処理できませんでした',
      );
    } finally {
      if (recording) {
        await app.recording.cleanup(recording).catch(() => undefined);
      }
      setIsProcessing(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ColdKeep</Text>
        <Text style={styles.headerSubtitle}>
          {mode === 'scan' ? '音響チェック' : 'データ収集'}
        </Text>
      </View>

      {mode === 'scan' ? (
        <View style={styles.scanScreen}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>現在の状態</Text>
            <Text
              style={[
                styles.heroValue,
                waterDisplay.length > 8 && styles.heroValueCompact,
              ]}
            >
              {waterDisplay}
            </Text>
            <Text style={styles.heroDescription}>
              {!hasScanResult
                ? `${modelActionInstruction}を1秒以上録音します`
                : content === 'UNKNOWN'
                  ? '信頼度が低いため判定できませんでした。条件をそろえて再試行してください'
                  : content === 'WATER'
                    ? '水が入っています'
                    : '水が検出されませんでした'}
            </Text>
          </View>

          {hasResult ? (
            <View style={styles.metricRow}>
              {content === 'WATER' && fillLevel !== 'N/A' ? (
                <MetricCard
                  title="充填率"
                  value={fillLevel}
                  unit="50% / 90%の目安"
                  color="#087ea4"
                />
              ) : null}
              <MetricCard
                title="氷の有無"
                value={iceDisplay}
                unit={
                  icePresence === 'UNKNOWN' ? '学習前は未判定' : '音からの目安'
                }
                color="#168276"
              />
            </View>
          ) : null}

          <View style={styles.analysisCard}>
            <Text style={styles.analysisDescription}>
              水筒の音を聞いて状態を確認します
            </Text>
            <Text style={styles.analysisHint}>
              {isProcessing
                ? '確認中です。少しお待ちください'
                : isRecording
                  ? `${modelActionLabel}動作が終わったら停止してください`
                  : `${modelActionInstruction}を1秒以上録音してください`}
            </Text>
            <TouchableOpacity
              disabled={isProcessing}
              style={[
                styles.analysisButton,
                isRecording && styles.analysisButtonActive,
                isProcessing && styles.analysisButtonDisabled,
              ]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Text style={styles.analysisButtonText}>
                {isProcessing
                  ? '確認中…'
                  : isRecording
                    ? '停止して確認'
                    : 'チェックする'}
              </Text>
            </TouchableOpacity>
            {status !== '準備できました' && status !== '確認が完了しました' ? (
              <Text style={styles.analysisStatus}>{status}</Text>
            ) : null}
          </View>

          {hasResult ? (
            <View style={styles.inferenceCard}>
              <Text style={styles.inferenceTitle}>推論情報</Text>
              <Text style={styles.inferenceText}>
                {modelActionLabel}音モデル ·{' '}
                {inferenceEngine === 'rust' ? 'Rust' : 'TypeScript'}経路
              </Text>
              <Text style={styles.inferenceText}>
                水判定確率 {formatProbability(waterConfidence)}
                {content === 'WATER'
                  ? ` · 充填クラス確率 ${formatProbability(fillConfidence)}`
                  : ''}
              </Text>
              <Text style={styles.inferenceHint}>
                確率はこの録音に対するモデル出力で、正解率を意味しません。
              </Text>
            </View>
          ) : null}

          <HydrationPanel
            state={hydrationState}
            capacityText={capacityText}
            goalText={goalText}
            intakeText={intakeText}
            estimatedIntakeMl={estimatedIntakeMl}
            onChangeCapacity={setCapacityText}
            onChangeGoal={setGoalText}
            onChangeIntake={setIntakeText}
            onSaveProfile={saveHydrationProfile}
            onAddManualIntake={addManualIntake}
            onAcceptEstimatedIntake={acceptEstimatedIntake}
            modelActionLabel={modelActionLabel}
          />

          <Text style={styles.resultNote}>
            結果は録音動作、距離、容器、周囲の音で変わります。前回の残量との差分は参考値として確認できます。
          </Text>
          <TouchableOpacity
            disabled={isRecording || isProcessing}
            style={styles.developerLink}
            onPress={() => setMode('collect')}
          >
            <Text style={styles.developerLinkText}>データ収集（開発用）</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.collectionPanel}>
          <View style={styles.collectionHeaderRow}>
            <View style={styles.collectionHeaderText}>
              <Text style={styles.sectionTitle}>データ収集</Text>
              <Text style={styles.sectionHint}>
                学習用の録音と実測値を保存します
              </Text>
            </View>
            <TouchableOpacity
              disabled={isRecording || isProcessing}
              style={styles.backLink}
              onPress={() => setMode('scan')}
            >
              <Text style={styles.backLinkText}>チェック画面へ</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputGrid}>
            <LabeledInput
              label="セッション"
              value={collectionDraft.sessionId}
              onChangeText={value => updateCollectionField('sessionId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="水筒"
              value={collectionDraft.containerId}
              onChangeText={value =>
                updateCollectionField('containerId', value)
              }
              editable={!isRecording}
            />
            <LabeledInput
              label="端末"
              value={collectionDraft.deviceId}
              onChangeText={value => updateCollectionField('deviceId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="容量 (mL)"
              value={collectionDraft.capacityMl}
              onChangeText={value => updateCollectionField('capacityMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="水量 (mL)"
              value={collectionDraft.waterMl}
              onChangeText={value => updateCollectionField('waterMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="氷の個数"
              value={collectionDraft.iceCount}
              onChangeText={value => updateCollectionField('iceCount', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="氷の重さ (g)"
              value={collectionDraft.iceMassG}
              onChangeText={value => updateCollectionField('iceMassG', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="水温 (°C)"
              value={collectionDraft.temperatureC}
              onChangeText={value =>
                updateCollectionField('temperatureC', value)
              }
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="マイク距離 (cm)"
              value={collectionDraft.microphoneDistanceCm}
              onChangeText={value =>
                updateCollectionField('microphoneDistanceCm', value)
              }
              numeric
              editable={!isRecording}
            />
          </View>
          <Text style={styles.inputLabel}>動作</Text>
          <View style={styles.actionRow}>
            {COLLECTION_ACTIONS.map(action => (
              <TouchableOpacity
                key={action}
                disabled={isRecording}
                style={[
                  styles.actionButton,
                  collectionDraft.action === action && styles.activeAction,
                ]}
                onPress={() => updateCollectionField('action', action)}
              >
                <Text style={styles.actionText}>
                  {COLLECTION_ACTION_LABELS[action]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.savedCount}>今回保存: {savedRecordings}件</Text>
        </View>
      )}

      {mode === 'collect' ? (
        <View style={styles.controls}>
          <Text style={styles.collectionStatus}>{status}</Text>
          <TouchableOpacity
            disabled={isProcessing}
            style={[styles.button, isRecording && styles.activeRec]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.buttonText}>
              {isRecording ? '停止して保存' : '録音して保存'}
            </Text>
          </TouchableOpacity>
          {!isRecording ? (
            <TouchableOpacity
              style={styles.exportButton}
              onPress={shareManifest}
            >
              <Text style={styles.exportText}>CSVを書き出す</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f7f8',
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 40,
  },
  header: { marginBottom: 24, alignItems: 'center' },
  headerTitle: { fontSize: 30, fontWeight: '800', color: '#17323b' },
  headerSubtitle: { color: '#62747a', marginTop: 4, fontSize: 15 },
  scanScreen: { width: '90%', alignItems: 'center' },
  heroCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#e8f4f6',
    borderWidth: 1,
    borderColor: '#c4e2e6',
  },
  heroLabel: { color: '#5a737a', fontSize: 14, fontWeight: '600' },
  heroValue: {
    color: '#087ea4',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 10,
  },
  heroValueCompact: { fontSize: 28 },
  heroDescription: {
    color: '#45636a',
    fontSize: 15,
    marginTop: 4,
    textAlign: 'center',
  },
  metricRow: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 12 },
  metricCard: {
    flex: 1,
    minHeight: 112,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
    borderLeftWidth: 3,
  },
  metricTitle: { color: '#36515a', fontSize: 13, fontWeight: '600' },
  metricValue: {
    color: '#087ea4',
    fontSize: 25,
    fontWeight: '800',
    marginTop: 10,
  },
  metricValueCompact: { fontSize: 17 },
  metricUnit: { color: '#73878c', fontSize: 11, marginTop: 5 },
  analysisCard: {
    width: '100%',
    alignItems: 'center',
    padding: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  analysisDescription: { color: '#36515a', fontSize: 15, fontWeight: '600' },
  analysisHint: {
    color: '#73878c',
    fontSize: 13,
    marginTop: 5,
    textAlign: 'center',
  },
  analysisButton: {
    width: '100%',
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
    borderRadius: 12,
    backgroundColor: '#087ea4',
  },
  analysisButtonActive: { backgroundColor: '#c94f57' },
  analysisButtonDisabled: { backgroundColor: '#9aa9ad' },
  analysisButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  analysisStatus: {
    color: '#b04b50',
    fontSize: 12,
    marginTop: 9,
    textAlign: 'center',
  },
  inferenceCard: {
    width: '100%',
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  inferenceTitle: { color: '#36515a', fontSize: 13, fontWeight: '800' },
  inferenceText: { color: '#587177', fontSize: 12, marginTop: 5 },
  inferenceHint: {
    color: '#8b9ba0',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 7,
  },
  resultNote: {
    color: '#73878c',
    fontSize: 12,
    marginTop: 14,
    textAlign: 'center',
  },
  developerLink: { marginTop: 20, paddingVertical: 8, paddingHorizontal: 10 },
  developerLinkText: { color: '#6d8489', fontSize: 12 },
  collectionStatus: {
    color: '#62747a',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
  },
  collectionPanel: { width: '90%', marginBottom: 18 },
  collectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  collectionHeaderText: { flex: 1, paddingRight: 12 },
  sectionTitle: { color: '#17323b', fontSize: 20, fontWeight: '800' },
  sectionHint: { color: '#62747a', fontSize: 13, lineHeight: 18, marginTop: 5 },
  backLink: { paddingVertical: 4 },
  backLinkText: { color: '#087ea4', fontSize: 12, fontWeight: '700' },
  controls: { alignItems: 'center', width: '90%' },
  button: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#087ea4',
    paddingVertical: 16,
    borderRadius: 12,
  },
  activeRec: { backgroundColor: '#c94f57' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  inputGroup: { width: '50%', paddingHorizontal: 5, marginBottom: 12 },
  inputLabel: { color: '#62747a', fontSize: 12, marginBottom: 5 },
  input: {
    color: '#17323b',
    backgroundColor: '#fff',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  disabledInput: { opacity: 0.55 },
  actionRow: { flexDirection: 'row', marginBottom: 12 },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    marginRight: 6,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4e1e3',
  },
  activeAction: { backgroundColor: '#dceff1', borderColor: '#087ea4' },
  actionText: { color: '#36515a', fontSize: 12, fontWeight: '700' },
  savedCount: { color: '#73878c', textAlign: 'right' },
  exportButton: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 24 },
  exportText: { color: '#087ea4', fontWeight: '700' },
});
