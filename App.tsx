import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { Asset } from 'expo-asset';

export default function App() {
  const [isTfReady, setIsTfReady] = useState(false);
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    const init = async () => {
      try {
        // 1. TensorFlowの準備
        await tf.ready();
        setIsTfReady(true);
        setStatus("TFJS Ready. Loading model...");

        // 2. モデルファイルの読み込み
        // assetsフォルダに移動したファイルを参照
        const modelAsset = Asset.fromModule(require('./assets/simple_model.tflite'));

        // アセットをダウンロードして使える状態にする
        await modelAsset.downloadAsync();

        setStatus(`Model loaded at: ${modelAsset.localUri}`);
        console.log("Model loaded successfully");

      } catch (error) {
        console.error("Error:", error);
        setStatus(`Error: ${error}`);
      }
    };

    init();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ColdKeep AI Test</Text>
      <View style={styles.statusContainer}>
        {isTfReady ? (
          <Text style={styles.success}>✔ TFJS Ready</Text>
        ) : (
          <ActivityIndicator size="large" color="#0000ff" />
        )}
        <Text style={styles.statusText}>{status}</Text>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    alignItems: 'center',
  },
  success: {
    color: 'green',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusText: {
    textAlign: 'center',
    marginTop: 10,
    color: '#333',
  },
});