# ColdKeep audio baseline

This directory contains a dependency-light, reproducible machine-learning
baseline. It uses only NumPy and the locally downloaded ACM-S2 data.

Run training and held-out evaluation from the repository root:

```powershell
python ml\train_baseline.py
python -m unittest discover -s ml -p "test_*.py"
```

Python 3.10 or newer and NumPy are required. Codex desktop users can use the
bundled Python path returned by the workspace-dependencies command if Python is
not on `PATH`.

The evaluator holds out an entire container at a time. Audio windows from the
same source recording therefore never appear in both training and test data.
Window probabilities are averaged before scoring each recording.

Two deliberately narrow tasks are evaluated:

- `fill_level_water`: distinguish 50% from 90% for water pours.
- `water_presence`: distinguish water pours from pasta/rice pours.
- `content_type`: distinguish pasta, rice, and water pours. Muesli-box shaking
  recordings are excluded so action type cannot become a label shortcut.

The NumPy archives preserve training artifacts. `public_audio_baseline.json`
contains the same standardized linear models in an app-readable format. This
allows honest prototype inference without pretending that the tiny ACM-S2
training set is a production-ready TFLite model.

The checked-in pour artifact supports the two evaluated research outputs:

- `WATER` / `NON-WATER`, trained from water versus pasta/rice pours.
- `50%` / `90%` fill level, shown only when the first model predicts water.

It deliberately does not display temperature or ice quantity. The product
screen uses the separate shake contract described below; the pour artifact is
not applied to shake recordings.

## Shake-level product path (artifact-gated)

`train_shake_level.py` is a separate, conservative experiment for the later
`shake` action. It accepts a labelled CSV exported from the app's collection
screen and only trains when empty/half/full recordings exist in at least two
sessions per class. The 10--30% and 70--90% transition bands are rejected
instead of being guessed. Malformed rows, non-`coldkeep_measured` labels,
duplicate audio SHA256 values, missing timezone-aware timestamps, and invalid
WAV files block training. Evaluation holds out complete sessions and reports
container/device folds; a `trained` artifact additionally requires all three
physical holdouts and at least two calendar days per class. Otherwise the
artifact is explicitly `experimental` and must not feed hydration math.

The checked-in ACM-S2 data contains only two shake recordings (empty and 50%
pasta in one muesli box), so it cannot produce a trustworthy three-class shake
model. The checked-in `ml/artifacts/shake_fill_level_pilot.json` is `untrained`;
the production scan returns `未判定` until phone/water-bottle validation passes.
The energy-profile preview is available only through an explicit test/demo
opt-in and never feeds hydration math. Replace it only with the output of
`train_shake_level.py` after validation passes. The separate ice-amount artifact
remains `untrained`.

For public CORSMAL feature research, `import_corsmal_shake.py` converts only an
explicit list of known shake IDs and marks every row `external_unlabeled`.
Those rows have no `ice_count` and are rejected by the supervised trainer. The
action list is required because the official annotation table does not encode
ColdKeep's action label:

```powershell
python ml/import_corsmal_shake.py `
  --data-root <CCM train root> `
  --annotations <ccm_train_annotation.csv> `
  --shake-ids <shake_ids.txt> `
  --output <work>\corsmal-shake-manifest.csv
```

This importer does not copy the 2.8 GB archive or invent phone labels. Its
default session is deliberately a single `corsmal-train` group, so the
session-held-out trainer remains blocked until a real session map and a
phone/water-bottle validation set are supplied.

## Minimum shake model (action gate)

`train_shake_action.py` is the first reproducible fitted model for the shake
path. It trains a small 128-feature linear classifier on the 21 available
ACM-S2 recordings: 2 explicit `shake` recordings and 19 `pour` recordings.
The action mapping is stored in
`dataset/derived/acm-s2-shake-action/action_labels.csv`; it is not guessed from
audio filenames. Run:

```powershell
python ml/train_shake_action.py
```

The resulting `ml/artifacts/shake_action_pilot.json` contains the fitted model
and recording-held-out metrics. Its status is deliberately `experimental`:
both shake examples are the same muesli-box setup, so this is an action-gate
pilot, not evidence of water-bottle fill-level or mL accuracy. It must not be
used to convert a recording into hydration data. The existing
`shake_fill_level_pilot.json` therefore remains `untrained` until measured
phone/water-bottle recordings cover empty/half/full in independent sessions.

### Expanded shake pre-training comparison

To push the action gate beyond the two local shake examples, the optional
`import_mml_shake.py` importer can read the open EPFL Multimodal Sensory
Learning archive (Zenodo record 6372438). It selects a fixed number of trials
per material/motion condition, decodes the embedded 16 kHz microphone stream,
and writes only derived features. The raw ROS bags are not copied into this
repository. Install the optional dependencies first:

```powershell
python -m pip install -r ml\requirements-external-shake.txt
python ml\import_mml_shake.py `
  --per-condition 5 `
  --partial-archive <optional-partial-download> `
  --output <work>\mml_shake_features.npz
python ml\train_shake_action_augmented.py `
  --external-features <work>\mml_shake_features.npz
```

`train_shake_action_augmented.py` uses the 19 ACM-S2 pours as local negative
examples and the external robot-shake bags as positive pre-training examples.
It uses the 21 interpretable transient descriptors rather than the original
log-mel summary, and gives the target-domain ACM-S2 examples four times the
total weight of the external positives. On the checked run (50 external bags,
150 windows), recording-held-out ACM-S2 results were accuracy `0.905`,
balanced accuracy `0.947`, macro-F1 `0.806`, and shake recall `1.000` (17/19
pour recordings correct; 2 false-positive shake calls). These numbers are a
research comparison only: the external microphone is attached to a robot and
the container is plastic, while ColdKeep must eventually validate on phone
microphones and insulated water bottles. The artifact remains
`experimental`, and `shake_fill_level_pilot.json` remains `untrained`. The
Zenodo record does not state a redistributable license, so do not commit the
raw archive or share the derived cache/weights until its terms are checked.

