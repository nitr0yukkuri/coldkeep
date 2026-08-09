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
