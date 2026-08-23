# ColdKeep

ColdKeep は、スマートフォンのマイクで水筒を振った音を解析し、
残量を空・半分・満杯の3段階で表示する実験的な AI プロトタイプです。
専用センサーを水筒に追加せず、録音・特徴量抽出・推論を端末内で完結させることを目指しています。

## 提出版の位置づけ

現在の提出版が持つ判定契約は次の範囲です。

- 振り音の残量クラス: `0%` / `50%` / `100%`
- 通常画面では学習済みモデルがない場合も、composition rootで明示的にopt-inした汎用の試験推定を表示できる。試験推定は飲水量の自動記録には使わない
- 信頼度が閾値未満、または振り音アーティファクトがない場合: `未判定`
- 振り音の氷量: 学習済みなら `なし` / `少ない` / `多い` の3段階。未学習・低信頼度は `未判定`

残量判定の確率が0.65未満の場合は、画面を `未判定` に戻して
再試行を促します。低信頼度の結果は水分量の差分計算にも使いません。

録音のRMSが0.0025未満、またはピークが0.02未満の無音・入力不良は、モデルへ渡す前に
再録音として拒否します。モデルの正規化で無音が高信頼度に見えることを防ぐための品質ゲートです。

氷の重量、正確な氷個数、水温、保冷時間は推定しません。振り音の氷量は、学習済みモデルの信頼度が0.65以上の場合だけ `なし` / `少ない` / `多い` の粗い3段階で表示します。未検証の条件では結果を強制せず、エラー時も `未判定` に戻します。

## 動作フロー

1. `SCAN` でマイク権限を許可する。
2. 水筒を一定の強さで1秒以上振り、振り音を録音する。
3. Androidでは16 kHz・モノラル・16 bit PCM WAVをネイティブKotlinモジュールで生成する。
4. AndroidでRustブリッジが利用可能ならRust経路を試し、利用できなければTypeScript経路へフォールバックする。
5. WAVを検証し、リサンプリング、log-mel特徴量、線形softmaxモデルで振り音の残量クラスを推定する。
6. 結果、信頼度、モデル状態、既知の制約を画面に表示する。

## 個人向け水分記録

個人向けの画面では、水筒容量だけを設定します。音響スキャンの充填結果は端末内に残量観測
として保存され、信頼度を満たした前回との差分は飲水量へ自動追加されます。個人向けの音響
チェックも、水筒を振る音を入力します。モデルが学習済みの場合だけ、設定容量に対する3段階
の残量を観測します。
熱中症を診断・予防する機能でもありません。詳しくは
[HYDRATION.md](HYDRATION.md) を参照してください。

## 入力動作とモデルの対応

既存の公開ベースラインはACM-S2の注ぐ音（pouring）で学習・評価した研究用アーティファクトです。
個人向け画面は`shake`（振る）を入力動作に固定し、注ぐモデルを振り音へ流用しません。
`ml/artifacts/shake_fill_level_pilot.json`は現在`untrained`です。アプリのcomposition rootでは
`allowExperimentalPreview`を明示的に有効化しているため、汎用の低信頼度ヒューリスティックを
`experimental`として表示できます。ただし飲水量の自動記録には使いません。
phone/water-bottleデータでセッションホールドアウト評価を通過したモデルへ置き換えた場合だけ、
`trained`として残量差分を自動記録します。
データ収集画面の動作は`shake`（振る）に固定しています。`still`（静置）と
`pour`（注ぐ）は、過去CSVや比較用データを壊さないため内部の互換ラベルとして残しています。

## 技術構成

- UI: React Native / TypeScript
- 録音: Android `AudioRecord` を使う自作 `WavRecorder` モジュール（提出対象はAndroid）
- WAV検証: `audioProcessing.ts`（RIFFチャンク、PCM16、モノラル化を検証）
- 特徴量/推論: `publicAudioClassifier.ts` / `publicShakeClassifier.ts`（FFT、log-mel要約、線形softmax）
- 任意のネイティブ経路: Rust `coldkeep_ml` + Kotlin `RustAudioClassifier` ブリッジ
- データ収集: `COLLECT DATA` タブ。ラベル付きWAV、CSV、JSON sidecarをアプリ内に保存

### アーキテクチャ

機能単位のモジュラーモノリスに、軽量オニオン／ヘキサゴナル境界を重ねています。
`src/features/scan` と `src/features/collection` がユースケースとドメインを持ち、
録音・推論・保存・共有は `src/platform` のAdapterとして実装します。Rust、
TypeScript、将来の別推論エンジンは同じ `AudioClassifier` 契約で差し替えます。
Portの組み立ては `src/app/compositionRoot.ts` に集約し、UIがネイティブAPIへ
直接依存しない構成にしています。

