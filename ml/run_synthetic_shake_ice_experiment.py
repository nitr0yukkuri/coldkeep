"""Run a physics-inspired *research-only* shake/ice experiment.

This script is deliberately not a substitute for ColdKeep recordings.  It
generates damped collision events from an exact synthetic ``ice_count`` and
tests whether the proposed features can recover the count bands under
independent container/device/room response changes.  The generated labels are
not external audio labels and the resulting model is never written to the
production ``shake_ice_amount_pilot.json`` artifact.

The experiment answers a narrow question: do onset/transient descriptors carry
information about collision density when the data-generating process is
explicit?  A good synthetic score is only a sanity check for feature design;
it is not evidence of performance on a real phone or bottle.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from audio_features import (
    TARGET_SAMPLE_RATE,
    extract_feature_set,
    mel_filterbank,
    segment_audio,
)
from train_baseline import SoftmaxClassifier, metrics


SYNTHETIC_VERSION = "synthetic_physics_v2"
SAMPLE_RATE = TARGET_SAMPLE_RATE
DURATION_SECONDS = 2.0
CLASS_NAMES = ("none", "few", "many")
FEATURE_MODES = ("log_mel", "transient", "combined")
NORMALIZATION_MODES = ("gain_normalized", "raw")
GROUP_FIELDS = ("session_id", "container_id", "device_id", "room_id")
NUISANCE_SEED_TAG = 0x4E554953  # "NUIS"
IMPACT_SEED_TAG = 0x494D5041  # "IMPA"
RESEARCH_ARTIFACT_SCHEMA = "synthetic_log_mel_transient_v1"


@dataclass(frozen=True)
class SyntheticRecording:
    recording_id: str
    ice_count: int
    session_id: str
    container_id: str
    device_id: str
    room_id: str
    samples: np.ndarray


def _amount_class(ice_count: int) -> int:
    if ice_count <= 0:
        return 0
    if ice_count <= 2:
        return 1
    return 2


def _damped_impact(
    sample_rate: int,
    rng: np.random.Generator,
    container_resonance_hz: float,
    amplitude: float,
) -> np.ndarray:
    """Create one short, multi-mode collision response."""
    duration = float(rng.uniform(0.035, 0.15))
    length = max(8, round(duration * sample_rate))
    time = np.arange(length, dtype=np.float64) / sample_rate
    decay = float(rng.uniform(0.018, 0.075))
    fundamental = float(
        np.clip(
            container_resonance_hz * rng.uniform(0.75, 1.35),
            900.0,
            sample_rate * 0.45,
        )
    )
    phase = float(rng.uniform(0.0, 2.0 * np.pi))
    signal = np.sin(2.0 * np.pi * fundamental * time + phase)
    signal += 0.45 * np.sin(2.0 * np.pi * fundamental * 1.73 * time + phase / 2.0)
    signal += 0.18 * rng.normal(0.0, 1.0, length)
    signal *= np.exp(-time / decay)
    return (signal * amplitude).astype(np.float32)


def _apply_device_response(
    samples: np.ndarray, sample_rate: int, device_index: int
) -> np.ndarray:
    """Apply a deterministic microphone response independent of class."""
    spectrum = np.fft.rfft(samples.astype(np.float64))
    frequencies = np.fft.rfftfreq(len(samples), 1.0 / sample_rate)
    tilt = (device_index - 1) * 0.18
    response = np.clip(1.0 + tilt * (frequencies / max(sample_rate / 2.0, 1.0) - 0.5), 0.65, 1.35)
    return np.fft.irfft(spectrum * response, n=len(samples)).astype(np.float32)


def _generate_recording(
    ice_count: int,
    session_index: int,
    container_index: int,
    device_index: int,
    room_index: int,
    seed: int,
) -> SyntheticRecording:
    # Keep the nuisance realization independent of the target label.  The
    # impact stream is allowed to depend on the exact count, but background
    # noise, rattles, room gain, and device gain must not get a label-derived
    # PRNG stream by accident.
    nuisance_rng = np.random.default_rng(
        np.random.SeedSequence([seed, NUISANCE_SEED_TAG])
    )
    impact_rng = np.random.default_rng(
        np.random.SeedSequence([seed, IMPACT_SEED_TAG, ice_count])
    )
    length = round(DURATION_SECONDS * SAMPLE_RATE)
    samples = nuisance_rng.normal(0.0, 0.0025, length).astype(np.float32)

    # Low-frequency slosh/noise is independent of ice count.  This prevents a
    # classifier from using water movement as a direct count shortcut.
    slosh = nuisance_rng.normal(0.0, 1.0, length).astype(np.float32)
    kernel = np.ones(401, dtype=np.float32) / 401.0
    slosh = np.convolve(slosh, kernel, mode="same")
    samples += slosh * float(nuisance_rng.uniform(0.015, 0.035))

    # Each cube can produce zero or several impacts.  The overlap and missed
    # collisions intentionally make event count an imperfect proxy for cubes.
    resonance = 1_650.0 + container_index * 820.0
    for _ in range(ice_count):
        collision_count = int(impact_rng.poisson(1.25))
        for _ in range(collision_count):
            start = int(
                impact_rng.integers(0, max(1, length - round(0.16 * SAMPLE_RATE)))
            )
            amplitude = float(impact_rng.uniform(0.018, 0.14))
            impact = _damped_impact(SAMPLE_RATE, impact_rng, resonance, amplitude)
            end = min(length, start + len(impact))
            samples[start:end] += impact[: end - start]

    # Background rattles are present at every class, including none.  They are
    # not labelled as cubes and make a perfect onset-count shortcut harder.
    for _ in range(int(nuisance_rng.poisson(0.45))):
        start = int(
            nuisance_rng.integers(0, max(1, length - round(0.16 * SAMPLE_RATE)))
        )
        impact = _damped_impact(
            SAMPLE_RATE,
            nuisance_rng,
            resonance * float(nuisance_rng.uniform(0.65, 1.8)),
            float(nuisance_rng.uniform(0.01, 0.055)),
        )
        end = min(length, start + len(impact))
        samples[start:end] += impact[: end - start]

    # Room response and device gain are nuisance factors.  Gain is sampled
    # independently of the class so raw-vs-normalized shortcut effects can be
    # measured by the experiment.
    delay = 20 + room_index * 17
    reverberated = samples.copy()
    if delay < len(samples):
        reverberated[delay:] += samples[:-delay] * float(0.08 + room_index * 0.04)
    reverberated = _apply_device_response(reverberated, SAMPLE_RATE, device_index)
    reverberated *= float(nuisance_rng.uniform(0.45, 1.8))
    reverberated = reverberated - reverberated.mean()
    peak = float(np.max(np.abs(reverberated)))
    if peak > 0.95:
        reverberated *= 0.95 / peak

    return SyntheticRecording(
        recording_id=f"synthetic-{session_index}-{container_index}-{device_index}-{room_index}-ice-{ice_count}-{seed}",
        ice_count=ice_count,
        session_id=f"session-{session_index}",
        container_id=f"container-{container_index}",
        device_id=f"device-{device_index}",
        room_id=f"room-{room_index}",
        samples=reverberated.astype(np.float32),
    )


def generate_recordings(
    *,
    groups: int = 3,
    repetitions: int = 2,
    seed: int = 20260823,
) -> list[SyntheticRecording]:
    """Generate a balanced design where every held-out group has all classes."""
    if groups < 2 or repetitions < 1:
        raise ValueError("groups must be >= 2 and repetitions must be >= 1")
    recordings: list[SyntheticRecording] = []
    # A sparse crossed design keeps the experiment small while ensuring each
    # session/container/device/room group contains every amount class.  The
    # second design pass changes device/room assignment so one nuisance group
    # is not perfectly determined by another.
    conditions = [
        (session_index, container_index, design_index)
        for session_index in range(groups)
        for container_index in range(groups)
        for design_index in range(2)
    ]
    for condition_index, (session_index, container_index, design_index) in enumerate(
        conditions
    ):
        device_index = (session_index + container_index + design_index) % groups
        room_index = (session_index + 2 * container_index + 2 * design_index) % groups
        for ice_count in range(6):
            for repetition in range(repetitions):
                value = (
                    seed
                    + condition_index * 1_000_003
                    + session_index * 10_007
                    + container_index * 101
                    + device_index * 17
                    + room_index * 3
                    + repetition
                )
                recordings.append(
                    _generate_recording(
                        ice_count,
                        session_index,
                        container_index,
                        device_index,
                        room_index,
                        value,
                    )
                )
    return recordings


def _recording_features(
    recording: SyntheticRecording,
    mode: str,
    gain_normalize: bool,
    filters: np.ndarray,
) -> np.ndarray:
    windows = segment_audio(recording.samples, sample_rate=SAMPLE_RATE)
    return np.stack(
        [
            extract_feature_set(
                window,
                mode,
                SAMPLE_RATE,
                filters,
                gain_normalize,
            )
            for window in windows
        ]
    )


def _arrays(
    captures: list[SyntheticRecording],
    cache: dict[str, np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([cache[item.recording_id] for item in captures])
    labels = np.concatenate(
        [
            np.full(
                len(cache[item.recording_id]),
                _amount_class(item.ice_count),
                dtype=np.int64,
            )
            for item in captures
        ]
    )
    weights = np.concatenate(
        [
            np.full(len(cache[item.recording_id]), 1.0 / len(cache[item.recording_id]))
            for item in captures
        ]
    )
    return features, labels, weights


def _metric_for_group(
    captures: list[SyntheticRecording],
    cache: dict[str, np.ndarray],
    field: str,
    epochs: int,
) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    fold_reports: dict[str, dict] = {}
    for held_out in sorted({getattr(item, field) for item in captures}):
        train = [item for item in captures if getattr(item, field) != held_out]
        test = [item for item in captures if getattr(item, field) == held_out]
        classifier = SoftmaxClassifier([0, 1, 2], seed=31)
        x_train, y_train, weights = _arrays(train, cache)
        classifier.fit(x_train, y_train, weights, epochs=epochs)
        fold_true: list[int] = []
        fold_predicted: list[int] = []
        for item in test:
            probabilities = classifier.predict_proba(cache[item.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = _amount_class(item.ice_count)
            true.append(actual)
            predicted.append(estimate)
            fold_true.append(actual)
            fold_predicted.append(estimate)
        fold_reports[str(held_out)] = metrics(fold_true, fold_predicted, [0, 1, 2])
    result = metrics(true, predicted, [0, 1, 2])
    result["folds"] = fold_reports
    return result


def run_experiment(
    *,
    groups: int = 3,
    repetitions: int = 2,
    epochs: int = 350,
    seed: int = 20260823,
) -> dict:
    recordings = generate_recordings(groups=groups, repetitions=repetitions, seed=seed)
    filters = mel_filterbank(SAMPLE_RATE)
    report: dict = {
        "version": 1,
        "status": "research_only",
        "task": "shake_ice_amount",
        "syntheticVersion": SYNTHETIC_VERSION,
        "labelSource": "synthetic_physics_exact_count",
        "labelsUsedForProductionTraining": False,
        "productionArtifactUpdated": False,
        "classes": list(CLASS_NAMES),
        "generation": {
            "groups": groups,
            "repetitions": repetitions,
            "recordings": len(recordings),
            "sampleRate": SAMPLE_RATE,
            "durationSeconds": DURATION_SECONDS,
            "iceCounts": list(range(6)),
            "seed": seed,
            "notes": [
                "Damped resonator impacts are a hypothesis, not measured bottle audio.",
                "Each cube produces a random number of collisions; nuisance realizations are seeded independently of ice_count.",
                "Results cannot establish phone/container generalization or deployability.",
            ],
        },
        "featureModes": {
            "log_mel": {"size": 128, "description": "A: current log-mel summary"},
            "transient": {"size": 21, "description": "B: onset/transient descriptors"},
            "combined": {"size": 149, "description": "C: log-mel + transient descriptors"},
        },
        "normalization": list(NORMALIZATION_MODES),
        "holdoutGroups": list(GROUP_FIELDS),
        "training": {"classifier": "weighted linear softmax", "epochs": epochs},
        "results": {},
    }
    for mode in FEATURE_MODES:
        for normalization in NORMALIZATION_MODES:
            cache = {
                item.recording_id: _recording_features(
                    item,
                    mode,
                    normalization == "gain_normalized",
                    filters,
                )
                for item in recordings
            }
            key = f"{mode}:{normalization}"
            report["results"][key] = {
                "featureMode": mode,
                "normalization": normalization,
                "groupHoldout": {
                    field: _metric_for_group(recordings, cache, field, epochs)
                    for field in GROUP_FIELDS
                },
            }

    # Keep one fitted research model in the report so feature dimensions and
    # serialization are exercised, but never point production loaders at it.
    combined_cache = {
        item.recording_id: _recording_features(item, "combined", True, filters)
        for item in recordings
    }
    x, y, weights = _arrays(recordings, combined_cache)
    model = SoftmaxClassifier([0, 1, 2], seed=7)
    model.fit(x, y, weights, epochs=epochs)
    report["researchModel"] = model.serializable("synthetic_shake_ice_combined")
    return report


def research_artifact(report: dict) -> dict:
    """Build a deliberately non-deployable artifact from one research run.

    Keeping this separate from ``shake_ice_amount_pilot.json`` makes it
    possible to inspect and replay the fitted weights without accidentally
    presenting synthetic scores as phone/bottle evidence. The feature size is
    149 (log-mel plus transient), so the production 128-dimensional loader
    rejects it even if a file is copied manually.
    """
    model = report.get("researchModel")
    if not isinstance(model, dict):
        raise ValueError("research report does not contain a fitted model")
    if len(model.get("featureMean", [])) != 149:
        raise ValueError("synthetic research model must have 149 features")
    return {
        "version": 1,
        "task": "shake_ice_amount",
        "status": "research_only",
        "classes": list(CLASS_NAMES),
        "sampleRate": SAMPLE_RATE,
        "windowSamples": SAMPLE_RATE,
        "hopSamples": SAMPLE_RATE // 2,
        "featureSize": 149,
        "featureSchema": {
            "name": RESEARCH_ARTIFACT_SCHEMA,
            "version": 1,
            "description": "synthetic physics model: log-mel summary plus transient descriptors",
        },
        "model": model,
        "evaluation": {
            "holdoutGroups": report["holdoutGroups"],
            "results": {
                key: value
                for key, value in report["results"].items()
                if key == "combined:gain_normalized"
            },
        },
        "provenance": {
            "source": "ml/run_synthetic_shake_ice_experiment.py",
            "syntheticVersion": report["syntheticVersion"],
            "labelSource": report["labelSource"],
            "labelsUsedForProductionTraining": False,
            "productionArtifactUpdated": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--groups", type=int, default=3)
    parser.add_argument("--repetitions", type=int, default=2)
    parser.add_argument("--epochs", type=int, default=350)
    parser.add_argument("--seed", type=int, default=20260823)
    parser.add_argument(
        "--research-artifact",
        type=Path,
        help="optional research_only model output; never a production artifact",
    )
    args = parser.parse_args()
    report = run_experiment(
        groups=args.groups,
        repetitions=args.repetitions,
        epochs=args.epochs,
        seed=args.seed,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.research_artifact:
        args.research_artifact.parent.mkdir(parents=True, exist_ok=True)
        args.research_artifact.write_text(
            json.dumps(research_artifact(report), indent=2), encoding="utf-8"
        )
    print(
        "synthetic shake ice experiment: "
        f"recordings={report['generation']['recordings']}, "
        f"status={report['status']}"
    )
    print(f"wrote {args.output}")
    if args.research_artifact:
        print(f"wrote research-only artifact {args.research_artifact}")


if __name__ == "__main__":
    main()
