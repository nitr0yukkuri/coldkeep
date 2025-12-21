import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Button, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { Audio } from 'expo-av';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useTensorflowModel } from 'react-native-fast-tflite';
// @ts-ignore
import modelFile from './simple_model.tflite';

// ▼ 追加: React Native環境用のBase64デコード機能
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atobPolyfill(input: string) {
  let str = input.replace(/=+$/, '');
  let output = '';
  if (str.length % 4 == 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  for (let bc = 0, bs = 0, buffer, i = 0;
    buffer = str.charAt(i++);
    ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
      bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

// Base64文字列をFloat32Array(数値の配列)に変換する関数
function base64ToFloat32Array(base64: string): Float32Array {
  // 環境に合わせて標準のatobか、自作のpolyfillを使う
  const binaryString = (typeof atob !== 'undefined') ? atob(base64) : atobPolyfill(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 16bit PCM音声データを想定して正規化 (-1.0 ～ 1.0)
  const float32 = new Float32Array(len / 2);
  const dataView = new DataView(bytes.buffer);

  for (let i = 0; i < float32.length; i++) {
    // リトルエンディアンで読み込み
    const int16 = dataView.getInt16(i * 2, true);
    float32[i] = int16 / 32768.0;
  }
  return float32;
}

export default function App() {
  const model = useTensorflowModel(modelFile);
  const [modelStatus, setModelStatus] = useState('モデル読み込み中...');

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [status, setStatus] = useState('待機中');
  const [inferenceResult, setInferenceResult] = useState<string | null>(null);

  useEffect(() => {
    if (model.state === 'loaded') {
      console.log('TFLite Model Loaded Successfully');
      setModelStatus('✅ AIモデル準備完了');
    } else if (model.state === 'error') {
      console.error('TFLite Model Failed to Load:', model.error);
      setModelStatus('❌ AIモデルエラー');
    }
  }, [model.state, model.error]);

  async function startRecording() {
    try {
      setInferenceResult(null);
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('エラー', 'マイクの許可が必要です！');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('録音開始...');
      setStatus('🔴 録音中 (振ってください)...');

      // AI解析用に高音質(PCM)で録音設定
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
    } catch (err) {
      console.error('録音失敗:', err);
      setStatus('エラー発生');
    }
  }

  async function stopRecording() {
    if (!recording) return;

    console.log('録音停止...');
    setStatus('🧠 AI解析中...');

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setLastUri(uri);

      if (!uri) {
        setStatus('保存エラー');
        return;
      }

      // 1. ファイルを読み込む (Base64形式)
      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 2. 音声データを数値データ(Tensor)に変換
      const inputTensor = base64ToFloat32Array(fileContent);
      console.log(`Input Data Size: ${inputTensor.length}`);

      // 3. AIモデルで推論実行
      if (model.model) {
        // ※注意: モデルの入力サイズに合わせてデータを調整する必要があります
        // ここではテスト用に最初のデータの一部を使用します
        const runData = inputTensor.slice(0, 1000);

        // ★ 推論実行 ★
        // 配列の形はモデルによります（[1, N]など）
        const output = await model.model.run([runData]);

        console.log("Inference Output:", output);

        // 4. 結果の解釈 (仮ロジック)
        if (output && output.length > 0) {
          const score = output[0]; // 仮の出力値
          const val = typeof score === 'number' ? score : 0;

          setInferenceResult(`出力値: ${val.toString()}\n解析完了`);
          setStatus('✅ 解析完了');
        } else {
          setInferenceResult("データなし");
          setStatus('✅ 完了 (出力なし)');
        }
      } else {
        setStatus('⚠️ モデル未ロード');
      }

    } catch (err) {
      console.error('推論エラー:', err);
      setStatus('解析失敗');
      setInferenceResult(`エラー: ${err}`);
    }
  }

  async function shareAudio() {
    if (lastUri && await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(lastUri);
    } else {
      Alert.alert('エラー', 'シェア機能が利用できません');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ColdKeep Recorder</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.modelStatusBox}>
        <Text style={styles.modelStatusText}>{modelStatus}</Text>
      </View>

      {model.state === 'loading' && <ActivityIndicator size="small" color="#0000ff" />}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, recording ? styles.stopBtn : styles.startBtn]}
          onPress={recording ? stopRecording : startRecording}
        >
          <Text style={styles.btnText}>
            {recording ? 'ストップ & 解析' : '録音スタート'}
          </Text>
        </TouchableOpacity>
      </View>

      {inferenceResult && (
        <View style={styles.inferenceBox}>
          <Text style={styles.inferenceTitle}>AI解析結果</Text>
          <Text style={styles.inferenceResult}>{inferenceResult}</Text>
        </View>
      )}

      {lastUri && (
        <View style={styles.resultBox}>
          <Text style={styles.pathText}>録音ファイル保存済み</Text>
          <Button title="PCに送る (Share)" onPress={shareAudio} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 40,
  },
  statusBox: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 20,
    color: '#1565c0',
    fontWeight: '600',
  },
  modelStatusBox: {
    marginBottom: 30,
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  modelStatusText: {
    fontSize: 12,
    color: '#666',
  },
  controls: {
    marginBottom: 30,
  },
  button: {
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 50,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  startBtn: { backgroundColor: '#2196F3' },
  stopBtn: { backgroundColor: '#FF5252' },
  btnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inferenceBox: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#e8f5e9',
    borderRadius: 15,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  inferenceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  inferenceResult: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b5e20',
    textAlign: 'center',
  },
  resultBox: {
    marginTop: 30,
    alignItems: 'center',
    gap: 10,
    marginBottom: 40,
  },
  pathText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 5,
  },
});