# ColdKeep ML evidence ledger

This file is the claim boundary for the shake-audio ice-amount experiment. It is
intentionally conservative: a research score is not a phone/water-bottle
product score, and a model is not promoted because it looks good on one split.

## Current truth

- The checked-in `ml/artifacts/shake_ice_amount_pilot.json` is `untrained` and
  has no production model.
- `ml/reports/shake_ice_ablation.json` is `insufficient_data` because this
  checkout does not contain an exported ColdKeep measured-shake manifest with
  the required schema.
- No `none/few/many` production accuracy is claimed.
- External effects, CORSMAL, synthetic waveforms, and copied ice events are
  research-only. They can test feature behavior or hard negatives, but they
  cannot supply ColdKeep ice-count labels.

The existing research-only runs are useful negative/feasibility evidence, not
product evidence. The transient synthetic run reaches 0.674 session balanced
accuracy but remains below the 0.67 gate on several physical holdouts. The
external single-event mixture run reaches at most 0.449 balanced accuracy. These
results do not justify a trained artifact.

## Evidence now emitted by the harness

`ml/train_shake_ice_amount.py` and `ml/run_shake_ice_ablation.py` evaluate at the
recording level. Overlapping windows from one recording never cross a fold.
The reports now include:

- session, container, device, room, operator, and calendar-day leave-one-group-
  out results;
- accuracy, balanced accuracy, macro F1, per-class recall/precision, and the
  confusion matrix;
- deterministic bootstrap intervals for balanced accuracy and macro F1;
- Brier score and expected calibration error as descriptive diagnostics;
- coverage and retained performance when low-confidence predictions are
  rejected at 0.55, 0.65, and 0.75.

The 0.65 row corresponds to the app's existing `未判定` boundary. Coverage is
not accuracy: a model that abstains on most recordings is not deployable, but a
model with poor retained performance must not be presented as reliable either.
Softmax confidence is not a medical probability.

## Promotion gate

A measured artifact can become `trained` only when all of the following hold:

1. every label is `label_source=coldkeep_measured` and contains measured
   `ice_count` ground truth;
2. duplicate audio, conflicting hashes, malformed WAVs, and manifest errors are
   absent;
3. every `none`, `few`, and `many` class appears in at least two sessions and
   on at least two calendar days;
4. session, container, device, room, operator, and calendar-day holdouts all
   have complete train/test class coverage;
5. balanced accuracy is at least 0.67 on every required holdout;
6. the report is reproduced from the same manifest SHA-256 by the promotion
   validator.
7. every required holdout carries bootstrap, calibration, and 0.65 selective
   evidence; a score-only hand-edited report is rejected.

Until all gates pass, the product keeps the explicit `untrained`/`未判定`
result and does not convert the estimate into hydration or temperature math.

## Data needed to make the claim stronger

The first controlled block should contain 10 repetitions for each of:

- exact ice count 0, 1, 2, 3, 4, 5;
- water level 25%, 50%, 75%;
- one bottle, one phone, one room, one operator, fixed distance and shake
  cadence.

That is 180 measured recordings. Then collect independent sessions on another
day, room, bottle, phone, and operator. Every class must appear in each group
that will be held out. The model should be promoted only after the resulting
report shows both strong retained performance at the 0.65 threshold and no
large collapse from session to physical/calendar-day holdouts.

## What can be shown in a demo now

The demo may show the end-to-end measurement UI, the feature explanation, the
research-only preview behind an explicit opt-in, and the `未判定` fallback. It
must label the result as experimental and must not say that the model has
validated unknown phones, bottles, rooms, or users.