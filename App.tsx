import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  levelToFillClass,
  remainingMlFromShake,
} from './src/features/scan/domain/shakeFillLevel';
import { iceAmountClassLabel } from './src/features/scan/domain/iceAmount';
import {
  DEFAULT_HYDRATION_PROFILE,
  HydrationState,
} from './src/features/hydration/domain/hydration';
import { HydrationPanel } from './src/features/hydration/ui/HydrationPanel';
import { MAX_CAPTURE_SECONDS } from './src/platform/audio/pcmCapture';

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
      accessibilityLabel={label}
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
  const [measurementStatus, setMeasurementStatus] = useState<
    'trained' | 'experimental' | 'untrained'
  >('untrained');
  const [inferenceEngine, setInferenceEngine] =
    useState<InferenceEngine | null>(null);
  const [icePresence, setIcePresence] = useState('UNKNOWN');
  const [iceStatus, setIceStatus] = useState<'untrained' | 'trained'>(
    'untrained',
  );
  const [iceConfidence, setIceConfidence] = useState<number | null>(null);
  const [iceAmount, setIceAmount] = useState<'none' | 'few' | 'many' | null>(
    null,
  );
  const [iceAmountStatus, setIceAmountStatus] = useState<
    'trained' | 'experimental' | 'untrained'
  >('untrained');
  const [iceAmountConfidence, setIceAmountConfidence] = useState<number | null>(
    null,
  );
  const [hasScanResult, setHasScanResult] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
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
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopInFlightRef = useRef(false);
  const waterDisplay =
    content === 'SHAKE'
      ? fillLevel === 'N/A'
        ? '未判定'
        : `残量 ${fillLevel}`
      : content === 'WATER'
        ? '水あり'
        : content === 'NON-WATER'
          ? '水なし'
          : '未判定';
  const iceDisplay =
    iceAmount !== null
      ? iceAmountClassLabel(iceAmount)
      : icePresence === 'PRESENT'
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
    if (!isRecording || recordingStartedAt === null) {
      return;
    }
    const timer = setInterval(() => {
      setRecordingElapsedMs(Date.now() - recordingStartedAt);
    }, 100);
    return () => clearInterval(timer);
  }, [isRecording, recordingStartedAt]);

  useEffect(() => {
    if (
      !isRecording ||
      isProcessing ||
      recordingElapsedMs < MAX_CAPTURE_SECONDS * 1000
    ) {
      return;
    }
    const pendingStop = stopRecordingRef.current?.();
    pendingStop?.catch(() => undefined);
  }, [isProcessing, isRecording, recordingElapsedMs]);

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
        const shakeMode = result.measurementAction === 'shake';
        const waterIsReliable = shakeMode
          ? result.measurementStatus === 'trained' &&
            result.fillConfidence !== null &&
            Number.isFinite(result.fillConfidence) &&
            result.fillConfidence >= MIN_SCAN_CONFIDENCE
          : Number.isFinite(result.waterConfidence) &&
            result.waterConfidence >= MIN_SCAN_CONFIDENCE;
        const fillIsReliable = shakeMode
          ? waterIsReliable &&
            (result.fillLevel === 0 ||
              result.fillLevel === 50 ||
              result.fillLevel === 100)
          : !result.containsWater ||
            (result.fillConfidence !== null &&
              Number.isFinite(result.fillConfidence) &&
              result.fillConfidence >= MIN_SCAN_CONFIDENCE);
        setHasScanResult(true);
        setContent(
          shakeMode
            ? 'SHAKE'
            : !waterIsReliable
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
        setMeasurementStatus(result.measurementStatus);
        setInferenceEngine(result.engine);
        setIcePresence(
          result.icePresence === null
            ? 'UNKNOWN'
            : result.icePresence
              ? 'PRESENT'
              : 'ABSENT',
        );
        setIceStatus(result.iceStatus);
        setIceConfidence(result.iceConfidence);
        setIceAmount(result.iceAmount);
        setIceAmountStatus(result.iceAmountStatus);
        setIceAmountConfidence(result.iceAmountConfidence);
        if (
          waterIsReliable &&
          fillIsReliable &&
          (shakeMode || result.containsWater) &&
          result.fillLevel !== null &&
          (!shakeMode ||
            result.fillLevel === 0 ||
            result.fillLevel === 50 ||
            result.fillLevel === 100)
        ) {
          const confidences = [
            result.waterConfidence,
            result.fillConfidence,
          ].filter((value): value is number => value !== null);
          const capacity =
            hydrationState?.profile.capacityMl ??
            DEFAULT_HYDRATION_PROFILE.capacityMl;
          const remainingMl = shakeMode
            ? remainingMlFromShake(capacity, {
                fillClass: levelToFillClass(result.fillLevel as 0 | 50 | 100),
                fillLevel: result.fillLevel as 0 | 50 | 100,
                confidence: result.fillConfidence,
                status: 'trained',
              })
            : Math.round((capacity * result.fillLevel) / 100);
          if (remainingMl === null) {
            setStatus('振り音の信頼度が不足しているため残量を記録できません');
            return;
          }
          const hydrationResult = await app.hydration.recordObservation({
            remainingMl,
            fillLevel: result.fillLevel as 0 | 50 | 90 | 100,
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
        setMeasurementStatus('untrained');
        setInferenceEngine(null);
        setIcePresence('UNKNOWN');
        setIceStatus('untrained');
        setIceConfidence(null);
        setIceAmount(null);
        setIceAmountStatus('untrained');
        setIceAmountConfidence(null);
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
      setRecordingStartedAt(Date.now());
      setRecordingElapsedMs(0);
      setIsProcessing(false);
      setStatus('録音中…');
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setRecordingStartedAt(null);
      setRecordingElapsedMs(0);
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
      setStatus('音声とラベルをZIPで書き出しました');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'データを書き出せませんでした',
      );
    }
  }

  async function stopRecording() {
    if (!isRecording || isProcessing || stopInFlightRef.current) {
      return;
    }
    stopInFlightRef.current = true;
    setIsProcessing(true);
    let recording: RecordingRef | null = null;
    let cleanupFailed = false;
    try {
      setStatus(mode === 'collect' ? '録音を保存中…' : '確認中…');
      recording = await app.recording.stop();

      setIsRecording(false);
      setRecordingStartedAt(null);
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
      setRecordingStartedAt(null);
      setRecordingElapsedMs(0);
      setPendingLabels(null);
      setStatus(
        error instanceof Error ? error.message : '録音を処理できませんでした',
      );
    } finally {
      if (recording) {
        try {
          await app.recording.cleanup(recording);
        } catch (error) {
          cleanupFailed = true;
          console.warn('録音ファイルの後始末に失敗しました', error);
        }
      }
      if (cleanupFailed) {
        setStatus('録音ファイルの後始末に失敗しました');
      }
      setRecordingStartedAt(null);
      setRecordingElapsedMs(0);
      setIsProcessing(false);
      stopInFlightRef.current = false;
    }
  }

  stopRecordingRef.current = stopRecording;

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
                : content === 'SHAKE'
                  ? measurementStatus === 'untrained'
                    ? '振り音モデルは未学習です。データ収集後にモデルを有効化します'
                    : fillLevel === 'N/A'
                      ? '振り音の信頼度が低いため残量を判定できませんでした'
                      : '振り音から残量の3段階を判定しました'
                  : content === 'UNKNOWN'
                    ? '信頼度が低いため判定できませんでした。条件をそろえて再試行してください'
                    : content === 'WATER'
                      ? fillLevel === 'N/A'
                        ? '水は検出されましたが、充填状態は未判定です'
                        : '水が入っています'
                      : '水が検出されませんでした'}
            </Text>
          </View>

          {hasResult ? (
            <View style={styles.metricRow}>
              {content === 'SHAKE' && fillLevel !== 'N/A' ? (
                <MetricCard
                  title="残量"
                  value={fillLevel}
                  unit="容量に対する3段階の目安"
                  color="#087ea4"
                />
              ) : content === 'WATER' && fillLevel !== 'N/A' ? (
                <MetricCard
                  title="充填率"
                  value={fillLevel}
                  unit="50% / 90%の目安"
                  color="#087ea4"
                />
              ) : null}
              {content === 'SHAKE' ? (
                <MetricCard
                  title="氷量"
                  value={iceAmount !== null ? iceDisplay : '未判定'}
                  unit={
                    iceAmountStatus === 'trained'
                      ? iceAmount !== null
                        ? `3段階の目安（${formatProbability(
                            iceAmountConfidence,
                          )}）`
                        : '信頼度不足（再試行）'
                      : '学習前は未判定'
                  }
                  color="#168276"
                />
              ) : (
                <MetricCard
                  title="氷の有無"
                  value={iceDisplay}
                  unit={
                    icePresence === 'UNKNOWN'
                      ? iceStatus === 'trained'
                        ? iceConfidence === null
                          ? '信頼度不足（再試行）'
                          : `信頼度不足（${formatProbability(iceConfidence)}）`
                        : '学習前は未判定'
                      : `音からの目安（${formatProbability(iceConfidence)}）`
                  }
                  color="#168276"
                />
              )}
            </View>
          ) : null}

          <View style={styles.analysisCard}>
            <Text style={styles.analysisDescription}>
              水筒を振った音から残量を確認します
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
              accessibilityRole="button"
              accessibilityLabel={
                isProcessing
                  ? '音声を確認中'
                  : isRecording
                    ? '録音を停止して確認'
                    : '水筒の音をチェックする'
              }
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
            {isRecording ? (
              <Text style={styles.recordingDuration}>
                ● 録音 {Math.max(0, recordingElapsedMs / 1000).toFixed(1)}秒
              </Text>
            ) : null}
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
                {content === 'SHAKE'
                  ? `振り音クラス確率 ${formatProbability(fillConfidence)} · ${
                      measurementStatus === 'trained' ? '学習済み' : '未学習'
                    }`
                  : `水判定確率 ${formatProbability(waterConfidence)}${
                      content === 'WATER'
                        ? ` · 充填クラス確率 ${formatProbability(fillConfidence)}`
                        : ''
                    }`}
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
            disabled={isRecording || isProcessing}
          />

          <Text style={styles.resultNote}>
            結果は録音動作、距離、容器、周囲の音で変わります。前回の残量との差分は参考値として確認できます。
          </Text>
          <TouchableOpacity
            disabled={isRecording || isProcessing}
            accessibilityRole="button"
            accessibilityLabel="データ収集画面を開く"
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
              accessibilityRole="button"
              accessibilityLabel="音響チェック画面へ戻る"
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
          <Text style={styles.inputLabel}>収集動作</Text>
          <View style={styles.actionSummary}>
            <Text style={styles.actionSummaryValue}>
              {COLLECTION_ACTION_LABELS[MODEL_RECORDING_ACTION]}
            </Text>
            <Text style={styles.actionSummaryHint}>
              {COLLECTION_ACTION_INSTRUCTIONS[MODEL_RECORDING_ACTION]}
            </Text>
          </View>
          <Text style={styles.savedCount}>今回保存: {savedRecordings}件</Text>
        </View>
      )}

      {mode === 'collect' ? (
        <View style={styles.controls}>
          <Text style={styles.collectionStatus}>{status}</Text>
          <TouchableOpacity
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={
              isRecording ? '録音を停止して保存' : 'ラベル付き録音を保存'
            }
            style={[styles.button, isRecording && styles.activeRec]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.buttonText}>
              {isRecording ? '停止して保存' : '録音して保存'}
            </Text>
          </TouchableOpacity>
          {!isRecording ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="CSVを書き出す"
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
  recordingDuration: {
    color: '#c44747',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
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
  actionSummary: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4e1e3',
  },
  actionSummaryValue: { color: '#17323b', fontSize: 14, fontWeight: '800' },
  actionSummaryHint: { color: '#73878c', fontSize: 12, marginTop: 3 },
  savedCount: { color: '#73878c', textAlign: 'right' },
  exportButton: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 24 },
  exportText: { color: '#087ea4', fontWeight: '700' },
});
