# ColdKeep U-22提出パッケージ README

このファイルは、応募後に指定される提出ストレージへアップロードするZIPの先頭に置くREADMEです。

## 作品名

ColdKeep — スマートフォンの音で水筒内部の水状態を推定する実験的AIアシスタント

## 提出版の主張

スマートフォンのマイクで水筒を振った音を録音し、端末内の音響特徴量と振り音モデルから、残量クラス（0% / 50% / 100%）を表示する経路を実装しています。チェックイン時点では phone/water-bottle 学習データが不足しているため、振り音アーティファクトは `未学習` であり、画面は安全に `未判定` を表示します。注ぐモデルを振り音へ流用しません。

温度、冷たさの残り時間、氷の重量・個数を測定する作品ではありません。
振り音クラスの信頼度が0.65未満の場合は、結果を `未判定` として再試行を促します。

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
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-preview.ps1
```

スクリプトは実行時だけ一時署名鍵を生成し、本番Release鍵をソースや提出ZIPへ含めません。
提出用の単体APKはソースZIPとは別に生成する
`output/ColdKeep-u22-current-preview.apk`またはCIのPreview artifactです。端末へインストール後、
SCANでマイク権限を許可し、水筒を一定の強さで1秒以上振って録音してください。学習済みアーティファクトが未配置の場合は `未判定` になります。

## ZIP内のファイル

- `App.tsx`: UIと録音・推論フロー
- `src/app/compositionRoot.ts`: PortとAdapterの組み立て
- `src/features/`: Scan/CollectionのDomain・Application・UseCase
- `src/platform/`: Android、推論、保存、共有のAdapter
- `audioProcessing.ts`: WAV検証、PCM16読込、リサンプリング補助
- `publicAudioClassifier.ts`: 注ぐ音の研究用TypeScript推論経路
- `publicShakeClassifier.ts`: 振り音3クラス推論経路（アーティファクトゲート付き）
- `ml/import_corsmal_shake.py`: 明示したCORSMAL振りIDのmanifest変換
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
- `scripts/build-preview.ps1`: 一時鍵を自動生成する再現可能なPreviewビルド
- `scripts/smoke-android.ps1`: 接続端末のインストール・起動・証拠保存

実行対象とソースの対応を変えた場合は、この一覧とビルド手順を同じ版で更新してください。`dataset/` の個人録音や、APIキー、個人情報はZIPに含めません。

## 再現性と制約

既存の注ぐモデルの評価はACM-S2の小規模なコンテナ分離評価です。水の有無18/18、充填5/6という結果がありますが、これは振り音モデルの精度ではありません。振り音を有効化するには、空・半分・満杯を2セッション以上で収集し、セッションホールドアウト評価を通過させる必要があります。未知の水筒・端末への精度保証はありません。

Rustのネイティブライブラリがない場合はTypeScript経路へフォールバックします。アプリ画面の推論情報に、使用した経路を表示します。

## ライセンス

提出時には、依存パッケージと評価データのライセンスを別紙に一覧化します。外部データやサンプル音声を同梱する場合は、再配布条件を確認してから追加してください。
