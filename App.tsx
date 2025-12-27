import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Audio } from 'expo-av'; // 音声機能を追加

const { width } = Dimensions.get('window');

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
  // AIモデル設定
  const plugin = useTensorflowModel(require('./simple_model.tflite'));

  // 状態管理
  const [status, setStatus] = useState("System Initializing...");
  const [temp, setTemp] = useState(24.5);
  const [iceLevel, setIceLevel] = useState(0);

  // 録音用ステート
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  // モデルロード監視
  useEffect(() => {
    if (plugin.state === 'loading') {
      setStatus("Loading Neural Network...");
    } else if (plugin.state === 'error') {
      setStatus("Error: Failed to load model");
    } else if (plugin.state === 'loaded') {
      setStatus("AI Brain Ready");
    }
  }, [plugin.state]);

  // --- 録音機能 (データ収集用) ---
  async function startRecording() {
    try {
      // 権限確認
      if (permissionResponse?.status !== 'granted') {
        console.log('Requesting permission..');
        await requestPermission();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('Starting recording..');

      // 学習用に高音質で録音設定
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setStatus("Recording Data...");
      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording', err);
      setStatus("Recording Failed");
    }
  }

  async function stopRecording() {
    console.log('Stopping recording..');
    if (!recording) return;

    setStatus("Saving Audio Data...");
    setRecording(null);

    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    console.log('Recording stored at', uri);
    setStatus(`Data Saved`); // 保存完了表示
  }
  // -----------------------------

  // 推論実行ロジック (既存機能)
  const handleScan = useCallback(async () => {
    if (plugin.state !== 'loaded' || !plugin.model) return;
    setStatus("Processing...");
    try {
      const inputs = plugin.model.inputs.map((input) => {
        const size = input.shape.reduce((a, b) => a * b, 1);
        const data = new Float32Array(size);
        for (let i = 0; i < size; i++) data[i] = Math.random();
        return data;
      });
      const outputTensors = await plugin.model.run(inputs);
      const resultData = outputTensors[0];

      if (resultData && resultData.length > 0) {
        const rawValue1 = resultData[0];
        const rawValue2 = resultData.length > 1 ? resultData[1] : rawValue1;
        const newTemp = Math.abs(rawValue1 * 10 + 20) % 40;
        const newIce = Math.floor(Math.abs(rawValue2 * 100) % 100);

        setTemp(parseFloat(newTemp.toFixed(1)));
        setIceLevel(newIce);
        setStatus("Inference Complete");
      }
    } catch (error) {
      console.error("Inference Error:", error);
      setStatus("Inference Failed");
    }
  }, [plugin]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ColdKeep AI</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.dashboard}>
        <CircleMeter
          title="TEMPERATURE"
          value={temp}
          unit="°C"
          color="#4facfe"
        />
        <CircleMeter
          title="ICE LEVEL"
          value={iceLevel}
          unit="%"
          color="#00f2fe"
        />
      </View>

      <View style={styles.controls}>
        {/* 既存のAIスキャンボタン */}
        {plugin.state === 'loaded' ? (
          <TouchableOpacity
            style={[styles.button, recording ? styles.buttonDisabled : {}]}
            onPress={handleScan}
            disabled={!!recording} // 録音中はスキャン不可
          >
            <Text style={styles.buttonText}>SHAKE & SCAN</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator size="large" color="#4facfe" />
        )}

        {/* 追加: データ収集用録音ボタン */}
        <TouchableOpacity
          style={[
            styles.recordButton,
            recording ? styles.recordButtonActive : {}
          ]}
          onPress={recording ? stopRecording : startRecording}
        >
          <Text style={styles.recordButtonText}>
            {recording ? "STOP RECORDING" : "COLLECT AUDIO DATA"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    paddingTop: 60,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
  },
  statusText: {
    color: '#888',
    marginTop: 5,
    fontSize: 12,
  },
  dashboard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 50,
  },
  meterContainer: {
    alignItems: 'center',
  },
  circle: {
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: (width * 0.35) / 2,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  meterValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  meterUnit: {
    fontSize: 14,
    color: '#ccc',
    position: 'absolute',
    bottom: 20,
  },
  meterTitle: {
    color: '#ccc',
    marginTop: 15,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  controls: {
    marginTop: 20,
    alignItems: 'center',
    gap: 20, // ボタン間のスペース
  },
  button: {
    backgroundColor: '#4facfe',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    shadowColor: "#4facfe",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10.32,
    elevation: 10,
    width: 280, // ボタン幅を固定して揃える
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  // 以下、録音ボタン用のスタイルを追加
  recordButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#ff4b4b', // 赤色で録音っぽさを演出
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: 280,
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: '#ff4b4b', // 録音中は赤背景に
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 14, // 少し小さめにして補助機能感を出す
    fontWeight: 'bold',
    letterSpacing: 1,
  }
});