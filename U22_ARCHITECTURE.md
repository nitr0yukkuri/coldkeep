# ColdKeep 構成図

## 提出版の処理フロー

```mermaid
flowchart LR
  A[Android / iOS マイク] --> B[録音]
  B --> C[PCM16 WAV]
  C --> D{Android Rust bridge}
  D -->|利用可能| E[Rust: WAV検証 + resample + FFT/log-mel + 推論]
  D -->|未搭載 / 失敗| F[TypeScript: WAV検証 + resample + FFT/log-mel + 推論]
  E --> G[共通JSON契約]
  F --> G
  G --> H[水あり/なし]
  G --> I[充填 50%/90%]
  G --> J[氷 未判定 or 二値]
  H --> K[SCAN UI]
  I --> K
  J --> K
```

## データ収集フロー

```mermaid
flowchart TD
  A[COLLECT DATA] --> B[実測ラベル入力]
  B --> C[録音]
  C --> D[PCM16 WAV検証]
  D --> E[audio/<id>.wav]
  D --> F[metadata/<id>.json]
  F --> G[manifest.csv]
  G --> H[外部保存 / 学習]
  H --> I[セッション・容器・端末単位で評価]
```

## 境界と安全策

- UIはRust/TypeScriptのどちらの経路でも同じ戻り値契約を使う。
- Rust経路が落ちても、テスト済みのTypeScriptフォールバックで解析を継続する。
- 音声が短い、WAV形式が不正、権限がない、推論に失敗した場合は、古い結果を残さず `未判定` に戻す。
- 氷モデルがない場合の氷結果は `null` とし、`あり/なし` を推測表示しない。

## アプリケーション構造

提出版は、React NativeのUIを外側に置き、機能単位のモジュラーモノリスと
軽量オニオン／ヘキサゴナル境界を採用する。

```text
src/features/scan/
  domain/       ScanResultと判定ポリシー
  application/  録音・推論のユースケースとフォールバック
src/features/collection/
  application/  ラベル付き録音とエクスポートのユースケース
src/platform/
  android/      Kotlin AudioRecordとAndroid権限のアダプター
  ml/            Rust / TypeScript推論アダプター
  storage/      react-native-fsアダプター
  sharing/      React Native Shareアダプター
src/app/
  compositionRoot.ts  PortとAdapterの組み立て
```

Domain/ApplicationはReact Native、Kotlin、Rust、RNFSを直接参照しない。
録音・推論・保存はPort経由で差し替えられるため、Rustの有無や将来のiOS実装が
UIの変更に波及しない。現在の`dataCollection.ts`、`audioProcessing.ts`、
`publicAudioClassifier.ts`は既存テストとの互換性を保つ共有モジュールとして残し、
新しい依存は`src/app/compositionRoot.ts`から注入する。
