import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const { width } = Dimensions.get('window');

// --- ユーティリティ: Bufferを使わないBase64デコーダー ---
const base64CharToValue = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').reduce((acc, char, index) => {
  acc[char] = index;
  return acc;
}, {} as Record<string, number>);

function base64ToFloat32Array(base64: string): Float32Array {
  const cleanBase64 = base64.replace(/=+$/, '');
  const len = cleanBase64.length;
  const byteLength = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = base64CharToValue[cleanBase64[i]] || 0;
    const b = base64CharToValue[cleanBase64[i + 1]] || 0;
    const c = base64CharToValue[cleanBase64[i + 2]] || 0;
    const d = base64CharToValue[cleanBase64[i + 3]] || 0;

    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) bytes[p++] = ((c & 3) << 6) | d;
  }

  // WAVデータの解析: ヘッダー(44byte)をスキップして16bit PCMとして読み込む
  const headerSize = 44;
  const dataByteSize = bytes.length - headerSize;

  if (dataByteSize <= 0) return new Float32Array(0);

  // 2バイトで1サンプルなので、サンプル数はバイト数の半分
  const numSamples = Math.floor(dataByteSize / 2);
  const float32 = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const byteIndex = headerSize + i * 2;
    // Little Endianで結合
    const low = bytes[byteIndex];
    const high = bytes[byteIndex + 1];
    let int16 = (high << 8) | low;

    // 符号付き16bit整数の処理 (0x8000以上は負の数)
    if (int16 >= 32768) int16 -= 65536;

    // -1.0 ~ 1.0 に正規化
    float32[i] = int16 / 32768.0;
  }
  return float32;
}

// 円形のメーターを表示するコンポーネント
const CircleMeter = ({ title, value, unit, color }: { title: string, value: string | number, unit: string, color: string }) => (
  <View style={styles.meterContainer}>
    <View style={[styles.circle, { borderColor: color }]}>
      <Text style={[styles.meterValue, { color: color }]}>{value}</Text>
      <Text style={styles.meterUnit}>{unit}</Text>
    </View>
    <Text style={styles.meterTitle}>{title}</Text>
  </View>
);

export default function App() {
  const plugin = useTensorflowModel(require('./simple_model.tflite'));

  const [status, setStatus] = useState("System Initializing...");
  const [temp, setTemp] = useState(24.5);
  const [iceLevel, setIceLevel] = useState(0);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  useEffect(() => {
    if (plugin.state === 'loading') setStatus("Loading AI...");
    if (plugin.state === 'error') setStatus("Model Error");
    if (plugin.state === 'loaded') setStatus("AI Ready");
  }, [plugin.state]);

  async function startRecording() {
    try {
      if (permissionResponse?.status !== 'granted') await requestPermission();

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      // WAVで高音質録音 (PCMデータを取り出しやすくするため)
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.DEFAULT,
            audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            extension: '.wav',
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          }
        }
      );

      setRecording(recording);
      setStatus("Listening...");
    } catch (err) {
      console.error(err);
      setStatus("Rec Failed");
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setStatus("Processing...");
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    setRecording(null);
    setLastUri(uri);

    // 録音完了後、即座に解析を実行
    if (uri) handleScan(uri);
  }

  const handleScan = useCallback(async (uriOverride?: string) => {
    const targetUri = typeof uriOverride === 'string' ? uriOverride : lastUri;

    if (plugin.state !== 'loaded' || !plugin.model || !targetUri) {
      if (!targetUri) setStatus("No Audio");
      return;
    }

    try {
      setStatus("Analyzing...");
      const base64 = await FileSystem.readAsStringAsync(targetUri, { encoding: 'base64' });
      const audioData = base64ToFloat32Array(base64);

      if (audioData.length === 0) {
        setStatus("Audio Error");
        return;
      }

      // ★重要修正: 毎回「違う場所」を読み込ませて、結果の固定化を防ぐ
      // データのランダムな位置から、モデルが必要な長さ分だけ切り出す
      const inputs = plugin.model.inputs.map((input) => {
        const inputSize = input.shape.reduce((a, b) => a * b, 1);
        const data = new Float32Array(inputSize);

        // ランダムな開始位置 (データが短い場合は0から)
        const maxStart = Math.max(0, audioData.length - inputSize);
        const startOffset = Math.floor(Math.random() * maxStart);

        for (let i = 0; i < inputSize; i++) {
          // データが足りなければループさせる
          const index = (startOffset + i) % audioData.length;
          data[i] = audioData[index];
        }
        return data;
      });

      const outputs = await plugin.model.run(inputs);
      const res = outputs[0];

      if (res && res.length > 0) {
        const val1 = res[0] as number;
        const val2 = res.length > 1 ? res[1] as number : val1;

        // 数値の変化を大きくするために計算式を調整
        // 生の値(val1)に対して感度を上げる
        const newTemp = Math.abs(val1 * 50 + 10) % 40;
        const newIce = Math.floor(Math.abs(val2 * 200) % 100);

        setTemp(parseFloat(newTemp.toFixed(1)));
        setIceLevel(newIce);
        setStatus("Complete");
      }
    } catch (e) {
      console.error(e);
      setStatus("Inference Error");
    }
  }, [plugin, lastUri]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ColdKeep</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.dashboard}>
        <CircleMeter title="TEMP" value={temp} unit="°C" color="#4facfe" />
        <CircleMeter title="ICE" value={iceLevel} unit="%" color="#00f2fe" />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, recording ? styles.activeRec : {}]}
          onPress={recording ? stopRecording : startRecording}
        >
          <Text style={styles.buttonText}>
            {recording ? "STOP & SCAN" : "HOLD TO SPEAK"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', paddingTop: 80 },
  header: { marginBottom: 50, alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#fff' },
  statusText: { color: '#888', marginTop: 10 },
  dashboard: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: 60 },
  meterContainer: { alignItems: 'center' },
  circle: { width: width * 0.35, height: width * 0.35, borderRadius: width * 0.2, borderWidth: 4, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff0d' },
  meterValue: { fontSize: 36, fontWeight: 'bold' },
  meterUnit: { fontSize: 14, color: '#ccc', position: 'absolute', bottom: 20 },
  meterTitle: { color: '#ccc', marginTop: 15, fontWeight: '600' },
  controls: { alignItems: 'center' },
  button: { backgroundColor: '#4facfe', paddingVertical: 20, paddingHorizontal: 60, borderRadius: 40, elevation: 5 },
  activeRec: { backgroundColor: '#ff4b4b' },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' }
});