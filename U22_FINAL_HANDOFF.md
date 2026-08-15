# U-22最終引き渡し

## 現行提出版

提出対象は旧Release APKではなく、現行コードから生成したPreview APKです。
Release署名鍵はリポジトリへ保存していないため、提出時はCI artifactまたは手元で再生成したPreviewを使います。

- ローカルAPK: `output/ColdKeep-u22-current-preview.apk`
- ローカルAPK SHA-256（2026-08-15生成）: `8B15A452CAB8BDE0192AF26224DFC9CB29BADE1B6E022B3CF2C3ED92FADEB0BD`
- CI Preview artifact: [Quality run 15](https://github.com/nitr0yukkuri/coldkeep/actions/runs/31876258365)（artifactは2026-08-29まで）
- CI source artifactも同じrunに保存している。APKとソースのheadは`79bb273c44514f16e3781052d4bada58da1373fa`。

CI artifactはActionsへのログインが必要で、期限後は同じコミットからビルド手順で再生成する。

## 端末が接続できるようになったら

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb install -r output\ColdKeep-u22-current-preview.apk
& $adb shell monkey -p com.anonymous.coldkeep 1
```

Previewは一時署名のため、異なる署名の旧アプリが入っている場合は先にアンインストールする。
提出版を再生成した場合は、このファイルと`U22_BUILD_EVIDENCE.md`のハッシュを同じ版に更新する。

端末で次を確認する。

1. 初回マイク権限を許可する。
2. SCANで同じ水筒を1秒以上録音する。
3. 停止後に水あり/なし、充填クラス、推論経路が表示される。
4. 同じ条件で3回実行し、成功回数と端末名/OSを記録する。
5. 失敗時にクラッシュせず、`未判定` と再試行が表示される。
6. COLLECT DATAでラベル付き録音を1件保存する。

記録欄:

```text
端末:
Android OS:
アプリ版: 0.0.1 / Release APK SHA-256=<現行コードで再生成後に記録>
SCAN試行1:
SCAN試行2:
SCAN試行3:
失敗時表示:
COLLECT DATA保存:
```

## あなたにしか確認できないU-22項目

- 年齢または学生資格が公式基準を満たすか。
- ColdKeepが過去に同一作品として応募・公開されていないか。
- 同一作品を他コンテストへ同時応募していないか。
- ProtoPedia限定共有URL。
- 3分以内のYouTube/Vimeo限定公開URL。
- 応募者名、連絡先、学校/所属、実機情報。

これらは推測で埋めず、応募フォームへ本人が入力する。ログイン情報、APIキー、個人情報はリポジトリやZIPへ書き込まない。

## 提出物

- `output/ColdKeep-u22-current-preview.apk`（提出・単体起動用）
- `output/ColdKeep-u22-debug.apk`（Metro接続デバッグ用）
- `output/ColdKeep-U22-source.zip`
- `U22_EVALUATION_REPORT.md`
- `U22_ARCHITECTURE.md`
- `U22_VIDEO_SCRIPT.md`
- `U22_PROTOPEDIA_DRAFT.md`
- `U22_APPLICATION_DRAFT.md`
- `U22_LICENSES.md`
- `SUBMISSION_README.md`

実機動画とProtoPediaのURLを追加して、同じ版のまま提出する。実機確認が終わる前に、実機動作済みとは記載しない。
