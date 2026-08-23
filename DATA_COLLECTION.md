# ColdKeep data collection

Use the **COLLECT DATA** tab to record WAV files together with measured ground
truth. Do not enter estimates: water amount, ice mass, and temperature must be
measured before each recording.

## Recommended first experiment

- One container and one phone
- Enter a stable, operator-chosen device ID (for example `pixel7-lab-a`);
  never use only a platform name such as `android` or `ios`.
- Enter stable `room_id` and `operator_id` values as well. These are required
  holdout keys, not optional UI decoration: without them, room or operator can
  become an accidental proxy for the ice label.
- Water: 25%, 50%, and 75% of capacity
- Ice: 0 g, 50 g, and 100 g
- Temperature: 5 °C, 20 °C, and 50 °C
- Ten repetitions of every combination
- Keep microphone distance and action protocol fixed

This produces 270 recordings. Use a new session ID after changing the day,
room, phone, microphone position, or operator.

## Saved layout

The app stores data under its private document directory:

```text
coldkeep-dataset/
├── manifest.csv
├── audio/
│   └── <recording-id>.wav
└── metadata/
    └── <recording-id>.json
```

Every WAV is validated as PCM16 and must be at least one second long before it
is accepted. The JSON sidecar makes an individual recording recoverable even
if updating the combined CSV is interrupted.

**EXPORT DATASET** creates a ZIP containing `manifest.csv`, each metadata JSON
sidecar, and the corresponding WAV files. This keeps the audio-label
relationship intact when the archive is copied to a training/evaluation
environment. Use Android Studio Device Explorer to copy the complete
`coldkeep-dataset` directory from the application's `files` directory before
clearing app data or uninstalling the app.

## Recording protocol

1. Measure and enter every label.
2. The app's current collection flow records exactly one action: `shake`.
   Legacy `pour` and `still` rows remain valid for imported/comparison data,
   but are not selectable in the product collection screen.
3. Start recording, wait briefly, perform the action consistently, then stop.
4. Confirm that the status begins with `Saved`.
5. Change only the intended experimental condition before the next recording.

Never randomly split windows from one WAV across training and evaluation. Hold
out complete sessions, containers, and phones to measure real generalization.

The current `SCAN` contract requests `shake`. The checked-in shake artifact is
still `untrained`, so the app returns `未判定` until phone/water-bottle data has
passed the gate below. The older ACM-S2 `pour` model remains a research
baseline and is never reused for shake input. `still` remains a comparison
label.

## Shake fill-level pilot

The `shake` action is the product path. To activate fill-level inference from
shaking, collect the following
three broad classes:

- `empty`: 0% of the measured capacity
- `half`: 30--70% (use 50% for the first pilot)
- `full`: 90--100% (use 90% for the first pilot)

Collect at least two recordings per class in at least two independent session
IDs. Change the session when the day, room, phone, microphone position, or
operator changes. Do not label 10--30% or 70--90% as a class; the trainer
rejects those transition bands instead of inventing a precise level. The first
usable pilot therefore needs at least six shake recordings, although a useful
phone/container study should collect many more repetitions and hold out a
whole container and phone for validation.

After copying the complete `coldkeep-dataset` directory, run the dedicated
pilot trainer:

```powershell
python ml/train_shake_level.py `
  --manifest <path>\coldkeep-dataset\manifest.csv `
  --audio-root <path>\coldkeep-dataset `
  --output ml/artifacts/shake_fill_level_pilot.json
```

The command performs session-held-out evaluation and refuses to write a model
when a class or session is missing. It reports container and device coverage,
but does not claim container- or phone-held-out generalization yet. Until this
gate passes on phone-recorded water-bottle data, the production scan must
request a `shake` recording and will not silently treat it as a pour. Replace
the checked-in manifest-only artifact only after the report has been reviewed
and the phone/water-bottle domain gap is addressed.

## Shake ice amount pilot

The app records both `ice_count` and `ice_mass_g` as ground truth. For the
same `shake` recording used by the fill model, the public target is deliberately
coarse:

- `none`: `ice_count = 0`
- `few`: `ice_count = 1--2`
- `many`: `ice_count >= 3`

The app never claims an exact cube count or ice mass. Collect at least two
recordings in at least two independent sessions for every band; vary bottles,
phones, rooms, and operators before treating the result as a product model.
The checked-in artifact is manifest-only and the scan screen remains
`未判定` until the scored session/container/device/room/operator holdout gate
passes.

Every supervised row must carry `label_source=coldkeep_measured`. External
CORSMAL/Freesound rows use `label_source=external_unlabeled` and leave
`ice_count`/`ice_mass_g` blank; the shake-ice trainer rejects them rather than
inventing a `none` label.

After copying the complete `coldkeep-dataset` directory to a training machine,
run:

```powershell
python ml/train_shake_ice_amount.py `
  --manifest <path>\coldkeep-dataset\manifest.csv `
  --audio-root <path>\coldkeep-dataset `
  --output ml/artifacts/shake_ice_amount_pilot.json
```

The command refuses to train when a band is missing, when a band has fewer than
two recordings, when a band appears in fewer than two sessions, when manifest
rows are malformed/unlabeled, or when audio is duplicated. A `trained` artifact
also requires every session/container/device/room/operator fold to contain all
classes and at least two valid calendar days per class. This prevents a class
recorded on a single day or by one operator in one room from becoming a
shortcut. Until those gates pass, only an `experimental` result is written and
the product scan remains untrained.

## Ice-count matrix for generalisation

The pilot above is only a gate. The production evidence set must retain the
measured integer count and must not infer a count from an effect sound. Use the
following balanced matrix before running the ablation harness:

| factor | controlled baseline | robustness expansion |
| --- | --- | --- |
| `ice_count` | 0, 1, 2, 3, 4, 5 cubes | repeat the same six counts |
| water level | 25%, 50%, 75% of capacity | repeat at all three levels |
| container | one bottle | at least two unseen bottles for holdout |
| phone | one phone | at least one unseen phone for holdout |
| distance | fixed measured distance | a separately labelled distance study |
| action | fixed shake cadence, direction, duration | a separately labelled operator study |

A practical first block is 10 repetitions for every count × water-level
combination (180 recordings) with one bottle, one phone, one room, and one
operator. Do not put all `many` rows on a different day. Then add independent
sessions covering a different day, room, bottle, phone, and operator. Every
class must occur in every group that is intended to be held out.

The public target remains `none` (0), `few` (1--2), and `many` (3+). Keep the
integer `ice_count` in the manifest for auditing, but never use the number of
onsets in an external effect sound as a substitute label. External sounds can
only be marked `ice_present`, used to inspect an onset detector, or mixed as a
documented augmentation; they are excluded from the `none/few/many` trainer.

Before fitting, run the two research-only checks:

```powershell
python ml/audit_shake_dataset.py `
  --manifest <path>\coldkeep-dataset\manifest.csv `
  --audio-root <path>\coldkeep-dataset `
  --output ml/reports/shake_dataset_audit.json

python ml/run_shake_ice_ablation.py `
  --manifest <path>\coldkeep-dataset\manifest.csv `
  --audio-root <path>\coldkeep-dataset `
  --output ml/reports/shake_ice_ablation.json
```

The ablation report evaluates the same recordings under session-, container-,
device-, room-, and operator-held-out folds, with and without gain
normalisation. It does not write a model artifact. Only after the report has
been reviewed and the balanced-accuracy/recall/shortcut gates pass for all
five holdout groups may the existing trainer be run to produce a `trained`
artifact.