Rustは速度と端末内再現性を改善するための経路です。Rustライブラリが未ビルドでも、同じ入力に対してテスト済みのTypeScriptフォールバックを使用できます。Rustを使うこと自体は精度の証拠ではありません。

## 評価結果と解釈

`ml/artifacts/baseline_metrics.json` に、ACM-S2のコンテナ分離評価を保存しています。

| タスク | 正解数 | 精度 | 注意 |
| --- | ---: | ---: | --- |
| 水の有無 | 18 / 18 | 100.0% | 21録音規模の外部検証。未知の水筒への保証ではない |
| 水あり時の充填 | 5 / 6 | 83.3% | `50%` / `90%` の粗い2クラス |
| 内容物分類 | 16 / 18 | 88.9% | 提出版UIの主判定ではない補助評価 |

サンプル数が小さいため、これらを製品精度・一般化性能として宣伝しません。評価資料ではデータ分割、混同行列、失敗例、録音条件を併記します。

## データ収集

`COLLECT DATA` では、実測した水量、氷個数、氷質量、温度、容器、端末、距離、動作を入力して録音します。

詳細は [DATA_COLLECTION.md](DATA_COLLECTION.md) を参照してください。振り音の氷モデルは実測 `ice_count` を `0` / `1--2` / `3以上` の3段階へまとめ、各クラス・セッションが揃うまで学習を開始しません。正確な個数はアプリの推論結果として表示しません。

## ローカル検証

```powershell
npm ci
npx tsc --noEmit
npx eslint App.tsx
npm test -- --runInBand

powershell -ExecutionPolicy Bypass -File .\scripts\verify-submission.ps1 -SkipAndroid
```

Androidネイティブ確認:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-preview.ps1
```

スクリプトは本番鍵を使わず、実行時だけ一時署名鍵を作り、JS bundle入りPreview APKを
`output/ColdKeep-u22-current-preview.apk`へコピーします。直接Gradleを呼ぶ場合は
`COLDKEEP_PREVIEW_*`環境変数を指定してください。
端末確認にはUSBデバッグを有効にしたAndroid端末を接続し、生成されたPreview APKをインストールします。
マイク権限、録音、解析、無音時の再録音、再試行を同じ手順で確認してください。

接続端末へのインストール・起動・スクリーンショット・直近ログの保存は次で行えます。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -ResetApp
```

### Expo Goでの確認

iPhoneを含む実機の録音確認は、独立した `expo-go/` コンパニオンを使います。MacやEASの
有料登録は必要ありません。

```powershell
cd expo-go
npm install
npx expo start
```

詳細な制約、PCM経路、iOS/Androidのexport確認は [EXPO_GO.md](EXPO_GO.md) にまとめています。

## 既知の制約

- 録音環境、水筒の材質、マイク距離、振る強さ、周囲の騒音で結果が変わります。
- 現在の公開検証データには、水筒を振った氷量の対になったラベルがありません。収集済みデータがゲートを満たすまで氷量は `未判定` です。
- Rustの `.so` は開発環境で必ずしも生成されないため、TypeScriptフォールバックを保持しています。
- Android実機での録音→推論の成功証拠がない状態は、提出の完了とは扱いません。

## U-22提出物

提出版の仕様、締切、必要な証拠は [U22_SUBMISSION_PLAN.md](U22_SUBMISSION_PLAN.md) に固定しています。ProtoPedia限定共有ページ、3分以内の説明動画、ソース一式、実行手順、評価結果、制約説明を同じ版番号で凍結して提出します。

## VORN Challenge提出物

VORN Challengeを本命にする場合は、AI・社会課題・新しい市場価値が一続きで伝わる提出版にします。公式フォームの入力欄・文字数・ファイル形式は、[VORN Challenge公式募集要項](https://vorn-challenge.com/)とGoogleフォームを優先してください。

- [VORN_SUBMISSION_PLAN.md](VORN_SUBMISSION_PLAN.md): 公式要件、提出物、実演手順、受け入れ条件
- [VORN_APPLICATION_DRAFT.md](VORN_APPLICATION_DRAFT.md): 応募フォーム下書き
- [VORN_VIDEO_SCRIPT.md](VORN_VIDEO_SCRIPT.md): 実演動画の台本
- [VORN_ARCHITECTURE.md](VORN_ARCHITECTURE.md): 技術構成とVORN評価項目の対応
- [VORN_SUBMISSION_README.md](VORN_SUBMISSION_README.md): 提出パッケージの同梱・除外ルール

ColdKeepのVORN向け主張は「振るだけで水筒の残量と飲水量を見える化する音響AI」です。正確なml、温度、氷の重量、熱中症の診断・予防は主張せず、低信頼度や未学習時に`未判定`へ退避する安全設計を中心に説明します。学習済みモデルへ置き換えた提出版では、容量だけの設定で飲水量を自動記録できます。
