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
  icon,
  color,
}: {
  title: string;
  value: string | number;
  unit: string;
  icon: string;
  color: string;
}) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}22` }]}>
      <Text style={styles.metricIconText}>{icon}</Text>
    </View>
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

const ScanInfoCard = ({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: 'blue' | 'green' | 'neutral';
}) => (
  <View
    style={[
      styles.scanInfoCard,
      tone === 'blue'
        ? styles.scanInfoCardBlue
        : tone === 'green'
          ? styles.scanInfoCardGreen
          : styles.scanInfoCardNeutral,
    ]}
  >
    <View style={styles.scanInfoText}>
      <Text style={styles.scanInfoTitle}>{title}</Text>
      <Text style={styles.scanInfoDescription}>{description}</Text>
    </View>
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
  const [status, setStatus] = useState('Public Model Ready');
  const [content, setContent] = useState('UNKNOWN');
  const [fillLevel, setFillLevel] = useState('—');
  const [confidence, setConfidence] = useState('—');
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

  useEffect(() => {
    if (mode === 'collect') {
      setStatus('Collection Ready');
    } else {
      setStatus('Public Model Ready');
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
        setStatus('Analyzing...');
        const result = await app.scan.execute({ uri });
        setContent(result.containsWater ? 'WATER' : 'NON-WATER');
        setFillLevel(result.fillLevel === null ? 'N/A' : `${result.fillLevel}%`);
        setConfidence(`${Math.round(result.waterConfidence * 100)}% confidence`);
        setIcePresence(
          result.icePresence === null
            ? 'UNKNOWN'
            : result.icePresence
              ? 'PRESENT'
              : 'ABSENT',
        );
        setStatus(
          `${result.engine === 'rust' ? 'Rust' : 'TypeScript'} estimate complete` +
            (result.iceStatus === 'untrained' ? ' (ice model needs labels)' : ''),
        );
      } catch (error) {
        console.error(error);
        setContent('UNKNOWN');
        setFillLevel('—');
        setConfidence('—');
        setIcePresence('UNKNOWN');
        setStatus(error instanceof Error ? error.message : 'Inference Error');
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
      setStatus(
        mode === 'collect' ? 'Recording labeled sample...' : 'Listening...',
      );
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      setStatus(error instanceof Error ? error.message : 'Recording Failed');
    }
  }

  async function saveCollectionRecording(
    recording: RecordingRef,
    labels: CollectionLabels,
  ) {
    setStatus('Validating WAV...');
    const record = await app.collect.execute(recording, labels);
    setSavedRecordings(count => count + 1);
    setStatus(`Saved ${record.recordingId}`);
  }

  async function shareManifest() {
    try {
      await app.exportDataset.execute();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export Failed');
    }
  }

  async function stopRecording() {
    if (!isRecording || isProcessing) {
      return;
    }
    setIsProcessing(true);
    let recording: RecordingRef | null = null;
    try {
      setStatus('Processing...');
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
      setStatus(error instanceof Error ? error.message : 'Recording Failed');
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
        {mode === 'scan' ? (
          <Text style={styles.headerSubtitle}>AI水筒アシスタント</Text>
        ) : null}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.modeTabs}>
        {(['scan', 'collect'] as const).map(item => (
          <TouchableOpacity
            key={item}
            disabled={isRecording || isProcessing}
            style={[styles.modeTab, mode === item && styles.activeModeTab]}
            onPress={() => setMode(item)}
          >
            <Text style={styles.modeTabText}>
              {item === 'scan' ? 'SCAN' : 'COLLECT DATA'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'scan' ? (
        <View style={styles.scanScreen}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>現在の水の状態</Text>
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
                ? '音声解析を始めてください'
                : content === 'WATER'
                  ? '水が入っている可能性があります'
                  : '水が検出されませんでした'}
            </Text>
            <Text style={styles.heroConfidence}>
              {content === 'UNKNOWN' ? '未解析' : confidence}
            </Text>
          </View>

          <View style={styles.metricRow}>
            <MetricCard
              title="充填率"
              value={fillLevel}
              unit="50 / 90%"
              icon="◒"
              color="#0b8fbd"
            />
            <MetricCard
              title="氷の有無"
              value={iceDisplay}
              unit="PRESENT / ABSENT"
              icon="❄"
              color="#159b8b"
            />
          </View>

          <View style={styles.analysisCard}>
            <Text style={styles.analysisDescription}>
              水筒を軽く叩いた音をAIで解析
            </Text>
            <Text style={styles.analysisHint}>
              {isProcessing
                ? '解析中です。結果が表示されるまでお待ちください'
                : isRecording
                ? '録音中です。終わったら停止してください'
                : '1秒以上録音すると水の有無と充填率を判定します'}
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
                  ? '解析中...'
                  : isRecording
                    ? '録音を停止して解析'
                    : '音を解析する'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scanSection}>
            <Text style={styles.scanSectionTitle}>次にできること</Text>
            {content === 'UNKNOWN' ? (
              <ScanInfoCard
                title="まず音を解析してください"
                description="水の有無と、学習済みクラス（50% / 90%）の充填率を音声から確認できます"
                tone="blue"
              />
            ) : (
              <ScanInfoCard
                title="解析結果を確認してください"
                description="容器やマイクの条件によって結果が変わる場合があります"
                tone="blue"
              />
            )}
            <ScanInfoCard
              title="氷の判定"
              description={
                icePresence === 'UNKNOWN'
                  ? '氷モデルはラベルデータを収集中です'
                  : `氷は${iceDisplay}`
              }
              tone={icePresence === 'UNKNOWN' ? 'neutral' : 'green'}
            />
          </View>

          <View style={styles.modelCard}>
            <Text style={styles.modelCardTitle}>推論情報</Text>
            <Text style={styles.modelCardText}>{status}</Text>
            <Text style={styles.modelCardText}>
              氷判定は二値のみ。温度・氷量の推定は行いません。
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.collectionPanel}>
          <Text style={styles.sectionTitle}>GROUND-TRUTH LABELS</Text>
          <View style={styles.inputGrid}>
            <LabeledInput
              label="Session ID"
              value={collectionDraft.sessionId}
              onChangeText={value => updateCollectionField('sessionId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="Container ID"
              value={collectionDraft.containerId}
              onChangeText={value => updateCollectionField('containerId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="Device ID"
              value={collectionDraft.deviceId}
              onChangeText={value => updateCollectionField('deviceId', value)}
              editable={!isRecording}
            />
            <LabeledInput
              label="Capacity (mL)"
              value={collectionDraft.capacityMl}
              onChangeText={value => updateCollectionField('capacityMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="Water (mL)"
              value={collectionDraft.waterMl}
              onChangeText={value => updateCollectionField('waterMl', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="Ice count"
              value={collectionDraft.iceCount}
              onChangeText={value => updateCollectionField('iceCount', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="Ice mass (g)"
              value={collectionDraft.iceMassG}
              onChangeText={value => updateCollectionField('iceMassG', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="Measured temp (°C)"
              value={collectionDraft.temperatureC}
              onChangeText={value => updateCollectionField('temperatureC', value)}
              numeric
              editable={!isRecording}
            />
            <LabeledInput
              label="Mic distance (cm)"
              value={collectionDraft.microphoneDistanceCm}
              onChangeText={value =>
                updateCollectionField('microphoneDistanceCm', value)
              }
              numeric
              editable={!isRecording}
            />
          </View>
          <Text style={styles.inputLabel}>Action</Text>
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
                <Text style={styles.actionText}>{action.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.savedCount}>Saved this run: {savedRecordings}</Text>
        </View>
      )}

      {mode === 'collect' ? (
        <View style={styles.controls}>
          <TouchableOpacity
            disabled={isProcessing}
            style={[styles.button, isRecording && styles.activeRec]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.buttonText}>
              {isRecording ? 'STOP & SAVE' : 'START RECORDING'}
            </Text>
          </TouchableOpacity>
          {!isRecording ? (
            <TouchableOpacity style={styles.exportButton} onPress={shareManifest}>
              <Text style={styles.exportText}>EXPORT LABEL CSV</Text>
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
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 50,
  },
  header: { marginBottom: 16, alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#fff' },
  headerSubtitle: { color: '#b8c0d4', marginTop: 4, fontSize: 14 },
  statusText: { color: '#8993aa', marginTop: 8, paddingHorizontal: 20, textAlign: 'center' },
  scanScreen: { width: '92%', alignItems: 'center' },
  heroCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#e1f1f5',
    borderWidth: 1,
    borderColor: '#a9dbe7',
  },
  heroLabel: { color: '#4c6872', fontSize: 14, fontWeight: '600' },
  heroValue: { color: '#0788b8', fontSize: 44, fontWeight: '800', marginTop: 12 },
  heroValueCompact: { fontSize: 28 },
  heroDescription: { color: '#36535e', fontSize: 15, marginTop: 4, textAlign: 'center' },
  heroConfidence: { color: '#148c78', fontSize: 14, fontWeight: '700', marginTop: 14 },
  metricRow: { flexDirection: 'row', width: '100%', gap: 12, marginTop: 14 },
  metricCard: {
    flex: 1,
    minHeight: 150,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e6eb',
    elevation: 2,
    shadowColor: '#0b2330',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricIconText: { fontSize: 20 },
  metricTitle: { color: '#1e2931', fontSize: 14, fontWeight: '600', marginTop: 12 },
  metricValue: { color: '#0788b8', fontSize: 28, fontWeight: '800', marginTop: 12 },
  metricValueCompact: { fontSize: 17 },
  metricUnit: { color: '#71808a', fontSize: 11, marginTop: 6 },
  analysisCard: {
    width: '100%',
    alignItems: 'center',
    padding: 18,
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e6eb',
  },
  analysisDescription: { color: '#40515a', fontSize: 15, fontWeight: '600' },
  analysisHint: { color: '#81909a', fontSize: 12, marginTop: 5, textAlign: 'center' },
  analysisButton: {
    width: '100%',
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#078fbd',
  },
  analysisButtonActive: { backgroundColor: '#d94b59' },
  analysisButtonDisabled: { backgroundColor: '#7d8b94' },
  analysisButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  scanSection: { width: '100%', marginTop: 28 },
  scanSectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  scanInfoCard: {
    flexDirection: 'row',
    minHeight: 86,
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e6eb',
  },
  scanInfoCardBlue: { borderLeftWidth: 4, borderLeftColor: '#078fbd' },
  scanInfoCardGreen: { borderLeftWidth: 4, borderLeftColor: '#159b8b' },
  scanInfoCardNeutral: { borderLeftWidth: 4, borderLeftColor: '#9aa7af' },
  scanInfoText: { flex: 1 },
  scanInfoTitle: { color: '#1e2931', fontSize: 16, fontWeight: '700' },
  scanInfoDescription: { color: '#71808a', fontSize: 13, lineHeight: 19, marginTop: 5 },
  modelCard: { width: '100%', padding: 16, marginTop: 6, borderRadius: 16, backgroundColor: '#253445' },
  modelCardTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  modelCardText: { color: '#c3d0da', fontSize: 12, lineHeight: 18, marginTop: 6 },
  controls: { alignItems: 'center' },
  button: {
    backgroundColor: '#4facfe',
    paddingVertical: 20,
    paddingHorizontal: 60,
    borderRadius: 40,
    elevation: 5,
  },
  activeRec: { backgroundColor: '#ff4b4b' },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modeTabs: {
    flexDirection: 'row',
    width: '90%',
    backgroundColor: '#101024',
    borderRadius: 12,
    padding: 4,
  },
  modeTab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 },
  activeModeTab: { backgroundColor: '#334a70' },
  modeTabText: { color: '#fff', fontWeight: '700' },
  collectionPanel: { width: '90%', marginVertical: 22 },
  sectionTitle: { color: '#fff', fontWeight: '800', marginBottom: 14 },
  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  inputGroup: { width: '50%', paddingHorizontal: 5, marginBottom: 12 },
  inputLabel: { color: '#b8c0d4', fontSize: 12, marginBottom: 5 },
  input: {
    color: '#fff',
    backgroundColor: '#101024',
    borderColor: '#3d4661',
    borderWidth: 1,
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: '#101024',
  },
  activeAction: { backgroundColor: '#216d8a' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  savedCount: { color: '#8f9bb3', textAlign: 'right' },
  exportButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24 },
  exportText: { color: '#7cc9ff', fontWeight: '700' },
});
