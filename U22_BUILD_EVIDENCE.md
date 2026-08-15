# ColdKeep U-22提出ビルド証拠

> このファイルのAPKハッシュは2026-08-09に生成した旧提出候補の証拠です。
> 2026-08-15のUI・信頼度ガード変更後は、Android SDKの`android-34`ディレクトリが
> Windowsのアクセス拒否になっているため、APKを再生成してハッシュを更新する必要があります。

## Release APK（旧コードの提出候補）

- ビルド日時: 2026-08-09
- コマンド: `cd android; ./gradlew.bat :app:assembleRelease --no-daemon --offline --no-build-cache --console=plain -x lintVitalRelease -x lintVitalReportRelease`
- 結果: `BUILD SUCCESSFUL`
- APK: `android/app/build/outputs/apk/release/app-release.apk`
- 生成物コピー: `output/ColdKeep-u22-release.apk`
- サイズ: 48,214,434 bytes
- SHA-256: `916B51B3C6DF75886D3DC86618073A3AF51C0A0C3FC1509EAD0F2DEB96617AD7`
- JS bundle: APK内の`assets/index.android.bundle`（876,320 bytes）を確認

## Debug APK（旧コードの提出候補）

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
- Jest: 10 suites / 35 tests 成功（現ワークツリー）
- React Native Android bundle生成: 成功
- Gradle設定: Release署名チェックをDebug評価から分離済み。現環境ではAndroid SDK `android-34`のアクセス拒否でコンパイル未完了
- Debug APK生成: 旧コードで成功。現行コードはSDK修復後に再生成が必要
- Release APK生成: 旧コードで成功。現行コードは署名設定とSDK修復後に再生成が必要

## 端末で残る確認

1. APKをAndroid端末へインストールする。
2. 初回マイク権限を許可する。
3. 1秒以上録音して停止する。
4. `TypeScript estimate complete` が表示され、水あり/なしと充填クラスが出ることを確認する。
5. 同じ条件で3回実行し、2回以上結果が表示されることを記録する。
6. `COLLECT DATA` でラベル付きWAVを1件保存し、共有テキストが生成されることを確認する。

この端末確認と現行コードでのAPK再生成が終わるまでは、U-22提出要件の「実機動作」を完了扱いにしない。
