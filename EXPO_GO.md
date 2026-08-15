# Expo Go 確認手順

`expo-go/` は、既存のReact Native CLIアプリを壊さずにiPhone/AndroidのExpo Goで
録音経路を確認するための独立したコンパニオンアプリです。ルートのAndroid/iOS
ネイティブ実装とは依存グラフを分けています。

## 起動

```powershell
cd expo-go
npm ci
npx expo start
```

表示されたQRコードをExpo Goで読み込みます。Windowsからでも、同じLAN上のiPhoneまたは
Androidで確認できます。接続できない場合は `npx expo start --tunnel` を使います。

## 録音経路

- `expo-audio` の `useAudioStream` で16-bit PCMをメモリに受け取る
- モノラル化・リサンプリングを行い、ネイティブ経路と同じ16 kHz `PcmAudio`に正規化する
- 既存の `ScanBottleUseCase` と `publicAudioClassifier.ts`（TypeScript経路）へ渡す
- `COLLECT DATA` はPCM16 WAV・JSON・CSVを `expo-file-system` のDocument directoryへ保存する
- 個人向け画面では水筒容量・1日目標・手動飲水量・音響残量観測をDocument directoryへ保存する

Expo GoにはこのリポジトリのRust/TFLiteカスタムネイティブモジュールは含まれないため、
Expo経路の推論エンジン表示はTypeScriptになります。氷モデルは現時点で未学習なので、
氷の有無は引き続き `未判定` です。

水分記録は熱中症の診断や予防を保証するものではなく、個人の補助記録です。音響差分を
飲水量へ追加する場合も、画面の確認ボタンを押したときだけ保存します。

## 入力動作の注意

現行の公開モデルが学習・評価したのはACM-S2の **pour（注ぐ）** 録音です。研究用ベースラインを
再現する場合は水筒へ水を注ぐ音を録音してください。個人向け画面の残量差分も、現行モデルの
入力動作に合わせて注ぐ音のチェック結果を比較する設計です。`shake` は別モデルを作るための
データ収集用ラベルで、現行モデルの入力には使いません。`still` は比較用ラベルです。

## 検証

```powershell
cd expo-go
npm run typecheck
npx expo export --platform ios
npx expo export --platform android
```

上記のexportはJavaScriptバンドルの検証です。マイクの実録音と権限ダイアログは、Expo Goを
実機で開いて確認します。WindowsではiOSネイティブビルドは行いません。

## 依存監査

2026-08-11に `npm audit --omit=dev --audit-level=high` を実行したところ、18件（high 11、
moderate 7）が報告されました。内訳はExpo CLI/Metroのビルド時依存 `image-size@1.2.1` と、
Expo config pluginのビルド時依存 `uuid@7.0.3` です。これらはExpo Goへ配信するColdKeepの
JavaScriptバンドルには含まれず、端末上の録音・推論コードからは到達しません。

現時点の修正提案は `npm audit fix --force` だけで、Expo SDKを57から53へ下げる破壊的変更を
含むため適用していません。Expo SDKの互換更新で修正版が提供された時点で、exportと実機確認を
やり直してから更新します。依存取得時は必ず `expo-go/package-lock.json` を使ってください。
