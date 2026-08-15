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

The app now uses the two evaluated outputs it can support:

- `WATER` / `NON-WATER`, trained from water versus pasta/rice pours.
- `50%` / `90%` fill level, shown only when the first model predicts water.

It deliberately does not display temperature or ice quantity. Recordings
should contain a pouring action comparable to ACM-S2; arbitrary ambient audio,
shaking, and empty containers are outside the current training distribution.

## Shake-level experiment (not a production model)

`train_shake_level.py` is a separate, conservative experiment for the later
`shake` action. It accepts a labelled CSV exported from the app's collection
screen and only trains when empty/half/full recordings exist in at least two
sessions per class. The 10--30% and 70--90% transition bands are rejected
instead of being guessed. Evaluation holds out complete sessions; the report
records container/device coverage. Container- and phone-held-out
generalization is a follow-up gate, not a result claimed by this pilot. No
artifact is written when the dataset is too small.

The checked-in ACM-S2 data contains only two shake recordings (empty and 50%
pasta in one muesli box), so it intentionally cannot produce a trustworthy
three-class shake model. This is an explicit data-collection gate, not a
failed claim of shake support. Until that gate is met, the app's scan action
remains `pour` and shake recordings are collected only for the next dataset.

The same rule applies to `train_ice_presence.py`: it requires at least two
recordings of each binary class across at least two containers and reports a
container-held-out evaluation. It writes no ice artifact when those groups are
missing, so training-set accuracy cannot accidentally become a product claim.

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
