# Expo Go 確認手順

`expo-go/` は、既存のReact Native CLIアプリを壊さずにiPhone/AndroidのExpo Goで
録音経路を確認するための独立したコンパニオンアプリです。ルートのAndroid/iOS
ネイティブ実装とは依存グラフを分けています。

## 起動

```powershell
cd expo-go
npm install
npx expo start
```

表示されたQRコードをExpo Goで読み込みます。Windowsからでも、同じLAN上のiPhoneまたは
Androidで確認できます。接続できない場合は `npx expo start --tunnel` を使います。

## 録音経路

- `expo-audio` の `useAudioStream` で16-bit PCMをメモリに受け取る
- モノラル化・リサンプリングを行い、ネイティブ経路と同じ16 kHz `PcmAudio`に正規化する
- 既存の `ScanBottleUseCase` と `publicAudioClassifier.ts`（TypeScript経路）へ渡す
- `COLLECT DATA` はPCM16 WAV・JSON・CSVを `expo-file-system` のDocument directoryへ保存する

Expo GoにはこのリポジトリのRust/TFLiteカスタムネイティブモジュールは含まれないため、
Expo経路の推論エンジン表示はTypeScriptになります。氷モデルは現時点で未学習なので、
氷の有無は引き続き `未判定` です。

## 入力動作の注意

現行の公開モデルが学習・評価したのはACM-S2の **pour（注ぐ）** 録音です。Expo Goでも
画面の指示どおり水筒へ水を注ぐ音を録音してください。`shake` と `still` はデータ収集用の
比較ラベルで、現行スキャンモデルの評価入力ではありません。

## 検証

```powershell
cd expo-go
npm run typecheck
npx expo export --platform ios
npx expo export --platform android
```

上記のexportはJavaScriptバンドルの検証です。マイクの実録音と権限ダイアログは、Expo Goを
実機で開いて確認します。WindowsではiOSネイティブビルドは行いません。
