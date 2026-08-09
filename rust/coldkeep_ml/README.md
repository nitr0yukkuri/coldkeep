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

`ice_presence` is derived from the collection manifest (`ice_count > 0`).
The public audio baseline has no paired ice labels, so the Rust prediction is
`iceStatus: "untrained"` and `icePresence: null` until a manifest containing
both classes is trained:

```powershell
python ml/train_ice_presence.py --manifest <exported-manifest.csv> --audio-root <dataset-root>
```

After `ml/artifacts/ice_presence_baseline.json` exists, the next Rust build
embeds it automatically and returns `iceStatus: "trained"` with a binary
`icePresence` value.  The training script still labels the artifact as a
baseline; container-held-out evaluation is required before product claims.
