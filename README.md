# ColdKeep

ColdKeep は、スマートフォンのマイクで水筒に水を注いだ音を解析し、
水の有無と粗い充填状態を表示する実験的な AI プロトタイプです。
専用センサーを水筒に追加せず、録音・特徴量抽出・推論を端末内で完結させることを目指しています。

## 提出版の位置づけ

現在の提出版が判定するのは次の範囲です。

- 水の有無: `水あり` / `水なし`
- 水ありの場合の充填クラス: `50%` / `90%`
- 氷: 学習済みの氷ラベルがない間は `未判定`

氷の重量、正確な氷個数、水温、保冷時間は推定しません。未検証の条件では結果を強制せず、エラー時も `未判定` に戻します。

## 動作フロー

1. `SCAN` でマイク権限を許可する。
2. 現行モデルの学習条件に合わせ、水筒へ水を注ぐ音を同じ距離から1秒以上録音する。
3. Androidでは16 kHz・モノラル・16 bit PCM WAVをネイティブKotlinモジュールで生成する。
4. AndroidでRustブリッジが利用可能ならRust経路を試し、利用できなければTypeScript経路へフォールバックする。
5. WAVを検証し、リサンプリング、log-mel特徴量、線形softmaxモデルで水の有無と充填クラスを推定する。
6. 結果、信頼度、モデル状態、既知の制約を画面に表示する。

## 入力動作とモデルの対応

現行の公開ベースラインはACM-S2の注ぐ音（pouring）で学習・評価しています。
そのため、`SCAN`で有効な入力は注ぐ動作だけです。`shake`（振る）と`still`（静置）は
`COLLECT DATA`で比較データを集めるためのラベルであり、現在のスキャン精度を裏付ける
学習データではありません。叩く音や振る音を入力した場合は学習分布外として扱い、結果を
保証しません。

## 技術構成

- UI: React Native / TypeScript
- 録音: Android `AudioRecord` を使う自作 `WavRecorder` モジュール（提出対象はAndroid）
- WAV検証: `audioProcessing.ts`（RIFFチャンク、PCM16、モノラル化を検証）
- 特徴量/推論: `publicAudioClassifier.ts`（FFT、log-mel要約、線形softmax）
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

詳細は [DATA_COLLECTION.md](DATA_COLLECTION.md) を参照してください。氷モデルは `ice_count > 0` の二値分類で、正例・負例の両方が揃うまで学習を開始しません。設計上、ラベルがない氷判定を画面に表示しません。

## ローカル検証

```powershell
npm install
npx tsc --noEmit
npx eslint App.tsx
npm test -- --runInBand
```

Androidネイティブ確認:

```powershell
cd android
./gradlew.bat :app:assembleRelease
```

端末確認にはUSBデバッグを有効にしたAndroid端末を接続し、ビルドしたAPKをインストールします。マイク権限、録音、解析、再試行を同じ手順で確認してください。

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

- 録音環境、水筒の材質、マイク距離、注ぐ速度、周囲の騒音で結果が変わります。
- 現在の公開検証データには、氷有無の対になったラベルがありません。
- Rustの `.so` は開発環境で必ずしも生成されないため、TypeScriptフォールバックを保持しています。
- Android実機での録音→推論の成功証拠がない状態は、U-22提出の完了とは扱いません。

## U-22提出物

提出版の仕様、締切、必要な証拠は [U22_SUBMISSION_PLAN.md](U22_SUBMISSION_PLAN.md) に固定しています。ProtoPedia限定共有ページ、3分以内の説明動画、ソース一式、実行手順、評価結果、制約説明を同じ版番号で凍結して提出します。
