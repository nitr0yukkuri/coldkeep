"""Run a research-only ice-event mixture experiment.

The input files are author-described *single-event* references, not ColdKeep
measurements.  This script never treats their descriptions as ``none/few/many``
labels.  Instead it copies short waveform fragments into a new synthetic
recording and labels the number of generated copies.  The resulting labels are
synthetic augmentation labels, so the report and fitted artifact are always
``research_only`` and can never be promoted to the production artifact.

The experiment is useful for one narrow question: do the proposed transient
features retain information when a real ice-like event is repeated under
independent nuisance conditions?  It does not establish phone, bottle, or
count generalization.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
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


SAMPLE_RATE = TARGET_SAMPLE_RATE
DURATION_SECONDS = 2.0
CLASS_NAMES = ("none", "few", "many")
FEATURE_MODES = ("log_mel", "transient", "combined")
NORMALIZATION_MODES = ("gain_normalized", "raw")
GROUP_FIELDS = (
    "session_id",
    "container_id",
    "device_id",
    "room_id",
    "operator_id",
    "source_id",
)
NUISANCE_SEED_TAG = 0x4E554953
IMPACT_SEED_TAG = 0x494D5041
RESEARCH_ARTIFACT_SCHEMA = "external_single_event_mixture_v1"


@dataclass(frozen=True)
class SeedAudio:
    source_id: str
    filename: str
    source_url: str
    sha256: str
    samples: np.ndarray


@dataclass(frozen=True)
class MixtureRecording:
    recording_id: str
    source_id: str
    ice_count: int
    session_id: str
    container_id: str
    device_id: str
    room_id: str
    operator_id: str
    samples: np.ndarray


def amount_class(ice_count: int) -> int:
    if ice_count <= 0:
        return 0
    if ice_count <= 2:
        return 1
    return 2


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def decode_audio(path: Path) -> np.ndarray:
    """Decode a research preview through the optional miniaudio dependency."""
    try:
        import miniaudio  # type: ignore[import-not-found]
    except ImportError as error:
        raise ValueError(
            "install optional miniaudio to decode external mixture seeds"
        ) from error
    try:
        decoded = miniaudio.decode_file(
            str(path), nchannels=1, sample_rate=SAMPLE_RATE
        )
    except Exception as error:  # pragma: no cover - backend-specific errors
        raise ValueError(f"failed to decode {path.name}: {error}") from error
    samples = np.frombuffer(decoded.samples, dtype=np.int16).astype(np.float32)
    if not len(samples):
        raise ValueError(f"{path.name} decoded to no samples")
    return samples / 32768.0


def load_seed_manifest(manifest: Path, audio_root: Path) -> list[SeedAudio]:
    """Load only explicit one-event reference rows for synthetic mixing.

    The author-described count is used only to select a single-event seed; it
    is never written as a classifier target.  The generated target is the
    number of waveform copies produced by this script.
    """
    required = {
        "filename",
        "source_url",
        "author_claimed_count",
        "production_label_eligible",
    }
    seeds: list[SeedAudio] = []
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("manifest is missing columns: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            if (row.get("production_label_eligible") or "").strip().lower() != "false":
                raise ValueError(
                    f"manifest line {line} must set production_label_eligible=false"
                )
            # This condition is provenance selection, not a cube-count label.
            if (row.get("author_claimed_count") or "").strip() != "1":
                continue
            filename = (row.get("filename") or "").strip()
            path = (audio_root / filename).resolve()
            root = audio_root.resolve()
            if root not in path.parents or not path.is_file():
                raise ValueError(f"seed audio is missing or outside root: {filename}")
            seeds.append(
                SeedAudio(
                    source_id=Path(filename).stem,
                    filename=filename,
                    source_url=(row.get("source_url") or "").strip(),
                    sha256=_sha256(path),
                    samples=decode_audio(path),
                )
            )
    if len(seeds) < 2:
        raise ValueError("at least two single-event sources are required")
    return seeds


def _rescale_fragment(fragment: np.ndarray, target_length: int) -> np.ndarray:
    target_length = max(8, int(target_length))
    if len(fragment) == target_length:
        result = fragment.astype(np.float32, copy=True)
    else:
        old = np.linspace(0.0, 1.0, len(fragment), dtype=np.float64)
        new = np.linspace(0.0, 1.0, target_length, dtype=np.float64)
        result = np.interp(new, old, fragment).astype(np.float32)
    fade = max(2, min(target_length // 8, round(0.01 * SAMPLE_RATE)))
    envelope = np.ones(target_length, dtype=np.float32)
    envelope[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
    envelope[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
    return result * envelope


def _apply_device_response(samples: np.ndarray, device_index: int) -> np.ndarray:
    spectrum = np.fft.rfft(samples.astype(np.float64))
    frequencies = np.fft.rfftfreq(len(samples), 1.0 / SAMPLE_RATE)
    tilt = (device_index - 1) * 0.18
    response = np.clip(
        1.0 + tilt * (frequencies / (SAMPLE_RATE / 2.0) - 0.5), 0.65, 1.35
    )
    return np.fft.irfft(spectrum * response, n=len(samples)).astype(np.float32)


def _mix_recording(
    seed: SeedAudio,
    ice_count: int,
    session_index: int,
    container_index: int,
    device_index: int,
    room_index: int,
    operator_index: int,
    repetition: int,
    seed_value: int,
) -> MixtureRecording:
    length = round(DURATION_SECONDS * SAMPLE_RATE)
    nuisance_rng = np.random.default_rng(
        np.random.SeedSequence(
            [seed_value, NUISANCE_SEED_TAG, session_index, container_index]
        )
    )
    impact_rng = np.random.default_rng(
        np.random.SeedSequence([seed_value, IMPACT_SEED_TAG, ice_count])
    )
    samples = nuisance_rng.normal(0.0, 0.0025, length).astype(np.float32)
    # A low-frequency background is present for every synthetic class.
    background = nuisance_rng.normal(0.0, 1.0, length).astype(np.float32)
    background = np.convolve(background, np.ones(401) / 401.0, mode="same")
    samples += background.astype(np.float32) * float(
        nuisance_rng.uniform(0.012, 0.032)
    )

    if len(seed.samples) < round(0.08 * SAMPLE_RATE):
        raise ValueError(f"seed {seed.filename} is too short for event mixing")
    for _ in range(ice_count):
        source_start = int(
            impact_rng.integers(0, max(1, len(seed.samples) - round(0.08 * SAMPLE_RATE)))
        )
        source_length = int(
            impact_rng.integers(
                round(0.08 * SAMPLE_RATE),
                min(len(seed.samples) - source_start, round(0.42 * SAMPLE_RATE)) + 1,
            )
        )
        fragment = _rescale_fragment(
            seed.samples[source_start : source_start + source_length],
            int(impact_rng.integers(round(0.08 * SAMPLE_RATE), round(0.42 * SAMPLE_RATE))),
        )
        start = int(impact_rng.integers(0, max(1, length - len(fragment))))
        end = min(length, start + len(fragment))
        samples[start:end] += fragment[: end - start] * float(
            impact_rng.uniform(0.55, 1.15)
        )

    delay = 20 + room_index * 17
    if delay < len(samples):
        samples[delay:] += samples[:-delay] * float(0.06 + room_index * 0.035)
    samples = _apply_device_response(samples, device_index)
    samples *= float(nuisance_rng.uniform(0.45, 1.8))
    samples -= samples.mean()
    peak = float(np.max(np.abs(samples)))
    if peak > 0.95:
        samples *= 0.95 / peak
    return MixtureRecording(
        recording_id=(
            f"external-mixture-{seed.source_id}-{session_index}-{container_index}-"
            f"{device_index}-{room_index}-{operator_index}-{ice_count}-{repetition}"
        ),
        source_id=seed.source_id,
        ice_count=ice_count,
        session_id=f"session-{session_index}",
        container_id=f"container-{container_index}",
        device_id=f"device-{device_index}",
        room_id=f"room-{room_index}",
        operator_id=f"operator-{operator_index}",
        samples=samples.astype(np.float32),
    )


def generate_recordings(
    seeds: list[SeedAudio],
    *,
    groups: int = 3,
    repetitions: int = 2,
    seed: int = 20260824,
) -> list[MixtureRecording]:
    if len(seeds) < 2:
        raise ValueError("at least two sources are required")
    if groups < 2 or repetitions < 1:
        raise ValueError("groups must be >= 2 and repetitions must be >= 1")
    recordings: list[MixtureRecording] = []
    for source_index, source in enumerate(seeds):
        for session_index in range(groups):
            for container_index in range(groups):
                design_index = (source_index + session_index + container_index) % 2
                device_index = (session_index + container_index + design_index) % groups
                room_index = (session_index + 2 * container_index + design_index) % groups
                operator_index = (
                    2 * session_index + container_index + 3 * design_index
                ) % groups
                for ice_count in range(6):
                    for repetition in range(repetitions):
                        value = (
                            seed
                            + source_index * 1_000_003
                            + session_index * 10_007
                            + container_index * 101
                            + repetition
                        )
                        recordings.append(
                            _mix_recording(
                                source,
                                ice_count,
                                session_index,
                                container_index,
                                device_index,
                                room_index,
                                operator_index,
                                repetition,
                                value,
                            )
                        )
    return recordings


def _recording_features(
    recording: MixtureRecording,
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
    captures: list[MixtureRecording], cache: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([cache[item.recording_id] for item in captures])
    labels = np.concatenate(
        [
            np.full(
                len(cache[item.recording_id]),
                amount_class(item.ice_count),
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
    captures: list[MixtureRecording],
    cache: dict[str, np.ndarray],
    field: str,
    epochs: int,
) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    folds: dict[str, dict] = {}
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
            actual = amount_class(item.ice_count)
            true.append(actual)
            predicted.append(estimate)
            fold_true.append(actual)
            fold_predicted.append(estimate)
        folds[str(held_out)] = metrics(fold_true, fold_predicted, [0, 1, 2])
    result = metrics(true, predicted, [0, 1, 2])
    result["folds"] = folds
    return result


def run_experiment(
    seeds: list[SeedAudio],
    *,
    groups: int = 3,
    repetitions: int = 2,
    epochs: int = 350,
    seed: int = 20260824,
) -> dict:
    recordings = generate_recordings(
        seeds, groups=groups, repetitions=repetitions, seed=seed
    )
    filters = mel_filterbank(SAMPLE_RATE)
    report: dict = {
        "version": 1,
        "status": "research_only",
        "task": "shake_ice_amount",
        "labelSource": "synthetic_external_single_event_mixture",
        "labelsUsedForProductionTraining": False,
        "productionArtifactUpdated": False,
        "classes": list(CLASS_NAMES),
        "generation": {
            "recordings": len(recordings),
            "groups": groups,
            "repetitions": repetitions,
            "sampleRate": SAMPLE_RATE,
            "durationSeconds": DURATION_SECONDS,
            "iceCounts": list(range(6)),
            "seed": seed,
            "notes": [
                "Labels count synthetic waveform copies, never source-described cube counts.",
                "Source audio is a glass/event reference and is not ColdKeep measured ground truth.",
                "Source-held-out scores test only synthetic source robustness, not bottle generalization.",
            ],
        },
        "sources": [
            {
                "sourceId": item.source_id,
                "filename": item.filename,
                "sourceUrl": item.source_url,
                "sha256": item.sha256,
                "usedAs": "single_event_augmentation_seed",
                "productionLabelEligible": False,
            }
            for item in seeds
        ],
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
                    item, mode, normalization == "gain_normalized", filters
                )
                for item in recordings
            }
            report["results"][f"{mode}:{normalization}"] = {
                "featureMode": mode,
                "normalization": normalization,
                "groupHoldout": {
                    field: _metric_for_group(recordings, cache, field, epochs)
                    for field in GROUP_FIELDS
                },
            }

    combined_cache = {
        item.recording_id: _recording_features(item, "combined", True, filters)
        for item in recordings
    }
    x, y, weights = _arrays(recordings, combined_cache)
    model = SoftmaxClassifier([0, 1, 2], seed=7)
    model.fit(x, y, weights, epochs=epochs)
    report["researchModel"] = model.serializable("external_single_event_mixture")
    return report


def research_artifact(report: dict) -> dict:
    model = report.get("researchModel")
    if not isinstance(model, dict) or len(model.get("featureMean", [])) != 149:
        raise ValueError("research model must contain 149 combined features")
    return {
        "version": 1,
        "task": "shake_ice_amount",
        "status": "research_only",
        "classes": list(CLASS_NAMES),
        "sampleRate": SAMPLE_RATE,
        "windowSamples": SAMPLE_RATE,
        "hopSamples": SAMPLE_RATE // 2,
        "featureSize": 149,
        "featureSchema": {"name": RESEARCH_ARTIFACT_SCHEMA, "version": 1},
        "model": model,
        "evaluation": {
            "holdoutGroups": report["holdoutGroups"],
            "results": {
                "combined:gain_normalized": report["results"]["combined:gain_normalized"]
            },
        },
        "provenance": {
            "source": "ml/run_external_mixture_experiment.py",
            "labelSource": report["labelSource"],
            "labelsUsedForProductionTraining": False,
            "productionArtifactUpdated": False,
            "sourceAudioUsedOnlyAs": "synthetic_augmentation_seed",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--research-artifact", type=Path)
    parser.add_argument("--groups", type=int, default=3)
    parser.add_argument("--repetitions", type=int, default=2)
    parser.add_argument("--epochs", type=int, default=350)
    parser.add_argument("--seed", type=int, default=20260824)
    args = parser.parse_args()
    seeds = load_seed_manifest(args.manifest, args.audio_root)
    report = run_experiment(
        seeds,
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
        f"external mixture experiment: recordings={report['generation']['recordings']}, "
        f"sources={len(seeds)}, status={report['status']}"
    )


if __name__ == "__main__":
    main()
