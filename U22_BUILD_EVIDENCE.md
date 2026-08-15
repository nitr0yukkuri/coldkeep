# ColdKeep U-22提出ビルド証拠

更新日: 2026-08-15

## Current standalone Preview APK

- ビルド日時: 2026-08-15
- コマンド: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-preview.ps1`
- 署名: ローカルの一時Preview keystore（提出用の本番秘密鍵は使用しない）
- APK: `android/app/build/outputs/apk/preview/app-preview.apk`
- 生成物コピー: `output/ColdKeep-u22-current-preview.apk`
- サイズ: 48,235,978 bytes
- SHA-256: `B7BC6396369A27FCEEE1EC5774D3BEFE20B5D5362C49B1F2E492F22DC423A251`
- JS bundle: APK内の`assets/index.android.bundle`（896,368 bytes）を確認
- 静的検査: `com.anonymous.coldkeep`、compile/target SDK 34、`RECORD_AUDIO`のみを確認。ストレージ/オーバーレイ権限は含めない
- Rust `.so`: ローカルではcargo未導入のため未同梱。TypeScript推論へフォールバックする。CI Preview artifactではRustライブラリを生成して同梱する
- 再現性: `scripts/build-preview.ps1`が実行時だけ一時署名鍵を作成し、終了時に削除する。本番鍵・パスワードはリポジトリへ保存しない

## Release APK（旧コードの提出候補・参考）

- ビルド日時: 2026-08-09
- コマンド: `cd android; ./gradlew.bat :app:assembleRelease --no-daemon --offline --no-build-cache --console=plain -x lintVitalRelease -x lintVitalReportRelease`
- 結果: `BUILD SUCCESSFUL`
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- 生成物コピー: `output/ColdKeep-u22-release.apk`
- サイズ: 48,214,434 bytes
- SHA-256: `916B51B3C6DF75886D3DC86618073A3AF51C0A0C3FC1509EAD0F2DEB96617AD7`
- JS bundle: APK内の`assets/index.android.bundle`（876,320 bytes）を確認

## Debug APK（旧コードの提出候補・Metro接続用）

- ビルド日時: 2026-08-09
- コマンド: `cd android; ./gradlew.bat :app:assembleDebug`
- 結果: `BUILD SUCCESSFUL`
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- 生成物コピー: `output/ColdKeep-u22-debug.apk`
- サイズ: 108,317,626 bytes
- SHA-256: `40EFD404F9EB7684F1A03A53024E3A357529DC2C945292D83D14976727223F6E`
- 静的APK検査: `com.anonymous.coldkeep`、`MainActivity`、`RECORD_AUDIO`を確認。ストレージ/オーバーレイ権限は含めない。

## ソース提出ZIP

- 作成コマンド: `powershell -ExecutionPolicy Bypass -File .\package_u22.ps1`
- ZIP: `output/ColdKeep-U22-source.zip`
- SHA-256: `package_u22.ps1`の出力を提出時に記録する（このREADME自身をZIPに含めるため固定値は埋め込まない）
- 検査: `node_modules`、`dataset`、`build`、`.gradle`、`output`、`tmp`、`.git`を含まないことを確認済み
- 検査: `android/local.properties`を含まず、ユーザー固有のSDK絶対パスを除外済み
- 検査: `ios/` と `expo-go/` のソースを含み、Expoの生成物`expo-go/dist`は除外済み

## 成功した自動検証

提出前の再検証は次で一括実行する（Android SDKが正常な環境では`-SkipAndroid`を外す）。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-submission.ps1 -SkipAndroid
```

```powershell
npx tsc --noEmit
npx eslint App.tsx babel.config.js metro.config.js index.js
npm test -- --runInBand
```

- TypeScript: 成功
- ESLint: 成功
- Jest: 11 suites / 49 tests 成功（現ワークツリー）
- Python ML: 10 tests 成功（現ワークツリー）
- Rust: `cargo` 未導入のためローカル検証はスキップ。CIのRustジョブで`cargo test`を実行する。
- React Native Android bundle生成: 成功
- Gradle設定: Release署名チェックとPreview一時署名チェックを分離済み
- 現行Preview APK生成: 成功。JS bundleを含む単体APKとして静的検査済み
- 現行Debug APK生成: 成功。ただしDebugはMetro接続が必要で、提出用単体APKにはPreviewを使う
- Release APK生成: 本番秘密鍵が未設定のため意図的に未実行。Previewは本番Release鍵の代替ではない

## CI Androidビルド

`.github/workflows/quality.yml` の `android-preview` ジョブは、PR/`main` push
ごとにAndroid SDK 34とNDK 26.1でRust推論ライブラリを生成し、CIごとの一時鍵で
JS bundle入りPreview APKへ同梱して、14日間のActions artifactとして保存する。
本番Release鍵はCIへ持ち込まず、Previewは審査用の再現可能な単体APKとして扱う。

## エミュレータ smoke evidence

- 環境: `coldkeep_api35`、API 35、`emulator-5554`
- 現行Preview APKを旧署名アプリ削除後にクリーンインストールし、Metroなしで`MainActivity`を起動
- 初回の`RECORD_AUDIO`許可ダイアログを確認
- 2秒録音後に停止し、エミュレータの低信号入力を`有効な音声信号がありません。水筒へ水を注ぐ音を録音してください`として拒否
- アプリプロセスは維持され、誤った水あり/90%表示やクラッシュは発生しなかった
- これはエミュレータの入力品質ゲート証拠であり、実水筒の分類精度・実機3回成功の代替ではない

## 端末で残る確認

1. `ColdKeep-u22-current-preview.apk`（またはCIのPreview artifact）をAndroid端末へインストールする。
2. 初回マイク権限を許可する。
3. 1秒以上録音して停止する。
4. `TypeScript estimate complete` が表示され、水あり/なしと充填クラスが出ることを確認する。
5. 同じ条件で3回実行し、2回以上結果が表示されることを記録する。
6. `COLLECT DATA` でラベル付きWAVを1件保存し、共有テキストが生成されることを確認する。

この端末確認と現行コードでのAPK再生成が終わるまでは、U-22提出要件の「実機動作」を完了扱いにしない。
