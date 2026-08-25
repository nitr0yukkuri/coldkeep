# Rust化と振り音の氷量判定の分析

## 結論

- 振り音の氷量は重量や正確な個数ではなく、`none`（0）/ `few`（1--2）/ `many`（3以上）の3段階分類にする。
- 学習はPython/NumPy、端末推論はRustに分離する。Rustに変えるだけでは精度は上がらないが、WAV解析・FFT・log-mel・推論をJSブリッジ外へ移せるため、端末上の再現性と実行時間を改善しやすい。
- 氷ラベルがない状態で推測値を出すのは危険なので、現在の画面は `未判定` を出す。Rustコアは、3クラスを含む収集マニフェストから生成したモデルだけを自動的に読み込む。

## データ上の制約

現行の公開検証データ（ACM-S2など）は水の有無・充填レベルを扱うが、振り音と氷量の対応ラベルを持たない。氷の効果音を少数混ぜても、容器・マイク・動作の違いを学習するだけで、製品精度の根拠にはならない。したがって、`ml/train_shake_ice_amount.py` は `0` / `1--2` / `3以上` の全クラスが manifest に存在し、各クラスが2セッション以上にまたがり、セッションホールドアウト評価が成立しない限り停止する。

## 実装した推論経路

1. AndroidのPCM16 WAVをKotlinのRustブリッジへ渡す。
2. RustがRIFFチャンクを検証し、モノラル化、16 kHzへのリサンプリング、FFT/log-mel特徴量、既存線形softmaxモデルを実行する。
3. `water/fill/iceAmount` を同じJSON契約で返す。
4. `libcoldkeep_ml.so` が未ビルドの開発環境では、アプリが既存TypeScript推論へフォールバックする。

`iceAmountStatus` は、モデル未生成時は `untrained`、`ml/artifacts/shake_ice_amount_pilot.json` の評価ゲートを通ったRustビルド時だけ `trained` になる。氷量artifactは残量artifactとは独立に検証・推論し、残量モデルが未学習でも氷量だけを返せる。ただし、残量の自動記録は引き続き残量モデルが`trained`になるまで行わない。Rust化後も氷量モデルが未検証なら製品判定とは扱わない。

## 受け入れ条件

- `none` / `few` / `many` を同じ容器、同じスマホ、同じ距離、同じ動作で複数回収録する。
- セッション、容器、スマホ単位で評価を分離する。WAVの窓単位のランダム分割はしない。学習スクリプトは容器ホールドアウトを最低限実行し、端末・セッションを変えた外部検証を別途行う。
- 端末マイク・容器を変えた外部検証で、accuracyだけでなく3クラスの再現率と混同行列を確認する。
- 未検証データでは `未判定` を維持し、粗い3段階を強制表示しない。正確な個数・重量は返さない。

## 特徴量研究の追加契約

現行の本番候補は互換性のため `log_mel_summary_v1`（128次元）を維持する。
今回追加した `audio_features.py` のtransient schemaは、衝突イベントの仮説を
検証する研究用の21次元ベクトルである。onset countは跳ね返りを含むため、
氷個数そのものの教師ラベルではない。

ベクトルの順序は次のとおりで、NumPy/TypeScript/Rustで固定する。

`onset_count`, `transients_per_second`, `inter_onset_interval_mean_s`,
`inter_onset_interval_std_s`, `spectral_flux_mean`, `spectral_flux_max`,
`spectral_flux_peak_count`, `spectral_centroid_mean_hz`,
`spectral_centroid_std_hz`, `high_frequency_energy_ratio`,
`spectral_rolloff_mean_hz`, `zero_crossing_rate_mean`,
`zero_crossing_rate_std`, `crest_factor_mean`, `crest_factor_std`,
`rms_mean`, `rms_std`, `rms_max`, `peak_to_rms`,
`transient_decay_mean_s`, `transient_decay_std_s`。

`publicShakeClassifier.ts` とRust bridgeは、学習artifactのsample rate/window/hop/
feature size/schemaが現在のbaselineと一致しない場合、氷量結果を公開しない。
これは古い128次元artifactを新しい特徴量へ誤適用する事故を防ぐ境界である。
`ml/fixtures/audio_features_golden.json` は同じPCM入力をPython/TS/Rustで比較する
fixtureであり、モデル精度を意味しない。

`ml/run_shake_ice_ablation.py` はA/B/C、gain normalization有無、
session/container/device/operator/room/calendar-day holdout、直接3クラス/2段階分類を同一splitで比較する。
直接分類にはbootstrap区間、calibration診断、0.65で棄却した場合のcoverage/性能も記録する。
データが不足する場合は `insufficient_data` とし、production artifactを生成しない。

量モデルのtrainerは、構造上foldを作れるだけでは`trained`に昇格させない。
session/container/device/room/operator/calendar-dayの各leave-one-group-outで実測した
balanced accuracyがすべて0.67以上であることをartifactとpromotion gateで再検証する。
