# ColdKeep ice-feature analysis

## Current baseline

`ml/audio_features.py::extract_features` creates one 16 kHz, one-second
window, mean-centres it, scales the RMS to 0.05, clips to `[-1, 1]`, and
computes 32 area-normalised mel bands from 25 ms Hann frames / 10 ms hop. It
returns:

1. 32 log-mel means;
2. 32 log-mel standard deviations;
3. 32 first-difference means;
4. 32 first-difference standard deviations.

The result is 128 dimensions. Gain normalisation is useful for phone-distance
variation, but it also removes absolute energy that could reveal a recording
shortcut. That is why the new harness runs both normalised and raw variants.

The summary is deliberately conservative but loses the temporal arrangement of
collisions. A single cube can bounce several times, and several cubes can hit
at once; therefore an onset count is an explanatory feature, never a count
label.

## Candidate features and hypotheses

| feature | hypothesis | main confound / guard |
| --- | --- | --- |
| onset count, transients/s | more collision events may increase with available ice | bounce rate and shake strength; validate by exact count and held-out operator |
| inter-onset mean/std | many cubes may create denser/less regular impacts | cadence and duration; keep duration fixed |
| spectral flux mean/max/peak count | impacts change spectral shape abruptly | cap/keys/metal rattles; include hard negatives |
| centroid mean/std, rolloff | hard ice/container collisions can shift high-frequency energy | bottle material and microphone response |
| high-frequency ratio | brittle clicks may contain more high-frequency energy | phone EQ, distance, room reflections |
| zero-crossing rate | transient/noise character may differ by collision | broadband environmental noise |
| crest and peak/RMS | isolated impacts create peaks over local energy | gain/compressor and hand movement |
| RMS envelope mean/std/max | event density and decay affect the envelope | shake force and water level |
| transient decay mean/std | container/ice collisions ring down differently | bottle geometry and room reverberation |

The implementation is a dependency-light 21-dimensional vector in a fixed
order documented in [`RUST_ICE_ANALYSIS.md`](RUST_ICE_ANALYSIS.md). It uses
elementary FFT, magnitude-flux, percentile rolloff, zero-crossing, and frame
envelope operations so Rust and TypeScript can reproduce it.

## Ablation design

`ml/run_shake_ice_ablation.py` compares the following without writing an
artifact:

| ID | vector | size |
| --- | --- | ---: |
| A | current log-mel summary | 128 |
| B | transient/onset descriptors | 21 |
| C | A concatenated with B | 149 |

All candidates use the same recording-level fold list and equal total weight
per recording (overlapping windows are never split across a fold). Each result
contains accuracy, balanced accuracy, macro F1, class recall/precision, and a
confusion matrix. The report also compares direct 3-class classification with
the experimental two-stage `ice/no-ice` → `few/many` design.

The required command is:

```powershell
python ml/run_shake_ice_ablation.py `
  --manifest <exported-manifest.csv> `
  --audio-root <dataset-root> `
  --output ml/reports/shake_ice_ablation.json
```

It evaluates session-, container-, and device-held-out groups, plus
gain-normalised and raw waveform variants. A fold is not silently filled in:
if its train or test side lacks a class, it is reported as skipped. The audit
script reports the same issue before fitting.

## Current results

There is currently no exported `coldkeep-dataset` in this checkout and the
checked-in amount artifact is `untrained`. Consequently:

- no A/B/C score exists;
- no two-stage score exists;
- no shortcut conclusion can be drawn;
- no production model is generated.

This is an intentional `insufficient_data` result, not a zero or fabricated
accuracy. The old session-held-out BA gate of 0.67 remains the minimum public
contract, but a model also needs complete container/device holdouts, no
duplicate-audio label conflicts, and acceptable per-class recall before it can
move from research to `trained`.

## Shortcut and leakage audit

`ml/audit_shake_dataset.py` computes SHA256 for every audio file, detects the
same bytes under multiple recording IDs, records class coverage by session,
container, device, and timestamp, and enumerates valid/invalid group folds.
Review these warnings before looking at accuracy. In particular, a model that
loses performance when RMS normalisation is removed, or whose container/device
holdout collapses while session holdout is high, is likely learning energy,
bottle, phone, or room identity rather than ice amount.

The collection protocol therefore keeps all six measured counts across each
baseline water level and repeats them across independent sessions before any
artifact gate is considered. The training gate also requires every group fold
to be complete and at least two valid recording days for each class, so a
single-day `many` collection cannot masquerade as an acoustic effect.

## Runtime parity

The current log-mel feature and the 21 transient scalars have implementations
in NumPy, TypeScript, and Rust. `ml/fixtures/audio_features_golden.json` and
the Python/Jest/Rust tests use the same deterministic PCM impulse fixture.
The TypeScript and Python tests pass in this checkout; Cargo is not installed
in this Windows environment, so Rust execution remains a required CI/device
step rather than an unreported claim.
