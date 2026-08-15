"""Train a conservative paired ice-present/ice-absent baseline.

The public ACM-S2 corpus has no ice label, so this task reads the app's
collection manifest. It refuses to write an artifact until both classes have
enough recordings in multiple containers and a container-held-out evaluation
can be completed.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from audio_features import (
    TARGET_SAMPLE_RATE,
    extract_features,
    mel_filterbank,
    read_pcm16_wav,
    resample,
    segment_audio,
)
from train_baseline import SoftmaxClassifier


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "ml" / "artifacts" / "ice_presence_baseline.json"
ICE_CLASSES = (0, 1)


@dataclass(frozen=True)
class Capture:
    recording_id: str
    session_id: str
    container_id: str
    device_id: str
    ice_presence: int
    path: Path


def _required(row: dict[str, str], name: str, line: int) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise ValueError(f"manifest line {line}: missing {name}")
    return value


def load_manifest(manifest: Path, audio_root: Path | None) -> tuple[list[Capture], list[str]]:
    """Load paired captures and report rows that cannot be used safely."""
    root = (audio_root or manifest.parent).resolve()
    captures: list[Capture] = []
    diagnostics: list[str] = []
    seen_recording_ids: set[str] = set()
    with manifest.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        for line, row in enumerate(reader, start=2):
            try:
                filename = _required(row, "audio_filename", line)
                recording_id = _required(row, "recording_id", line)
                if recording_id in seen_recording_ids:
                    raise ValueError(f"duplicate recording_id: {recording_id}")
                path = (root / filename).resolve()
                if path != root and root not in path.parents:
                    raise ValueError("audio_filename escapes the audio root")
                if not path.is_file():
                    raise ValueError(f"audio file not found: {path}")
                ice_count = float(_required(row, "ice_count", line))
                if not np.isfinite(ice_count) or ice_count < 0:
                    raise ValueError("ice_count must be a finite non-negative number")
                seen_recording_ids.add(recording_id)
                captures.append(
                    Capture(
                        recording_id=recording_id,
                        session_id=_required(row, "session_id", line),
                        container_id=_required(row, "container_id", line),
                        device_id=_required(row, "device_id", line),
                        ice_presence=int(ice_count > 0),
                        path=path,
                    )
                )
            except (TypeError, ValueError) as error:
                diagnostics.append(str(error))
    return captures, diagnostics


def validate_dataset(captures: list[Capture]) -> dict:
    """Require enough independent groups for a meaningful container holdout."""
    if not captures:
        raise ValueError("manifest has no usable ice-labelled recordings")

    counts = Counter(capture.ice_presence for capture in captures)
    containers_by_class: dict[int, set[str]] = defaultdict(set)
    sessions_by_class: dict[int, set[str]] = defaultdict(set)
    devices_by_class: dict[int, set[str]] = defaultdict(set)
    for capture in captures:
        containers_by_class[capture.ice_presence].add(capture.container_id)
        sessions_by_class[capture.ice_presence].add(capture.session_id)
        devices_by_class[capture.ice_presence].add(capture.device_id)

    report = {
        "recordings": len(captures),
        "classCounts": {str(label): counts[label] for label in ICE_CLASSES},
        "containersPerClass": {
            str(label): len(containers_by_class[label]) for label in ICE_CLASSES
        },
        "sessionsPerClass": {
            str(label): len(sessions_by_class[label]) for label in ICE_CLASSES
        },
        "devicesPerClass": {
            str(label): len(devices_by_class[label]) for label in ICE_CLASSES
        },
        "containers": len({capture.container_id for capture in captures}),
        "devices": len({capture.device_id for capture in captures}),
    }
    missing = [str(label) for label in ICE_CLASSES if counts[label] == 0]
    if missing:
        raise ValueError("ice_presence needs both classes; missing " + ", ".join(missing))
    sparse = [str(label) for label in ICE_CLASSES if counts[label] < 2]
    if sparse:
        raise ValueError("need at least 2 recordings per class; sparse=" + ", ".join(sparse))
    container_sparse = [
        str(label) for label in ICE_CLASSES if len(containers_by_class[label]) < 2
    ]
    if container_sparse:
        raise ValueError(
            "need at least 2 containers per class for container holdout; sparse="
            + ", ".join(container_sparse)
        )
    return report


def feature_cache(captures: list[Capture]) -> dict[str, np.ndarray]:
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    cache: dict[str, np.ndarray] = {}
    for capture in captures:
        waveform, sample_rate = read_pcm16_wav(capture.path)
        waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
        windows = segment_audio(waveform)
        cache[capture.recording_id] = np.stack(
            [extract_features(window, filters=filters) for window in windows]
        )
    return cache


def _arrays(
    captures: list[Capture], cache: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([cache[capture.recording_id] for capture in captures])
    labels = np.concatenate(
        [
            np.full(len(cache[capture.recording_id]), capture.ice_presence, dtype=np.int64)
            for capture in captures
        ]
    )
    weights = np.concatenate(
        [
            np.full(len(cache[capture.recording_id]), 1.0 / len(cache[capture.recording_id]))
            for capture in captures
        ]
    )
    return features, labels, weights


def _metrics(true: list[int], predicted: list[int]) -> dict:
    if not true:
        raise ValueError("container-held-out evaluation produced no recordings")
    confusion = [[0, 0], [0, 0]]
    for actual, estimate in zip(true, predicted):
        confusion[actual][estimate] += 1
    recalls = []
    precisions = []
    f1_scores = []
    for label in ICE_CLASSES:
        tp = confusion[label][label]
        fp = confusion[1 - label][label]
        fn = confusion[label][1 - label]
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        precisions.append(precision)
        recalls.append(recall)
        f1_scores.append(2 * precision * recall / max(precision + recall, 1e-12))
    correct = sum(actual == estimate for actual, estimate in zip(true, predicted))
    return {
        "recordings": len(true),
        "correct": correct,
        "accuracy": correct / len(true),
        "balancedAccuracy": float(np.mean(recalls)),
        "macroF1": float(np.mean(f1_scores)),
        "recall": {str(label): recalls[label] for label in ICE_CLASSES},
        "precision": {str(label): precisions[label] for label in ICE_CLASSES},
        "confusionMatrix": confusion,
    }


def evaluate(captures: list[Capture], cache: dict[str, np.ndarray]) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    predictions: list[dict] = []
    for held_out_container in sorted({item.container_id for item in captures}):
        train = [item for item in captures if item.container_id != held_out_container]
        test = [item for item in captures if item.container_id == held_out_container]
        if {item.ice_presence for item in train} != set(ICE_CLASSES):
            continue
        features, labels, weights = _arrays(train, cache)
        classifier = SoftmaxClassifier(list(ICE_CLASSES), seed=len(true) + 23)
        classifier.fit(features, labels, weights)
        for capture in test:
            probabilities = classifier.predict_proba(cache[capture.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            true.append(capture.ice_presence)
            predicted.append(estimate)
            predictions.append(
                {
                    "recordingId": capture.recording_id,
                    "heldOutContainer": held_out_container,
                    "actual": capture.ice_presence,
                    "predicted": estimate,
                    "probabilities": probabilities.round(6).tolist(),
                }
            )
    report = _metrics(true, predicted)
    report["predictions"] = predictions
    return report


def train(manifest: Path, audio_root: Path | None, output: Path | None) -> dict:
    captures, diagnostics = load_manifest(manifest, audio_root)
    dataset = validate_dataset(captures)
    cache = feature_cache(captures)
    evaluation = evaluate(captures, cache)
    features, labels, weights = _arrays(captures, cache)
    classifier = SoftmaxClassifier(list(ICE_CLASSES), seed=19)
    classifier.fit(features, labels, weights)
    artifact = {
        "version": 1,
        "task": "ice_presence",
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "melBins": 32,
        "featureSize": 128,
        "models": {"ice_presence": classifier.serializable("ice_presence")},
        "data": dataset,
        "evaluation": evaluation,
        "warnings": [
            "Pilot only: validate on a new phone, container, and session before product use.",
            "The target is binary ice presence (ice_count > 0), not ice mass or count.",
        ],
    }
    if diagnostics:
        artifact["skippedRows"] = diagnostics
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    try:
        artifact = train(arguments.manifest, arguments.audio_root, arguments.output)
    except (OSError, ValueError) as error:
        print(f"ICE PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "ice_presence: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balancedAccuracy']:.3f}, "
        f"macro_f1={evaluation['macroF1']:.3f}, "
        f"n={evaluation['recordings']}"
    )
    print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
