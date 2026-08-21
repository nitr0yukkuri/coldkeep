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

### データ収集画面を開く

個人向け画面とデータ収集画面は分離しています。Expo Goで収集画面を確認する場合は、
PowerShellで次のように起動します。

```powershell
$env:EXPO_PUBLIC_APP_MODE='collector'
npx expo start --clear
```

通常の個人向け画面へ戻すときは、環境変数を削除してMetroを再起動します。

```powershell
Remove-Item Env:EXPO_PUBLIC_APP_MODE -ErrorAction SilentlyContinue
npx expo start --clear
```

EASでは `collector` プロファイルが同じモードを設定します。通常の提出・配布版には
データ収集画面への導線を含めません。

### 「Project is incompatible with this version of Expo Go」と表示された場合

これは録音処理のエラーではなく、端末側のExpo GoがこのコンパニオンアプリのSDKより古い
という意味です。現在の`expo-go/package.json`はExpo SDK 57を固定しているため、iPhoneの
App StoreまたはAndroidのPlay StoreでExpo Goを最新版へ更新してから、QRコードを再度読み
込んでください。WindowsからiOSのネイティブビルドを行う必要はありません。古いExpo Goに
合わせてSDKを無理に下げると、`expo-audio`のPCM録音経路と依存関係の検証結果が変わるため、
提出版では行いません。

## 録音経路

- `expo-audio` の `useAudioStream` で16-bit PCMをメモリに受け取る
- モノラル化・リサンプリングを行い、ネイティブ経路と同じ16 kHz `PcmAudio`に正規化する
- 既存の `ScanBottleUseCase` と `publicAudioClassifier.ts`（TypeScript経路）へ渡す
- `COLLECT DATA` はPCM16 WAV・JSON・CSVを `expo-file-system` のDocument directoryへ保存し、共有時は音声込みZIPを作る
- 個人向け画面では水筒容量・音響残量観測・音響由来の自動飲水量をDocument directoryへ保存する

Expo GoにはこのリポジトリのRust/TFLiteカスタムネイティブモジュールは含まれないため、
Expo経路の推論エンジン表示はTypeScriptになります。氷モデルは現時点で未学習なので、
振り音の氷量は引き続き `未判定` です。

水分記録は熱中症の診断や予防を保証するものではなく、個人の補助記録です。信頼度を満たす
音響差分だけを、確認ボタンなしで飲水量へ自動保存します。

## 入力動作の注意

個人向けのSCANとデータ収集は **shake（振る）** に固定しています。1秒以上、一定の強さで
水筒を振ってください。振り音モデルが未学習または信頼度不足の場合は `未判定` となり、
注ぐ音モデルへ自動フォールバックしません。`pour`（注ぐ）と`still`（静置）は比較データの
互換ラベルとしてのみ残しています。

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

2026-08-15に `npm audit --omit=dev --audit-level=high` を実行したところ、32件（high 25、
moderate 7）が報告されました。主な経路はExpo/React Native/MetroのCLI・ビルドグラフと、
その中の`image-size`および`uuid`です。これは開発時の依存グラフに含まれる既知の問題を
隠さず記録したもので、Expo Goへ配信するColdKeepのJavaScriptバンドルにサーバーやAPIキー
は含めていません。ただし「脆弱性ゼロ」とは主張せず、ロックファイルを固定し、ビルド時の
入力を信頼できるソースに限定します。

現時点の修正提案は `npm audit fix --force` だけで、Expo SDKを57から53へ下げる破壊的変更を
含むため適用していません。Expo SDKの互換更新で修正版が提供された時点で、exportと実機確認を
やり直してから更新します。依存取得時は必ず `expo-go/package-lock.json` を使ってください。
