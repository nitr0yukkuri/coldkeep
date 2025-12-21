import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Button, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as Sharing from 'expo-sharing';
import { useTensorflowModel } from 'react-native-fast-tflite';
// @ts-ignore
import modelFile from './simple_model.tflite';

export default function App() {
  // TFLiteモデルのロード
  const model = useTensorflowModel(modelFile);
  const [modelStatus, setModelStatus] = useState('モデル読み込み中...');

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);
  const [status, setStatus] = useState('待機中');

  // モデルの状態監視
  useEffect(() => {
    if (model.state === 'loaded') {
      console.log('TFLite Model Loaded Successfully');
      setModelStatus('✅ AIモデル準備完了');
    } else if (model.state === 'error') {
      console.error('TFLite Model Failed to Load');
      setModelStatus('❌ AIモデルエラー');
    }
  }, [model.state]);

  async function startRecording() {
    try {
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
      setStatus('🔴 録音中...');

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
    setStatus('処理中...');

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      setRecording(null);
      setLastUri(uri);
      setStatus('✅ 完了');

      console.log('保存先:', uri);

      if (model.model) {
        console.log("モデルを使用して推論可能です");
      }

    } catch (err) {
      console.error('停止エラー:', err);
      setStatus('停止エラー');
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
    <View style={styles.container}>
      <Text style={styles.title}>ColdKeep Recorder</Text>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.modelStatusBox}>
        <Text style={styles.modelStatusText}>{modelStatus}</Text>
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
    marginBottom: 20,
  },
  statusBox: {
    marginBottom: 20,
  },
  statusText: {
    fontSize: 24,
    color: '#333',
  },
  modelStatusBox: {
    marginBottom: 30,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  modelStatusText: {
    fontSize: 14,
    color: '#555',
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