# ColdKeep U-22提出パッケージ README

このファイルは、応募後に指定される提出ストレージへアップロードするZIPの先頭に置くREADMEです。

## 作品名

ColdKeep — スマートフォンの音で水筒内部の水状態を推定する実験的AIアシスタント

## 提出版の主張

スマートフォンのマイクで水筒に水を注いだ音を録音し、端末内の音響特徴量と分類モデルから、水の有無と粗い充填クラス（50% / 90%）を表示します。氷のラベルが未学習の間は、氷を `未判定` と表示します。叩く・振る動作は別モデル用の収集対象で、現行モデルの評価対象外です。

温度、冷たさの残り時間、氷の重量・個数を測定する作品ではありません。
水判定または充填判定の確率が0.65未満の場合は、結果を `未判定` として再試行を促します。

## 実行環境

- Android 端末（マイク権限、USBデバッグまたはAPKインストール）
- Node.js 18以上（ソースからMetroを起動する場合）
- npm
- Android Studio / Android SDK（ソースからAPKをビルドする場合）

## 起動

```powershell
npm ci
npm start
```

APKをビルドする場合:

```powershell
cd android
./gradlew.bat :app:assembleRelease
```

提出用の単体APKは、ソースZIPとは別に生成する`output/ColdKeep-u22-release.apk`です。端末へインストール後、
SCANでマイク権限を許可し、同じ水筒を1秒以上録音してください。

## ZIP内のファイル

- `App.tsx`: UIと録音・推論フロー
- `src/app/compositionRoot.ts`: PortとAdapterの組み立て
- `src/features/`: Scan/CollectionのDomain・Application・UseCase
- `src/platform/`: Android、推論、保存、共有のAdapter
- `audioProcessing.ts`: WAV検証、PCM16読込、リサンプリング補助
- `publicAudioClassifier.ts`: TypeScript推論経路
- `ml/artifacts/public_audio_baseline.json`: 現行推論アーティファクト
- `android/app/src/main/java/.../WavRecorderModule.kt`: Android録音
- `android/app/src/main/java/.../RustAudioClassifierModule.kt`: Rust任意経路
- `ios/ColdKeep/`: iOSネイティブ録音と権限設定
- `expo-go/`: MacなしでExpo Goから確認するコンパニオン
- `rust/coldkeep_ml/`: Rust推論コア
- `U22_ARCHITECTURE.md`: 構成図
- `U22_EVALUATION_REPORT.md`: 評価結果と限界
- `DATA_COLLECTION.md`: ラベル付きデータ収集手順
- `U22_VIDEO_SCRIPT.md`: 3分以内説明動画の台本

実行対象とソースの対応を変えた場合は、この一覧とビルド手順を同じ版で更新してください。`dataset/` の個人録音や、APIキー、個人情報はZIPに含めません。

## 再現性と制約

現行モデルの評価はACM-S2の小規模なコンテナ分離評価です。水の有無18/18、充填5/6という結果がありますが、未知の水筒・端末への精度保証ではありません。周囲の音、水筒材質、距離、注ぐ速度で結果が変わります。評価データは注ぐ動作であり、叩く・振る動作の評価ではありません。

Rustのネイティブライブラリがない場合はTypeScript経路へフォールバックします。アプリ画面の推論情報に、使用した経路を表示します。

## ライセンス

提出時には、依存パッケージと評価データのライセンスを別紙に一覧化します。外部データやサンプル音声を同梱する場合は、再配布条件を確認してから追加してください。
