import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AppDependencies } from '../../../app/types';
import {
  COLLECTION_ACTION_INSTRUCTIONS,
  COLLECTION_ACTION_LABELS,
  CollectionDraft,
  CollectionLabels,
  MODEL_RECORDING_ACTION,
  validateCollectionDraft,
} from '../domain/collection';
import { RecordingRef } from '../../shared/application/ports';
import { MAX_CAPTURE_SECONDS } from '../../../platform/audio/pcmCapture';

const initialDraft: CollectionDraft = {
  sessionId: 'session-01',
  containerId: 'bottle-01',
  // A platform name is not a device identifier and would create a severe
  // shortcut in held-out evaluation. The operator must enter a stable ID.
  deviceId: 'enter-device-id',
  roomId: 'room-01',
  operatorId: 'operator-01',
  capacityMl: '500',
  waterMl: '250',
  iceCount: '0',
  iceMassG: '0',
  temperatureC: '20',
  microphoneDistanceCm: '10',
  action: MODEL_RECORDING_ACTION,
};

type CollectionScreenProps = {
  app: Pick<AppDependencies, 'recording' | 'collect' | 'exportDataset'>;
};

function LabeledInput({
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
}) {
  return (
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
}

export function CollectionScreen({ app }: CollectionScreenProps) {
  const [draft, setDraft] = useState<CollectionDraft>(initialDraft);
  const [pendingLabels, setPendingLabels] = useState<CollectionLabels | null>(
    null,
  );
  const [savedRecordings, setSavedRecordings] = useState(0);
  const [status, setStatus] = useState('準備できました');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(
    null,
  );
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const stopInFlightRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const startInFlightRef = useRef(false);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);

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

  function updateField<Key extends keyof CollectionDraft>(
    key: Key,
    value: CollectionDraft[Key],
  ) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  async function startRecording() {
    if (isProcessing || isRecording || startInFlightRef.current) {
      return;
    }
    startInFlightRef.current = true;
    try {
      const labels = validateCollectionDraft(draft);
      await app.recording.start();
      setPendingLabels(labels);
      setIsRecording(true);
      setRecordingStartedAt(Date.now());
      setRecordingElapsedMs(0);
      setStatus('振る音を録音中…');
    } catch (error) {
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
    try {
      setStatus('音声とラベルを保存中…');
      // The microphone is being finalized now; stop the UI timer before the
      // native stop promise resolves so saving time is not shown as recording.
      setIsRecording(false);
      setRecordingStartedAt(null);
      recording = await app.recording.stop();
      if (!pendingLabels) {
        throw new Error('ラベルが保存されていません');
      }
      const record = await app.collect.execute(recording, pendingLabels);
      setSavedRecordings(count => count + 1);
      setStatus(`保存しました（${record.recordingId}）`);
      setPendingLabels(null);
    } catch (error) {
      setIsRecording(false);
      setRecordingStartedAt(null);
      setPendingLabels(null);
      setStatus(
        error instanceof Error ? error.message : '録音を保存できませんでした',
      );
    } finally {
      if (recording) {
        try {
          await app.recording.cleanup(recording);
        } catch {
          setStatus('録音ファイルの後始末に失敗しました');
        }
      }
      setRecordingStartedAt(null);
      setRecordingElapsedMs(0);
      setIsProcessing(false);
      stopInFlightRef.current = false;
    }
  }

  stopRecordingRef.current = stopRecording;

  async function exportDataset() {
    try {
      await app.exportDataset.execute();
      setStatus('音声とラベルをZIPで書き出しました');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'データを書き出せませんでした',
      );
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>COLDKEEP / INTERNAL</Text>
          <Text style={styles.title}>振り音データ収集</Text>
          <Text style={styles.subtitle}>
            個人向け画面とは分離された、学習用サンプルの記録画面です。
          </Text>
        </View>

        <View style={styles.stepRow}>
          <Step number="1" label="ラベルを入力" />
          <Step number="2" label="振って録音" />
          <Step number="3" label="保存・書き出し" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>録音条件</Text>
          <Text style={styles.cardHint}>
            毎回同じ条件で入力すると、モデル評価に使えるデータになります。
          </Text>
          <View style={styles.inputGrid}>
            <LabeledInput
              label="セッション"
              value={draft.sessionId}
              onChangeText={value => updateField('sessionId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="水筒"
              value={draft.containerId}
              onChangeText={value => updateField('containerId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="端末"
              value={draft.deviceId}
              onChangeText={value => updateField('deviceId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="部屋"
              value={draft.roomId}
              onChangeText={value => updateField('roomId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="操作者"
              value={draft.operatorId}
              onChangeText={value => updateField('operatorId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="容量 (mL)"
              value={draft.capacityMl}
              onChangeText={value => updateField('capacityMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="水量 (mL)"
              value={draft.waterMl}
              onChangeText={value => updateField('waterMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="氷の個数"
              value={draft.iceCount}
              onChangeText={value => updateField('iceCount', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="氷の重さ (g)"
              value={draft.iceMassG}
              onChangeText={value => updateField('iceMassG', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="水温 (°C)"
              value={draft.temperatureC}
              onChangeText={value => updateField('temperatureC', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="マイク距離 (cm)"
              value={draft.microphoneDistanceCm}
              onChangeText={value =>
                updateField('microphoneDistanceCm', value)
              }
              numeric
              editable={!isRecording}
            />
          </View>
          <View style={styles.fixedAction}>
            <Text style={styles.fixedActionLabel}>収集動作</Text>
            <Text style={styles.fixedActionValue}>
              {COLLECTION_ACTION_LABELS[MODEL_RECORDING_ACTION]}
            </Text>
            <Text style={styles.fixedActionHint}>
              {COLLECTION_ACTION_INSTRUCTIONS[MODEL_RECORDING_ACTION]}を1秒以上
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.recordHeader}>
            <View>
              <Text style={styles.cardTitle}>サンプル録音</Text>
              <Text style={styles.cardHint}>保存済み {savedRecordings}件</Text>
            </View>
            {isRecording ? (
              <Text style={styles.duration}>
                {Math.max(0, recordingElapsedMs / 1000).toFixed(1)}秒
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={
              isRecording ? '録音を停止して保存' : '振り音を録音して保存'
            }
            style={[styles.primaryButton, isRecording && styles.stopButton]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.primaryButtonText}>
              {isProcessing
                ? '保存中…'
                : isRecording
                  ? '停止して保存'
                  : '振り音を録音する'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
        </View>

        <TouchableOpacity
          disabled={isRecording || isProcessing}
          accessibilityRole="button"
          style={styles.exportButton}
          onPress={exportDataset}
        >
          <Text style={styles.exportButtonText}>音声とラベルをZIPで書き出す</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ number, label }: { number: string; label: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f8' },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 56,
  },
  header: { width: '100%', marginBottom: 24 },
  eyebrow: {
    color: '#087ea4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: '#17323b', fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#62747a', fontSize: 13, lineHeight: 20, marginTop: 8 },
  stepRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  step: { flex: 1, alignItems: 'center', gap: 7 },
  stepNumber: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#d9eff1',
  },
  stepNumberText: { color: '#087ea4', fontWeight: '800' },
  stepLabel: { color: '#62747a', fontSize: 11, textAlign: 'center' },
  card: {
    width: '100%',
    padding: 20,
    marginBottom: 18,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce7e9',
  },
  cardTitle: { color: '#17323b', fontSize: 18, fontWeight: '800' },
  cardHint: { color: '#73878c', fontSize: 12, lineHeight: 18, marginTop: 5 },
  inputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginTop: 18,
  },
  inputGroup: { width: '50%', paddingHorizontal: 6, marginBottom: 16 },
  inputLabel: { color: '#62747a', fontSize: 12, marginBottom: 6 },
  input: {
    color: '#17323b',
    backgroundColor: '#f8fbfb',
    borderColor: '#d4e1e3',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  disabledInput: { opacity: 0.55 },
  fixedAction: {
    marginTop: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#eef8f9',
  },
  fixedActionLabel: { color: '#62747a', fontSize: 11 },
  fixedActionValue: { color: '#087ea4', fontSize: 16, fontWeight: '800', marginTop: 4 },
  fixedActionHint: { color: '#45636a', fontSize: 12, marginTop: 4 },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  duration: { color: '#087ea4', fontSize: 16, fontWeight: '800' },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#087ea4',
  },
  stopButton: { backgroundColor: '#c94f57' },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  status: {
    color: '#62747a',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },
  exportButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a8cdd2',
    backgroundColor: '#fff',
  },
  exportButtonText: { color: '#087ea4', fontSize: 14, fontWeight: '700' },
});
