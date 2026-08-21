# ColdKeep Rust inference core

This crate mirrors the existing 16 kHz PCM16 → log-mel → linear-softmax
contract.  It exposes `classify_wav_bytes` for tests and an Android JNI entry
point that accepts a WAV path.  The generated Android library is optional: the
React Native app falls back to the TypeScript implementation when
`libcoldkeep_ml.so` is not present.

Build on a machine with Rust and the Android NDK installed:

```powershell
.\rust\build_android.ps1 -Architectures arm64-v8a,armeabi-v7a
```

The script uses `cargo ndk` when available and writes libraries into
`android/app/src/main/jniLibs`.  Do not commit those generated `.so` files.

## Ice label policy

The shake path derives a coarse amount class from the collection manifest:
`none` (0), `few` (1--2), or `many` (3+). Exact cube counts and ice mass are
not part of the Rust prediction. The checked-in artifact is manifest-only, so
the prediction is `iceAmountStatus: "untrained"` and `iceAmount: null` until
phone/water-bottle recordings pass the session-held-out gate:

```powershell
python ml/train_shake_ice_amount.py --manifest <exported-manifest.csv> --audio-root <dataset-root> --output ml/artifacts/shake_ice_amount_pilot.json
```

After `ml/artifacts/shake_ice_amount_pilot.json` exists, the next Rust build
embeds it automatically and returns a trained `iceAmount` only when the
artifact gate passes. The legacy `icePresence` field remains for the pour
baseline and is independent of the shake amount task.
