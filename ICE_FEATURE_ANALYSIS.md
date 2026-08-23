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

It evaluates session-, container-, device-, room-, and operator-held-out groups, plus
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

The checked-in reproduction of that gate is
[`ml/reports/shake_ice_ablation.json`](ml/reports/shake_ice_ablation.json);
it records `status=insufficient_data` because the legacy manifest has no
measured shake schema.

### External descriptive-audio feature probe (not an amount experiment)

For feature-development only, the shared transient extractor was run on seven
public clips whose descriptions mention one, two, or three cubes. The clips
were decoded to mono 16 kHz before the normal 1-second windows were created.
The claimed counts below are provenance metadata, **not ColdKeep labels**.

| clip | claimed count | windows | mean onset count | mean spectral flux | mean centroid (Hz) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Freesound #555043 (one cube falling) | 1 | 3 | 4.67 | 0.0570 | 1,515 |
| Freesound #682741 (one cube, soft) | 1 | 5 | 4.60 | 0.0872 | 1,064 |
| Freesound #784069 (three cubes, mic in glass) | 3 | 85 | 4.45 | 0.0745 | 3,137 |
| BigSoundBank #2124 | 3 | 1 | 4.00 | 0.0432 | 1,226 |
| BigSoundBank #2125 | 3 | 1 | 2.00 | 0.0471 | 1,423 |
| BigSoundBank #2128 | 3 | 1 | 5.00 | 0.0541 | 1,729 |
| SoundBible `ice_cubes_glass_2182.wav` | 2 | 3 | 5.33 | 0.0820 | 2,369 |

This small probe is intentionally not an accuracy result. It demonstrates two
important failure modes: the two-cube clip has more detected onsets than every
three-cube BigSoundBank take except #2128, and three recordings all described
as three cubes vary from 2 to 5 onsets per second. Studio microphone,
container, action (drop versus shake), duration, and room dominate these
statistics. A model trained on these files would learn source/action identity,
not ColdKeep ice amount.

All seven vectors were finite and used the same 21-feature order as Rust and
TypeScript. Their SHA256 values and source/license records are in
[`ICE_AUDIO_RESEARCH.md`](ICE_AUDIO_RESEARCH.md). The probe therefore validates
feature extraction and the shortcut warning only; it does not change
`shake_ice_amount_pilot.json` and cannot satisfy the ColdKeep deployment gate.

The reproducible command was also run against the checked-out
`dataset/external/ice-references/manifest.csv` using the optional `miniaudio`
decoder. It produced 17 finite feature records and 5 decoder diagnostics (the
five Google OGG previews were not decodable by that optional backend). The
report remained `status=research_only`, with `model=null`,
`labelsUsedForTraining=false`, and `productionArtifactUpdated=false`. Decoder
failures are intentionally recorded as diagnostics rather than treated as
negative or amount labels.

This is an intentional `insufficient_data` result, not a zero or fabricated
accuracy. The old session-held-out BA gate of 0.67 remains the minimum public
contract, but a model also needs complete container/device/room/operator holdouts, no
duplicate-audio label conflicts, and acceptable per-class recall before it can
move from research to `trained`.

### Synthetic physics sanity check (research-only)

Because no measured ColdKeep recordings are available, the feature hypothesis
was also tested with `ml/run_synthetic_shake_ice_experiment.py`. It generates
two-second mono signals from exact synthetic counts 0--5 using damped collision
responses, matched class-independent background/rattle/gain realizations, and
independent container/device/room response factors. The labels are generated parameters,
not external audio annotations. The run used 216 recordings, three groups per
holdout factor, two repetitions, and 350 optimizer epochs:

| features | normalization | session BA | container BA | device BA | room BA |
| --- | --- | ---: | ---: | ---: | ---: |
| log-mel | gain-normalized | 0.568 | 0.486 | 0.562 | 0.559 |
| log-mel | raw | 0.549 | 0.508 | 0.548 | 0.552 |
| transient | gain-normalized | 0.568 | 0.557 | 0.545 | 0.562 |
| transient | raw | 0.588 | 0.542 | 0.509 | 0.560 |
| log-mel + transient | gain-normalized | 0.566 | 0.511 | 0.566 | 0.537 |
| log-mel + transient | raw | 0.573 | 0.494 | 0.549 | 0.549 |

No synthetic configuration reached the 0.67 deployability gate. That is a
useful negative result: even a controlled collision-density hypothesis is
fragile once nuisance response and missed/bounced impacts are introduced. It
does not prove that real bottles are impossible to classify, and it must not be
reported as ColdKeep accuracy. The complete reproducible output is
[`ml/reports/synthetic_shake_ice_experiment.json`](ml/reports/synthetic_shake_ice_experiment.json).
The report is marked `research_only`, records
`labelsUsedForProductionTraining=false`, and does not alter the production
artifact.

## Shortcut and leakage audit

`ml/audit_shake_dataset.py` computes SHA256 for every audio file, detects the
same bytes under multiple recording IDs, records class coverage by session,
container, device, room, operator, and timestamp, and enumerates valid/invalid group folds.
Review these warnings before looking at accuracy. In particular, a model that
loses performance when RMS normalisation is removed, or whose
container/device/room/operator holdout collapses while session holdout is high,
is likely learning energy, bottle, phone, operator, or room identity rather than
ice amount.

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