## Shake ice amount pilot

`train_shake_ice_amount.py` uses the exact `ice_count` field only as collection
ground truth, then maps it to `none` (0), `few` (1--2), or `many` (3+). It
requires at least two recordings of every band across at least two sessions and
reports session-held-out metrics. The artifact remains `experimental` below
the balanced-accuracy gate and is not exposed by the UI as a trained result.
Exact cube counts and ice mass are never inferred.

The older `train_ice_presence.py` binary task remains available for the legacy
pour contract, but its artifact is not applied to the shake product path.

## Shake ice research harness

`audit_shake_dataset.py` checks the exported ColdKeep manifest for duplicate
audio hashes, label conflicts, class/group confounds, valid
session/container/device/room/operator holdouts, and at least two valid recording days per
class. `run_shake_ice_ablation.py` compares three
feature sets on exactly those recording-level folds:

- A: the current 128-dimensional log-mel summary;
- B: 21 interpretable onset/transient descriptors;
- C: A + B.

Both gain-normalised and raw waveform variants are reported. The script also
reports direct three-class and experimental two-stage (`ice/no-ice` then
`few/many`) results. It never consumes external effect sounds as count labels
and never writes a production artifact. With no exported ColdKeep recordings,
the correct result is `status=insufficient_data`.

For transient-only inspection, the checked-in
`dataset/external/ice-shake-references/manifest.csv` contains ten CC0
Freesound shake-like previews. Run the guarded probe with an optional
`miniaudio` research install:

```powershell
python ml/probe_external_ice_audio.py `
  --manifest dataset/external/ice-shake-references/manifest.csv `
  --audio-root dataset/external/ice-shake-references `
  --output ml/reports/ice_shake_reference_probe.json
```

The probe requires `production_label_eligible=false` on every external row,
records decoder/feature diagnostics, and always emits `status=research_only`.
These previews are not amount labels or ColdKeep accuracy evidence.

The shared transient schema is implemented in NumPy, TypeScript, and Rust and
is covered by `ml/fixtures/audio_features_golden.json`. The fixture is a
deterministic PCM impulse vector used to detect runtime drift, not to claim
model accuracy. Rust parity still needs to be run on a machine with Cargo and
the Android/Rust toolchain available.

### Synthetic feature sanity check (never production training)

When a measured ColdKeep corpus is absent, run the physics-inspired research
experiment to test the feature hypothesis without assigning labels to public
effect sounds:

```powershell
python ml/run_synthetic_shake_ice_experiment.py `
  --output ml/reports/synthetic_shake_ice_experiment.json `
  --research-artifact ml/artifacts/research_synthetic_shake_ice_amount.json `
  --groups 3 `
  --repetitions 2 `
  --epochs 350
```

The generator uses exact synthetic counts and nuisance factors only to test
whether collision-density features are learnable in principle. Its output is
`status=research_only`; it never updates
`ml/artifacts/shake_ice_amount_pilot.json`, and its scores are not evidence for
phone/water-bottle generalization. The optional research artifact uses a
separate 149-feature schema and is never
loaded by the app. The checked-in report is intentionally negative (all
holdout balanced accuracies are below 0.67), so the honest next step remains
measured ColdKeep collection.

## Public shake-data candidate

The official [CORSMAL data catalogue](https://corsmal.github.io/data.html) and
[CCM documentation](https://corsmal.github.io/containers_manip.html) list the
larger CORSMAL Containers Manipulation (CCM) dataset: 1,140 recordings from 15
containers, three filling levels, and three filling types. The training split
has nine containers and its audio archive is about 2.8 GB; recordings use a
44.1 kHz, eight-microphone circular array. The dataset is licensed
CC BY-NC 4.0, so it also needs a separate non-commercial-use review before
redistribution. Shaking is performed with filled food boxes, not insulated
water bottles, so CCM is useful for a research pre-training comparison but is
not automatically a ColdKeep phone model. The official
[ACC implementation](https://github.com/CORSMAL/ACC) also keeps action-specific
shaking and pouring models separate.

We do not silently download or include CCM in this repository: it is large,
its microphone geometry differs from a phone, and the CCM test split must not
be used for training. If it is added later, only the annotated training split
will be converted into the manifest format above, with container/session
holdouts and a separate phone-recorded validation set.

### Promotion gate

Training never implicitly makes a model production-ready. After a measured
ColdKeep run produces a candidate with `status=trained`, promote it through
the same gate used by release automation:

```powershell
python ml/promote_shake_artifacts.py `
  --manifest C:\path\to\coldkeep-dataset\manifest.csv `
  --fill-candidate C:\tmp\shake_fill_level.json `
  --ice-candidate C:\tmp\shake_ice_amount.json
```

Promotion requires the exact manifest used for training. The trainer records
its SHA256 in the candidate and the promotion command verifies that hash,
alongside measured-label provenance, complete session/container/device/room/operator and
temporal holdouts, the shared feature schema, internally consistent confusion
metrics, a valid model tensor shape, and balanced accuracy of at least `0.67`.
All candidates are validated before either target is written, and each target
is replaced atomically. An `untrained` or `experimental` candidate is rejected
and the checked-in artifact is left untouched. With the current repository data
the command is expected to reject because the production candidates are still
untrained; that is a data-availability result, not a model score.
