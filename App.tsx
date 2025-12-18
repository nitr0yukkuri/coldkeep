import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Button, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as Sharing from 'expo-sharing';

// ★重要: Expo GoではTFLiteが動かないためコメントアウトのままにする
// import { useTensorflowModel } from 'react-native-fast-tflite';

export default function App() {
  // 型定義: Audio.Recording | null
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [status, setStatus] = useState('待機中');

  // 録音スタート
  async function startRecording() {
    try {
      // マイクの使用許可をリクエスト
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('エラー', 'マイクの許可が必要です！');
        return;
      }

      // iOS向けの設定（サイレントモードでも録音・再生可能にする）
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('録音開始...');
      setStatus('🔴 録音中...');

      // 録音を開始
      // ★修正: 変数名の衝突を防ぐため、'newRecording' という名前で受け取る
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      // ステートを更新
      setRecording(newRecording);
    } catch (err) {
      console.error('録音失敗:', err);
      setStatus('エラー発生');
    }
  }

  // 録音ストップ
  async function stopRecording() {
    if (!recording) return;

    console.log('録音停止...');
    setStatus('処理中...');

    try {
      // 録音を停止してメモリから解放
      await recording.stopAndUnloadAsync();

      // 保存先のURIを取得
      const uri = recording.getURI();

      // ステートをリセット
      setRecording(null);
      setLastUri(uri);
      setStatus('✅ 完了');

      console.log('保存先:', uri);
    } catch (err) {
      console.error('停止エラー:', err);
      setStatus('停止エラー');
    }
  }

  // 録音したファイルをシェア（PCに送る用）
  async function shareAudio() {
    if (lastUri && await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(lastUri);
    } else {
      Alert.alert('エラー', 'シェア機能が利用できません');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ColdKeep Recorder</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, recording ? styles.stopBtn : styles.startBtn]}
        onPress={recording ? stopRecording : startRecording}
      >
        <Text style={styles.btnText}>
          {recording ? 'ストップ' : '録音スタート'}
        </Text>
      </TouchableOpacity>

      {lastUri && (
        <View style={styles.resultBox}>
          <Text style={styles.pathText}>録音完了！</Text>
          <Button title="PCに送る (Share)" onPress={shareAudio} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40,
  },
  statusBox: {
    marginBottom: 30,
  },
  statusText: {
    fontSize: 24,
    color: '#333',
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
    fontSize: 20,
    fontWeight: 'bold',
  },
  resultBox: {
    marginTop: 30,
    alignItems: 'center',
    gap: 10,
  },
  pathText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
});