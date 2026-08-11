import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { createAppDependencies } from './src/app/compositionRoot';
import {
  COLLECTION_ACTIONS,
  CollectionDraft,
  CollectionLabels,
  validateCollectionDraft,
} from './src/features/collection/domain/collection';
import { RecordingRef } from './src/features/shared/application/ports';

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
  action: 'shake',
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
        typeof value === 'string' && value.length > 6 && styles.metricValueCompact,
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

export default function App() {
  const app = useMemo(() => createAppDependencies(), []);
  const [mode, setMode] = useState<'scan' | 'collect'>('scan');
  const [status, setStatus] = useState('準備できました');
  const [content, setContent] = useState('UNKNOWN');
  const [fillLevel, setFillLevel] = useState('—');
  const [icePresence, setIcePresence] = useState('UNKNOWN');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState(initialCollectionDraft);
  const [pendingLabels, setPendingLabels] = useState<CollectionLabels | null>(null);
  const [savedRecordings, setSavedRecordings] = useState(0);
  const waterDisplay =
    content === 'WATER' ? '水あり' : content === 'NON-WATER' ? '水なし' : '未判定';
  const iceDisplay =
    icePresence === 'PRESENT' ? 'あり' : icePresence === 'ABSENT' ? 'なし' : '未判定';
  const hasResult = content !== 'UNKNOWN';
  const hasIceResult = icePresence !== 'UNKNOWN';

  useEffect(() => {
    if (mode === 'collect') {
      setStatus('データ収集の準備ができました');
    } else {
      setStatus('準備できました');
    }
  }, [mode]);

  const updateCollectionField = useCallback(
    <Key extends keyof CollectionDraft>(key: Key, value: CollectionDraft[Key]) => {
      setCollectionDraft(current => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleScan = useCallback(
    async (uri: string) => {
      try {
        setStatus('確認中…');
        const result = await app.scan.execute({ uri });
        setContent(result.containsWater ? 'WATER' : 'NON-WATER');
        setFillLevel(result.fillLevel === null ? 'N/A' : `${result.fillLevel}%`);
        setIcePresence(
          result.icePresence === null
            ? 'UNKNOWN'
            : result.icePresence
              ? 'PRESENT'
              : 'ABSENT',
        );
        setStatus('確認が完了しました');
      } catch (error) {
        console.error(error);
        setContent('UNKNOWN');
        setFillLevel('—');
        setIcePresence('UNKNOWN');
        setStatus(error instanceof Error ? error.message : '確認に失敗しました');
      }
    },
    [app],
  );

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
      setStatus(error instanceof Error ? error.message : '録音を開始できませんでした');
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
      setStatus(error instanceof Error ? error.message : 'CSVを書き出せませんでした');
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
        await handleScan(recording.uri);
      }
      setPendingLabels(null);
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setPendingLabels(null);
      setStatus(error instanceof Error ? error.message : '録音を処理できませんでした');
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
          {mode === 'scan' ? '水筒チェック' : 'データ収集'}
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
              {content === 'UNKNOWN'
                ? '水筒を軽く振ってチェックします'
                : content === 'WATER'
                  ? '水が入っています'
                  : '水が検出されませんでした'}
            </Text>
          </View>

          {hasResult && (content === 'WATER' || hasIceResult) ? (
            <View style={styles.metricRow}>
              {content === 'WATER' ? (
                <MetricCard
                  title="充填率"
                  value={fillLevel}
                  unit="50% / 90%の目安"
                  color="#087ea4"
                />
              ) : null}
              {hasIceResult ? (
                <MetricCard
                  title="氷の有無"
                  value={iceDisplay}
                  unit="音からの目安"
                  color="#168276"
                />
              ) : null}
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
                ? '振り終わったら停止してください'
                : '水筒を軽く振って1秒以上録音してください'}
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

          <Text style={styles.resultNote}>
            結果は録音する距離や振り方によって変わることがあります
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
              onChangeText={value => updateCollectionField('containerId', value)}
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
              onChangeText={value => updateCollectionField('temperatureC', value)}
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
                  {action === 'pour' ? '傾ける' : action === 'shake' ? '振る' : '静置'}
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
            <TouchableOpacity style={styles.exportButton} onPress={shareManifest}>
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
  heroValue: { color: '#087ea4', fontSize: 42, fontWeight: '800', marginTop: 10 },
  heroValueCompact: { fontSize: 28 },
  heroDescription: { color: '#45636a', fontSize: 15, marginTop: 4, textAlign: 'center' },
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
  metricValue: { color: '#087ea4', fontSize: 25, fontWeight: '800', marginTop: 10 },
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
  analysisHint: { color: '#73878c', fontSize: 13, marginTop: 5, textAlign: 'center' },
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
  analysisStatus: { color: '#b04b50', fontSize: 12, marginTop: 9, textAlign: 'center' },
  resultNote: { color: '#73878c', fontSize: 12, marginTop: 14, textAlign: 'center' },
  developerLink: { marginTop: 20, paddingVertical: 8, paddingHorizontal: 10 },
  developerLinkText: { color: '#6d8489', fontSize: 12 },
  collectionStatus: { color: '#62747a', fontSize: 13, marginBottom: 10, textAlign: 'center' },
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
