# ColdKeep

[日本語](README.md) | [English](README.en.md)

ColdKeep is an experimental AI prototype that analyzes the sound of shaking a water bottle, recorded with a smartphone microphone, and displays its fill level in three classes: empty, half-full, and full.

The goal is to perform recording, feature extraction, and inference entirely on the device without adding a dedicated sensor to the bottle.

## Scope of the submission build

The current submission build supports this classification contract:

- Fill-level classes from a shaking sound: `0%` / `50%` / `100%`
- The normal build displays `Undetermined` when no trained model is available. A generic experimental estimate for research or demonstrations is available only from a composition root that explicitly sets `EXPO_PUBLIC_ML_PREVIEW=research`; it is not used for automatic hydration logging.
- Below the confidence threshold, or when no shaking-sound artifact is present: `Undetermined`
- Ice quantity from a shaking sound: three classes—`none` / `little` / `many`—only with a trained model. Untrained or low-confidence results are `Undetermined`.

If the fill-level probability is below 0.65, the screen returns to `Undetermined` and prompts the user to retry. Low-confidence results are not used to calculate changes in water intake.

Audio with an RMS below 0.0025 or a peak below 0.02 is rejected for re-recording before it reaches the model. This quality gate prevents normalization from making silence appear highly confident.

ColdKeep does not estimate ice weight, exact ice count, water temperature, or cooling duration. The ice quantity from a shaking sound is shown only as a coarse three-class result (`none` / `little` / `many`) when the trained model’s confidence is at least 0.65. For unvalidated conditions, the result is not forced; errors also return to `Undetermined`.

## Flow

1. Allow microphone access with `SCAN`.
2. Shake the bottle at a steady strength for at least one second and record the sound.
3. On Android, a native Kotlin module creates a 16 kHz, mono, 16-bit PCM WAV file.
4. On Android, try the Rust path if the Rust bridge is available; otherwise fall back to the TypeScript path.
5. Validate the WAV, resample it, extract log-mel features, and estimate the shaking-sound fill class with a linear softmax model.
6. Display the result, confidence, model state, and known limitations.

## Personal hydration tracking

The personal-use screen lets users configure only the bottle capacity. Acoustic scan results are saved on the device as fill-level observations. When the previous and current readings meet the confidence threshold, their difference is automatically added as water intake. Personal acoustic checks also use the sound of shaking the bottle. Only when the model is trained does the app observe one of three fill levels relative to the configured capacity.

This feature does not diagnose or prevent heatstroke. See [HYDRATION.md](HYDRATION.md) for details.

## Input motion and model status

The existing public baseline is a research artifact trained and evaluated using pouring sounds from ACM-S2. The personal-use screen fixes its input motion to `shake`; it does not reuse a pouring model for shaking sounds.

`ml/artifacts/shake_fill_level_pilot.json` is currently `untrained`. The normal build displays `Undetermined`. Only when `EXPO_PUBLIC_ML_PREVIEW=research` is explicitly set for research or a demo does the composition root enable `allowExperimentalPreview` and display a generic low-confidence heuristic as `experimental`. It is not used for automatic hydration logging.

Only a model that has passed a session-held-out evaluation with phone / water-bottle data is marked `trained` and allowed to automatically record fill-level differences.

The data-collection screen is fixed to `shake`. `still` and `pour` remain as internal compatibility labels so that historical CSVs and comparison data are not broken.

## Tech stack

- UI: React Native / TypeScript
- Recording: custom `WavRecorder` module using Android `AudioRecord` (Android is the submission target)
- WAV validation: `audioProcessing.ts` (validates RIFF chunks, PCM16, and mono conversion)
- Features / inference: `publicAudioClassifier.ts` / `publicShakeClassifier.ts` (FFT, log-mel summary, linear softmax)
- Optional native path: Rust `coldkeep_ml` + Kotlin `RustAudioClassifier` bridge
- Data collection: `COLLECT DATA` tab; save labeled WAV, CSV, and JSON sidecar files in the app

### Architecture

A feature-based modular monolith is combined with lightweight Onion / Hexagonal boundaries.

`src/features/scan` and `src/features/collection` contain use cases and domain logic. Recording, inference, persistence, and sharing are adapters under `src/platform`. Rust, TypeScript, and future inference engines can be swapped behind the same `AudioClassifier` contract.

Port composition is centralized in `src/app/compositionRoot.ts`, so the UI does not directly depend on native APIs.

Rust is an execution path intended to improve speed and on-device reproducibility. If the Rust library has not been built, a TypeScript fallback tested against the same input remains available. Using Rust by itself is not evidence of accuracy.

