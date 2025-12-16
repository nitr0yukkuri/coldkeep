import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';

// ★重要: simple_model.tflite を App.tsx と同じ場所に置いてください
// もしフォルダが違う場合はパスを書き換えてください (例: './assets/simple_model.tflite')
const modelAsset = require('./simple_model.tflite');

function App(): React.JSX.Element {
  const [result, setResult] = useState<string | null>(null);
  const plugin = useTensorflowModel(modelAsset);
  const model = plugin.model;

  const runTest = async () => {
    if (!model) {
      setResult('モデルを読み込み中...');
      return;
    }

    try {
      // 1. 入力データを作成 (数値 10.0 を入力)
      const inputData = new Float32Array([10.0]);

      // 2. 推論実行
      // inputData を [ ] で囲んで配列にします
      const output = await model.run([inputData]);

      // 3. 結果を表示
      // ★★★ 修正ポイント: Number() で囲んで「これは数字だよ」と明示します ★★★
      const answer = Number(output[0][0]);

      setResult(`AIの答え: ${answer.toFixed(1)}`);

    } catch (e: any) {
      console.error(e);
      setResult(`推論失敗: ${e.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ColdKeep AI Test</Text>

      <Text style={styles.result}>
        {result ? result : 'ボタンを押してテスト'}
      </Text>

      <TouchableOpacity style={styles.button} onPress={runTest}>
        <Text style={styles.buttonText}>テスト実行</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#000000',
  },
  result: {
    fontSize: 18,
    marginBottom: 30,
    color: '#333333',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default App;