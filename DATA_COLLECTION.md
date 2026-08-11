# ColdKeep data collection

Use the **COLLECT DATA** tab to record WAV files together with measured ground
truth. Do not enter estimates: water amount, ice mass, and temperature must be
measured before each recording.

## Recommended first experiment

- One container and one phone
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

**EXPORT LABEL CSV** shares the text contents of `manifest.csv`; it does not
include WAV files. Use Android Studio Device Explorer to copy the complete
`coldkeep-dataset` directory from the application's `files` directory before
clearing app data or uninstalling the app.

## Recording protocol

1. Measure and enter every label.
2. Select exactly one action: pour, shake, or still.
3. Start recording, wait briefly, perform the action consistently, then stop.
4. Confirm that the status begins with `Saved`.
5. Change only the intended experimental condition before the next recording.

Never randomly split windows from one WAV across training and evaluation. Hold
out complete sessions, containers, and phones to measure real generalization.

The current `SCAN` baseline accepts only `pour`: ACM-S2 water recordings use a
pouring action. `shake` and `still` are retained here as experimental collection
labels, but they are out of distribution for the current scan model and must not
be presented as evaluated scan inputs.

## Ice binary model

The app records both `ice_count` and `ice_mass_g` as ground truth. The model
target is deliberately only `ice_presence = (ice_count > 0)`, so the inference
result is `PRESENT` or `ABSENT`; it does not estimate grams. The current public
audio corpus contains no paired ice/no-ice labels, so the scan screen remains
`UNKNOWN` until enough collected samples exist.

After copying the complete `coldkeep-dataset` directory to a training machine,
run:

```powershell
python ml/train_ice_presence.py `
  --manifest <path>\coldkeep-dataset\manifest.csv `
  --audio-root <path>\coldkeep-dataset
```

The command refuses to train when either class is missing. It writes
`ml/artifacts/ice_presence_baseline.json`; rebuilding the Rust library then
embeds that artifact automatically. Treat the first model as a baseline and
evaluate on a held-out container and phone before relying on it.
