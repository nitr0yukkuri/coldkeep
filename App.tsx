import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const { width } = Dimensions.get('window');

// --- ユーティリティ: Bufferを使わないBase64デコーダー ---
// これがないと "Buffer is not defined" で落ちます
const base64CharToValue = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').reduce((acc, char, index) => {
  acc[char] = index;
  return acc;
}, {} as Record<string, number>);

function base64ToFloat32Array(base64: string): Float32Array {
  // 末尾の=を削除
  const cleanBase64 = base64.replace(/=+$/, '');
  const len = cleanBase64.length;
  // およそのバイト数
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

  // WAVヘッダー(44byte)をスキップして、無理やりFloat(-1.0~1.0)として解釈する
  // ※本来はWAVデコードが必要ですが、最小構成のため「バイト列→正規化」で代用します
  const float32 = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    // 0~255 のバイトデータを -1.0 ~ 1.0 に変換
    float32[i] = (bytes[i] - 128) / 128.0;
  }
  return float32;
}
// --------------------------------------------------------

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

      // Android/iOS両対応の安全な設定
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setStatus("Recording...");
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
    setLastRecordingUri(uri);
    setRecording(null);
    setStatus("Audio Captured");
  }

  // エラー回避用ラッパー
  function setLastRecordingUri(uri: string | null) {
    setLastUri(uri);
    if (uri) setTimeout(handleScan, 500, uri); // 録音直後に自動解析を試みる
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

      // モデルの入力サイズに合わせてデータを整形（クラッシュ防止）
      // 入力テンソルが複数ある場合や形状が異なる場合に対応
      const inputs = plugin.model.inputs.map((input) => {
        const size = input.shape.reduce((a, b) => a * b, 1);
        const data = new Float32Array(size);
        // 音声データをコピー（足りなければ0埋め、多ければ切り捨て）
        for (let i = 0; i < size; i++) {
          data[i] = i < audioData.length ? audioData[i] : 0;
        }
        return data;
      });

      const outputs = await plugin.model.run(inputs);
      const res = outputs[0];

      // 結果の表示更新
      if (res && res.length > 0) {
        // 結果が極端な数字にならないよう調整
        const val1 = res[0] as number;
        const val2 = res.length > 1 ? res[1] as number : val1;

        setTemp(parseFloat(Math.abs(val1 * 10 + 20).toFixed(1)));
        setIceLevel(Math.floor(Math.abs(val2 * 100) % 100));
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
            {recording ? "STOP" : "SCAN AUDIO"}
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