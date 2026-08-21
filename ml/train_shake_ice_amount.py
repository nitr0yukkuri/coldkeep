"""Train a conservative three-band ice amount classifier for shake recordings.

The phone collection screen records the exact ice count as ground truth, but
the deployable task intentionally collapses it to ``none`` (0), ``few`` (1-2),
or ``many`` (3+).  This prevents the app from claiming an exact cube count
that the acoustic signal and the pilot dataset cannot support.
"""

from __future__ import annotations

import argparse
import csv
import json
import zlib
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
from train_baseline import SoftmaxClassifier, metrics


ICE_AMOUNT_NAMES = ("none", "few", "many")
MIN_DEPLOYABLE_BALANCED_ACCURACY = 0.67


@dataclass(frozen=True)
class Capture:
    recording_id: str
    session_id: str
    container_id: str
    device_id: str
    ice_count: int
    path: Path


def ice_amount_index(count: int) -> int:
    """Map exact collection ground truth to the public three-band target."""
    if count <= 0:
        return 0
    if count <= 2:
        return 1
    return 2


def _required(row: dict[str, str], name: str, line: int) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise ValueError(f"manifest line {line}: missing {name}")
    return value


def load_manifest(manifest: Path, audio_root: Path) -> tuple[list[Capture], list[str]]:
    """Load shake rows and skip malformed rows without guessing labels."""
    captures: list[Capture] = []
    diagnostics: list[str] = []
    resolved_audio_root = audio_root.resolve()
    seen_recording_ids: set[str] = set()
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {
            "recording_id",
            "session_id",
            "container_id",
            "device_id",
            "ice_count",
            "action",
            "audio_filename",
        }
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("manifest is missing columns: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            if row.get("action", "").strip().lower() != "shake":
                continue
            try:
                recording_id = _required(row, "recording_id", line)
                if recording_id in seen_recording_ids:
                    raise ValueError(f"duplicate recording_id: {recording_id}")
                ice_count = int(_required(row, "ice_count", line))
                if ice_count < 0:
                    raise ValueError("ice_count must be >= 0")
                audio = (audio_root / _required(row, "audio_filename", line)).resolve()
                if audio != resolved_audio_root and resolved_audio_root not in audio.parents:
                    raise ValueError("audio_filename escapes the audio root")
                if not audio.is_file():
                    raise ValueError(f"audio file not found: {audio}")
                seen_recording_ids.add(recording_id)
                captures.append(
                    Capture(
                        recording_id=recording_id,
                        session_id=_required(row, "session_id", line),
                        container_id=_required(row, "container_id", line),
                        device_id=_required(row, "device_id", line),
                        ice_count=ice_count,
                        path=audio,
                    )
                )
            except (TypeError, ValueError) as error:
                diagnostics.append(str(error))
    return captures, diagnostics


def validate_dataset(captures: list[Capture]) -> dict:
    """Return audit counts and require a session-held-out pilot dataset."""
    if not captures:
        raise ValueError("no shake recordings found; collect rows with action=shake")
    labels = {item.recording_id: ice_amount_index(item.ice_count) for item in captures}
    counts = Counter(labels.values())
    sessions_by_class: dict[int, set[str]] = defaultdict(set)
    containers_by_class: dict[int, set[str]] = defaultdict(set)
    for item in captures:
        label = labels[item.recording_id]
        sessions_by_class[label].add(item.session_id)
        containers_by_class[label].add(item.container_id)
    report = {
        "totalShakeRows": len(captures),
        "classCounts": {ICE_AMOUNT_NAMES[index]: counts[index] for index in range(3)},
        "sessionsPerClass": {
            ICE_AMOUNT_NAMES[index]: len(sessions_by_class[index]) for index in range(3)
        },
        "containersPerClass": {
            ICE_AMOUNT_NAMES[index]: len(containers_by_class[index]) for index in range(3)
        },
        "deviceCount": len({item.device_id for item in captures}),
    }
    missing = [ICE_AMOUNT_NAMES[index] for index in range(3) if counts[index] == 0]
    if missing:
        raise ValueError(
            "cannot train: missing class(es) "
            + ", ".join(missing)
            + "; class counts="
            + json.dumps(report["classCounts"], ensure_ascii=False)
        )
    sparse = [ICE_AMOUNT_NAMES[index] for index in range(3) if counts[index] < 2]
    if sparse:
        raise ValueError(
            "cannot evaluate: need at least 2 recordings per class; sparse="
            + ", ".join(sparse)
        )
    split_sparse = [
        ICE_AMOUNT_NAMES[index]
        for index in range(3)
        if len(sessions_by_class[index]) < 2
    ]
    if split_sparse:
        raise ValueError(
            "cannot evaluate session-held-out generalization: each class needs "
            "at least 2 sessions; sparse="
            + ", ".join(split_sparse)
        )
    return report


def features_for(capture: Capture, filters: np.ndarray) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(capture.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    windows = segment_audio(waveform)
    return np.stack([extract_features(window, filters=filters) for window in windows])


def recording_arrays(
    captures: list[Capture], feature_cache: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([feature_cache[item.recording_id] for item in captures])
    labels = np.concatenate(
        [
            np.full(
                len(feature_cache[item.recording_id]),
                ice_amount_index(item.ice_count),
                dtype=np.int64,
            )
            for item in captures
        ]
    )
    weights = np.concatenate(
        [
            np.full(
                len(feature_cache[item.recording_id]),
                1.0 / len(feature_cache[item.recording_id]),
            )
            for item in captures
        ]
    )
    return features, labels, weights


def evaluate(captures: list[Capture], feature_cache: dict[str, np.ndarray]) -> dict:
    classes = [0, 1, 2]
    true: list[int] = []
    predicted: list[int] = []
    predictions: list[dict] = []
    for held_out_session in sorted({item.session_id for item in captures}):
        train = [item for item in captures if item.session_id != held_out_session]
        test = [item for item in captures if item.session_id == held_out_session]
        if {ice_amount_index(item.ice_count) for item in train} != set(classes):
            raise ValueError(
                f"session {held_out_session!r} leaves a training fold without all 3 classes"
            )
        x_train, y_train, weights = recording_arrays(train, feature_cache)
        seed = zlib.crc32(held_out_session.encode("utf-8")) & 0xFFFF
        classifier = SoftmaxClassifier(classes, seed=seed)
        classifier.fit(x_train, y_train, weights)
        for item in test:
            probabilities = classifier.predict_proba(feature_cache[item.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = ice_amount_index(item.ice_count)
            true.append(actual)
            predicted.append(estimate)
            predictions.append(
                {
                    "recordingId": item.recording_id,
                    "heldOutSession": held_out_session,
                    "actual": ICE_AMOUNT_NAMES[actual],
                    "predicted": ICE_AMOUNT_NAMES[estimate],
                    "probabilities": probabilities.round(6).tolist(),
                }
            )
    result = metrics(true, predicted, classes)
    result["classes"] = list(ICE_AMOUNT_NAMES)
    result["predictions"] = predictions
    return result


def train(manifest: Path, audio_root: Path, output: Path | None) -> dict:
    captures, diagnostics = load_manifest(manifest, audio_root)
    report = validate_dataset(captures)
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    feature_cache = {item.recording_id: features_for(item, filters) for item in captures}
    evaluation = evaluate(captures, feature_cache)
    x, y, weights = recording_arrays(captures, feature_cache)
    classifier = SoftmaxClassifier([0, 1, 2], seed=7)
    classifier.fit(x, y, weights)
    status = (
        "trained"
        if evaluation["balanced_accuracy"] >= MIN_DEPLOYABLE_BALANCED_ACCURACY
        else "experimental"
    )
    artifact = {
        "version": 1,
        "task": "shake_ice_amount",
        "status": status,
        "classes": list(ICE_AMOUNT_NAMES),
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "featureSize": 128,
        "model": classifier.serializable("shake_ice_amount"),
        "dataset": report,
        "evaluation": evaluation,
        "warnings": [
            "Pilot only: collect new sessions across phones, bottles, and rooms.",
            "Public output is none/few/many; exact ice cube counts are not estimated.",
            f"Deployment status is {status}; balanced accuracy gate is "
            f"{MIN_DEPLOYABLE_BALANCED_ACCURACY:.2f}.",
        ],
    }
    if diagnostics:
        artifact["skippedRows"] = diagnostics
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    try:
        artifact = train(arguments.manifest, arguments.audio_root, arguments.output)
    except ValueError as error:
        print(f"SHAKE ICE PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "shake_ice_amount: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balanced_accuracy']:.3f}, "
        f"macro_f1={evaluation['macro_f1']:.3f}, n={evaluation['recordings']}"
    )
    if arguments.output:
        print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
