import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import { Asset } from 'expo-asset';

const { width } = Dimensions.get('window');

// 円形のメーターを表示するコンポーネント（見た目だけ）
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
  const [isTfReady, setIsTfReady] = useState(false);
  const [model, setModel] = useState<any>(null);
  const [status, setStatus] = useState("System Initializing...");

  // ダミーの表示データ
  const [temp, setTemp] = useState(24.5);
  const [iceLevel, setIceLevel] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        setStatus("Loading TensorFlow...");
        await tf.ready();
        setIsTfReady(true);

        setStatus("Loading Model...");
        const modelAsset = Asset.fromModule(require('./simple_model.tflite'));
        await modelAsset.downloadAsync();

        // ここでモデルをロード（まだ使いませんが準備だけ）
        // const loadedModel = await tf.loadLayersModel... (TFLiteの場合は読み込み方が異なりますが一旦スキップ)

        setStatus("Ready to Sense");
        console.log("System Ready");

      } catch (error) {
        console.error("Error:", error);
        setStatus(`Error: ${error}`);
      }
    };

    init();
  }, []);

  // ボタンを押したときのダミー動作
  const handleScan = () => {
    setStatus("Scanning...");
    // 1秒後にランダムな数値を表示する（AIフリ）
    setTimeout(() => {
      setTemp(+(Math.random() * 10 + 5).toFixed(1)); // 5~15度
      setIceLevel(Math.floor(Math.random() * 100));  // 0~100%
      setStatus("Updated via Simulation");
    }, 1000);
  };

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
        {isTfReady ? (
          <TouchableOpacity style={styles.button} onPress={handleScan}>
            <Text style={styles.buttonText}>SHAKE & SCAN</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator size="large" color="#4facfe" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e', // 暗めのテックっぽい背景
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
  },
  button: {
    backgroundColor: '#4facfe',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    shadowColor: "#4facfe",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.5,
    shadowRadius: 10.32,
    elevation: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});