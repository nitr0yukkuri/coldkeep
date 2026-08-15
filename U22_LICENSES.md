# ColdKeep 提出物ライセンス一覧

提出時に、ZIPへ同梱したソース・モデル・評価データの出所を説明するための一覧です。依存パッケージの完全な解決結果は `package-lock.json` の `license` フィールドを参照してください。

| 対象 | 用途 | ライセンス/扱い |
| --- | --- | --- |
| ColdKeepのTypeScript/Kotlin/Rustコード | アプリ本体、録音、特徴量、推論 | リポジトリの配布条件に従う。Rust crateの宣言はMIT |
| React / React Native | UIランタイム | MIT |
| react-native-fs | アプリ内ファイル保存 | MIT |
| @react-native-community/cli | Android自動リンク/開発CLI | MIT |
| Rust `serde`, `serde_json`, `jni` | Rustブリッジ補助 | 各crateの配布条件をCargo.lockで確認 |
| Android Gradle Plugin / Gradle | APKビルド | 各ツールのNOTICE/LICENSEを提出環境に従って確認 |
| `ml/artifacts/public_audio_baseline.json` | 端末内の線形モデル | ColdKeep生成アーティファクト。元データの再配布条件を分離して管理 |
| ACM-S2評価データ | 小規模な外部評価 | Audio-based Containers Manipulation Setup 2 (Donaher, Xompero, Cavallaro), CC BY 4.0。音声本体は提出ZIPに含めず、[配布元](https://zenodo.org/records/4770439)を明記 |
| `public_audio_baseline.json` | ACM-S2から生成した端末内モデル | ACM-S2の帰属表示を維持したColdKeep生成物。未知の水筒への精度を主張しない |

## 提出前チェック

- [ ] 評価データ本体や個人録音をZIPに含めていない
- [ ] 外部データをProtoPediaや動画へ再配布する場合、原ライセンスを確認した
- [ ] `package-lock.json` と `Cargo.lock`（Rustをビルドする場合）を同じソース版で提出する
- [ ] APIキー、個人情報、端末固有ログを除外した