## Evaluation results and interpretation

Container-separated evaluations for ACM-S2 are saved in `ml/artifacts/baseline_metrics.json`.

| Task | Correct | Accuracy | Note |
|---|---:|---:|---|
| Water presence | 18 / 18 | 100.0% | External validation at a scale of 21 recordings; not a guarantee for unseen bottles |
| Fill level when water is present | 5 / 6 | 83.3% | Two coarse classes: `50%` / `90%` |
| Contents classification | 16 / 18 | 88.9% | Supplementary evaluation, not the primary judgment shown in the submission UI |

The sample size is small, so these results are not advertised as product accuracy or generalization performance. Evaluation materials include the data split, confusion matrix, failure cases, and recording conditions.

## Data collection

In `COLLECT DATA`, record audio with measured water volume, ice count, ice mass, temperature, container, device, distance, and motion.

See [DATA_COLLECTION.md](DATA_COLLECTION.md) for details. The shaking-sound ice model maps measured `ice_count` to three classes: `0`, `1--2`, and `3+`. Training does not begin until all classes and sessions are represented. The app does not display an exact ice count as an inference result.

## Local verification

```powershell
npm ci
npx tsc --noEmit
npx eslint App.tsx
npm test -- --runInBand

powershell -ExecutionPolicy Bypass -File .\scripts\verify-submission.ps1 -SkipAndroid
```

### Android native check

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-preview.ps1
```

The script does not use production keys. It creates a temporary signing key only at runtime and copies the JS-bundled Preview APK to `output/ColdKeep-u22-current-preview.apk`. To call Gradle directly, set the `COLDKEEP_PREVIEW_*` environment variables.

For device checks, connect an Android device with USB debugging enabled and install the generated Preview APK. Use the same flow to check microphone permission, recording, analysis, silence re-recording, and retries.

Install, launch, capture a screenshot, and save recent logs from a connected device with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -ResetApp
```

### Check with Expo Go

For recording checks on real devices, including iPhone, use the separate `expo-go/` companion. A Mac or paid EAS registration is not required.

```powershell
cd expo-go
npm install
npx expo start
```

To launch the research demo, run this from the repository root:

```powershell
npm run start:demo
```

The demo shows only a “trial estimate” from a generic research model and does not use it for automatic hydration logging. Regular `npm start`, debug, and production builds continue to show `Undetermined` when the model is untrained.

See [EXPO_GO.md](EXPO_GO.md) for detailed limitations, the PCM path, and iOS / Android export checks.

## Known limitations

- Results vary with the recording environment, bottle material, microphone distance, shaking strength, and ambient noise.
- The current public validation data does not contain paired ice-quantity labels from shaking water bottles. Ice quantity remains `Undetermined` until the collected data passes the evaluation gate.
- A Rust `.so` may not be generated in every development environment, so the TypeScript fallback is retained.
- A submission is not considered complete without evidence of recording and inference on a physical Android device.

## U-22 submission

The submission build’s scope, deadlines, and required evidence are fixed in [U22_SUBMISSION_PLAN.md](U22_SUBMISSION_PLAN.md). Submit the ProtoPedia limited-sharing page, an explanation video no longer than three minutes, the complete source, run instructions, evaluation results, and limitation notes frozen under the same version number.

## VORN Challenge submission

If VORN Challenge is the primary target, prepare a submission that connects AI, a social issue, and new market value. Follow the [official VORN Challenge call](https://vorn-challenge.com/) and Google Form for the exact fields, character limits, and file formats.

- [VORN_SUBMISSION_PLAN.md](VORN_SUBMISSION_PLAN.md): official requirements, deliverables, demo procedure, and acceptance criteria
- [VORN_APPLICATION_DRAFT.md](VORN_APPLICATION_DRAFT.md): application-form draft
- [VORN_VIDEO_SCRIPT.md](VORN_VIDEO_SCRIPT.md): demo video script
- [VORN_ARCHITECTURE.md](VORN_ARCHITECTURE.md): technical architecture and how it maps to VORN judging criteria
- [VORN_SUBMISSION_README.md](VORN_SUBMISSION_README.md): files to include and exclude in the submission package

The main VORN claim for ColdKeep is “acoustic AI that visualizes bottle fill level and water intake by shaking the bottle.” Do not claim exact milliliters, temperature, ice weight, or heatstroke diagnosis or prevention. Explain the safety design that falls back to `Undetermined` when confidence is low or the model is untrained. In a submission build using a trained model, hydration can be logged automatically after configuring bottle capacity.
