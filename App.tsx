import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AppDependencies } from './src/app/types';
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
import { HomeOverview } from './src/features/home/ui/HomeOverview';
import { HistoryScreen } from './src/features/history/ui/HistoryScreen';
import type { AppTab } from './src/features/navigation/domain/appTab';
import { BottomTabBar } from './src/features/navigation/ui/BottomTabBar';
import { ThermalForecastCard } from './src/features/thermal/ui/ThermalForecastCard';
import { MAX_CAPTURE_SECONDS } from './src/platform/audio/pcmCapture';

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

export default function ColdKeepScreen({ app }: { app: AppDependencies }) {
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
  const [hydrationState, setHydrationState] = useState<HydrationState | null>(
    null,
  );
  const [hydrationReady, setHydrationReady] = useState(false);
  const [hydrationLoadError, setHydrationLoadError] = useState<string | null>(
    null,
  );
  const [hydrationFeedback, setHydrationFeedback] = useState<string | null>(
    null,
  );
  const [isSavingHydrationProfile, setIsSavingHydrationProfile] =
    useState(false);
  const [capacityText, setCapacityText] = useState(
    String(DEFAULT_HYDRATION_PROFILE.capacityMl),
  );
  const [autoRecordedIntakeMl, setAutoRecordedIntakeMl] = useState<
    number | null
  >(null);
  const [currentWaterTempText, setCurrentWaterTempText] = useState('');
  const [ambientTempText, setAmbientTempText] = useState('');
  const [elapsedMinutesText, setElapsedMinutesText] = useState('0');
  const [showMeasurementDetails, setShowMeasurementDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const stopInFlightRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const startInFlightRef = useRef(false);
  const hydrationLoadAttemptRef = useRef(0);

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
  const modelActionLabel = '振る';
  const formatProbability = (value: number | null) =>
    value === null ? '—' : `${Math.round(value * 100)}%`;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (
        nextState !== previousState &&
        (nextState === 'inactive' || nextState === 'background')
      ) {
        stopRecordingRef.current?.().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);
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
    stopRecordingRef.current?.().catch(() => undefined);
  }, [isProcessing, isRecording, recordingElapsedMs]);

  const loadHydrationState = useCallback(async () => {
    const attempt = hydrationLoadAttemptRef.current + 1;
    hydrationLoadAttemptRef.current = attempt;
    setHydrationReady(false);
    setHydrationLoadError(null);
    try {
      const state = await app.hydration.load();
      if (attempt !== hydrationLoadAttemptRef.current) {
        return;
      }
      setHydrationState(state);
      setCapacityText(String(state.profile.capacityMl));
      setHydrationFeedback(null);
      setHydrationLoadError(null);
      setHydrationReady(true);
    } catch (error) {
      if (attempt !== hydrationLoadAttemptRef.current) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : '水分記録を読み込めませんでした';
      setHydrationReady(false);
      setHydrationLoadError(message);
      setHydrationFeedback(null);
      setStatus(message);
    }
  }, [app]);

  useEffect(() => {
    loadHydrationState().catch(() => undefined);
    return () => {
      hydrationLoadAttemptRef.current += 1;
    };
  }, [loadHydrationState]);

  useEffect(() => {
    if (!hydrationReady || !hydrationState || !app.notifications) {
      return;
    }
    app.notifications.syncHydration(hydrationState).catch(error => {
      console.warn('通知の同期に失敗しました', error);
    });
  }, [app, hydrationReady, hydrationState]);

  const handleScan = useCallback(
    async (recording: RecordingRef) => {
      try {
        setStatus('確認中…');
        setAutoRecordedIntakeMl(null);
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
          result.fillLevel === null ||
            (!fillIsReliable &&
              !(shakeMode && result.measurementStatus === 'experimental'))
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
        if (shakeMode && result.measurementStatus === 'experimental') {
          setStatus(
            '汎用の試験推定を表示しました。実測モデルで検証するまで水分量は自動記録しません',
          );
          return;
        }
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
          // Do not record against the 500 mL default while the persisted
          // profile is still loading. A user with another bottle size would
          // otherwise get a permanently wrong residual/intake event.
          const currentHydrationState =
            hydrationState ?? (await app.hydration.load());
          if (!hydrationState) {
            setHydrationState(currentHydrationState);
            setCapacityText(String(currentHydrationState.profile.capacityMl));
            setHydrationLoadError(null);
            setHydrationReady(true);
          }
          const capacity = currentHydrationState.profile.capacityMl;
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
          let nextHydrationState = hydrationResult.state;
          let autoRecordFailed = false;
          if (hydrationResult.estimatedConsumedMl !== null) {
            try {
              nextHydrationState = await app.hydration.addEstimatedIntake(
                hydrationResult.estimatedConsumedMl,
                hydrationResult.observation.confidence,
              );
              setAutoRecordedIntakeMl(hydrationResult.estimatedConsumedMl);
            } catch (error) {
              autoRecordFailed = true;
              console.warn('音響推定の自動記録に失敗しました', error);
            }
          }
          setHydrationState(nextHydrationState);
          if (autoRecordFailed) {
            setStatus('確認は完了しましたが、飲水量を自動記録できませんでした');
            return;
          }
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
    [app, hydrationState],
  );

  async function saveHydrationProfile() {
    if (!hydrationReady) {
      const message =
        '水分設定を読み込み中です。少し待ってから保存してください';
      setHydrationFeedback(message);
      setStatus(message);
      return;
    }
    if (isSavingHydrationProfile) {
      return;
    }
    setIsSavingHydrationProfile(true);
    setHydrationFeedback('保存中…');
    try {
      const state = await app.hydration.updateProfile({
        capacityMl: Number(capacityText),
        dailyGoalMl:
          hydrationState?.profile.dailyGoalMl ??
          DEFAULT_HYDRATION_PROFILE.dailyGoalMl,
      });
      setHydrationState(state);
      setCapacityText(String(state.profile.capacityMl));
      setAutoRecordedIntakeMl(null);
      setHydrationFeedback('水分設定を保存しました');
      setStatus('水分設定を保存しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '水分設定を保存できませんでした';
      setHydrationFeedback(message);
      setStatus(message);
    } finally {
      setIsSavingHydrationProfile(false);
    }
  }
  async function startRecording() {
    if (isProcessing || isRecording || startInFlightRef.current) {
      return;
    }
    startInFlightRef.current = true;
    try {
      await app.recording.start();
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
    startInFlightRef.current = false;
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
      setStatus('確認中…');
      // Stop the UI timer as soon as recording ends from the user's point of
      // view. Native stop may take a moment while the file is finalized, but
      // that wait is processing time rather than additional recording time.
      setIsRecording(false);
      setRecordingStartedAt(null);
      recording = await app.recording.stop();
      await handleScan(recording);
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setRecordingStartedAt(null);
      setRecordingElapsedMs(0);
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appShell}>
        <ScrollView
          key={activeTab}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>COLDKEEP</Text>
            <Text style={styles.headerTitle}>
              {activeTab === 'home'
                ? 'ホーム'
                : activeTab === 'measure'
                  ? '振って測る'
                  : activeTab === 'hydration'
                    ? '今日の水分'
                    : activeTab === 'thermal'
                      ? '水温の推移'
                      : '記録の履歴'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'home'
                ? '水筒の状態と今日の飲水をまとめて確認'
                : activeTab === 'measure'
                  ? '水筒を振った音から残量と氷を判定します'
                  : activeTab === 'hydration'
                    ? '容量を設定すると飲水量を自動で記録します'
                    : activeTab === 'thermal'
                      ? '現在の水温から4時間先までの変化を見通します'
                      : '測定と飲水の記録をあとから確認できます'}
            </Text>
          </View>

          <View style={styles.scanScreen}>
            {activeTab === 'history' ? (
              <HistoryScreen
                state={hydrationState}
                onOpenMeasure={() => setActiveTab('measure')}
              />
            ) : null}

            {activeTab === 'home' ? (
              <HomeOverview
                state={hydrationState}
                waterDisplay={waterDisplay}
                iceDisplay={iceDisplay}
                hasScanResult={hasScanResult}
                onOpenMeasure={() => setActiveTab('measure')}
              />
            ) : null}

            {activeTab === 'measure' ? (
              <>
                <View style={styles.heroCard}>
                  <Text style={styles.heroLabel}>現在の残量</Text>
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
                      ? '水筒を1秒以上振って測定します'
                      : content === 'SHAKE'
                        ? measurementStatus === 'untrained'
                          ? '振り音モデルは未学習のため、まだ残量を判定できません'
                          : measurementStatus === 'experimental'
                            ? fillLevel === 'N/A'
                              ? '試験推定の信頼度が低いため、残量を表示できませんでした'
                              : '学習前の試験推定です。飲水量の自動記録には使いません'
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

                {hasScanResult ? (
                  <View style={styles.metricRow}>
                    {content === 'SHAKE' && fillLevel !== 'N/A' ? (
                      <MetricCard
                        title="残量"
                        value={fillLevel}
                        unit={
                          measurementStatus === 'experimental'
                            ? '試験推定（自動記録には未使用）'
                            : '容量に対する3段階の目安'
                        }
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
                            : iceAmountStatus === 'experimental'
                              ? iceAmount !== null
                                ? `研究プレビュー（${formatProbability(
                                    iceAmountConfidence,
                                  )}・自動記録には未使用）`
                                : '研究プレビュー信頼度不足'
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
                        ? '振る動作が終わったら停止してください'
                        : '1秒以上、一定の強さで振ってください'}
                  </Text>
                  <TouchableOpacity
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isProcessing
                        ? '音声を確認中'
                        : isRecording
                          ? '録音を停止して確認'
                          : '水筒を振って測定する'
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
                          : '振って測定する'}
                    </Text>
                  </TouchableOpacity>
                  {isRecording ? (
                    <Text style={styles.recordingDuration}>
                      ● 録音 {Math.max(0, recordingElapsedMs / 1000).toFixed(1)}
                      秒
                    </Text>
                  ) : null}
                  {status !== '準備できました' &&
                  status !== '確認が完了しました' ? (
                    <Text
                      style={styles.analysisStatus}
                      accessibilityLiveRegion="polite"
                    >
                      {status}
                    </Text>
                  ) : null}
                </View>

                {hasScanResult ? (
                  <>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.detailsToggle}
                      onPress={() => setShowMeasurementDetails(value => !value)}
                    >
                      <Text style={styles.detailsToggleText}>
                        測定の詳細 {showMeasurementDetails ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>
                    {showMeasurementDetails ? (
                      <View style={styles.inferenceCard}>
                        <Text style={styles.inferenceTitle}>測定の詳細</Text>
                        <Text style={styles.inferenceText}>
                          {modelActionLabel}音モデル ·{' '}
                          {inferenceEngine === 'rust' ? 'Rust' : 'TypeScript'}
                          経路
                        </Text>
                        <Text style={styles.inferenceText}>
                          {content === 'SHAKE'
                            ? `振り音クラス確率 ${formatProbability(fillConfidence)} · ${
                                measurementStatus === 'trained'
                                  ? '学習済み'
                                  : measurementStatus === 'experimental'
                                    ? '試験推定'
                                    : '未学習'
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
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === 'hydration' ? (
              <HydrationPanel
                state={hydrationState}
                capacityText={capacityText}
                autoRecordedIntakeMl={autoRecordedIntakeMl}
                onChangeCapacity={setCapacityText}
                onSaveProfile={saveHydrationProfile}
                modelActionLabel="振る"
                loading={!hydrationReady && !hydrationLoadError}
                feedback={hydrationFeedback}
                loadError={hydrationLoadError}
                onRetryLoad={loadHydrationState}
                disabled={
                  isRecording ||
                  isProcessing ||
                  !hydrationReady ||
                  isSavingHydrationProfile
                }
              />
            ) : null}

            {activeTab === 'thermal' ? (
              <ThermalForecastCard
                capacityMl={
                  hydrationState?.profile.capacityMl ??
                  DEFAULT_HYDRATION_PROFILE.capacityMl
                }
                iceAmount={iceAmount}
                currentWaterTempText={currentWaterTempText}
                ambientTempText={ambientTempText}
                elapsedMinutesText={elapsedMinutesText}
                onChangeCurrentWaterTemp={setCurrentWaterTempText}
                onChangeAmbientTemp={setAmbientTempText}
                onChangeElapsedMinutes={setElapsedMinutesText}
              />
            ) : null}

            {activeTab === 'measure' ? (
              <Text style={styles.resultNote}>
                結果は録音動作、距離、容器、周囲の音で変わります。残量は参考値として確認してください。
              </Text>
            ) : null}
          </View>
        </ScrollView>
        <BottomTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          disabled={isRecording || isProcessing}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f8' },
  appShell: { flex: 1 },
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f7f8',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 56,
  },
  header: { width: '100%', marginBottom: 28, alignItems: 'center' },
  eyebrow: {
    color: '#087ea4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#17323b',
    marginTop: 8,
  },
  headerSubtitle: {
    color: '#62747a',
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  scanScreen: { width: '100%', alignItems: 'center' },
  heroCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#e8f4f6',
    borderWidth: 1,
    borderColor: '#c4e2e6',
  },
  heroLabel: { color: '#5a737a', fontSize: 14, fontWeight: '600' },
  heroValue: {
    color: '#087ea4',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 12,
  },
  heroValueCompact: { fontSize: 28 },
  heroDescription: {
    color: '#45636a',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  metricRow: { flexDirection: 'row', width: '100%', gap: 12, marginTop: 18 },
  metricCard: {
    flex: 1,
    minHeight: 120,
    padding: 16,
    borderRadius: 14,
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
    marginTop: 12,
  },
  metricValueCompact: { fontSize: 17 },
  metricUnit: { color: '#73878c', fontSize: 11, lineHeight: 16, marginTop: 6 },
  analysisCard: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  analysisDescription: { color: '#36515a', fontSize: 16, fontWeight: '700' },
  analysisHint: {
    color: '#73878c',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  analysisButton: {
    width: '100%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderRadius: 13,
    backgroundColor: '#087ea4',
  },
  analysisButtonActive: { backgroundColor: '#c94f57' },
  analysisButtonDisabled: { backgroundColor: '#9aa9ad' },
  analysisButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  recordingDuration: {
    color: '#c44747',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  analysisStatus: {
    color: '#b04b50',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  detailsToggle: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 4 },
  detailsToggleText: { color: '#087ea4', fontSize: 13, fontWeight: '700' },
  inferenceCard: {
    width: '100%',
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  inferenceTitle: { color: '#36515a', fontSize: 13, fontWeight: '800' },
  inferenceText: {
    color: '#587177',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  inferenceHint: {
    color: '#8b9ba0',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  resultNote: {
    color: '#73878c',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
});
