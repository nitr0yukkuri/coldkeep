"""Train a conservative empty/half/full classifier for shake recordings.

This is intentionally separate from the public pour model.  It consumes the
CSV exported by ColdKeep's data collection screen and refuses to emit an
artifact until the data can support a session-held-out evaluation.
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


LEVEL_NAMES = ("empty", "half", "full")


@dataclass(frozen=True)
class Capture:
    recording_id: str
    session_id: str
    container_id: str
    device_id: str
    capacity_ml: float
    water_ml: float
    action: str
    path: Path

    @property
    def ratio(self) -> float:
        return self.water_ml / self.capacity_ml


def level_index(ratio: float) -> int | None:
    """Map measured fill ratio to a deliberately wide, auditable 3-class band."""
    if not np.isfinite(ratio) or ratio < 0.0 or ratio > 1.0:
        return None
    if ratio <= 0.10:
        return 0
    if 0.30 <= ratio <= 0.70:
        return 1
    if ratio >= 0.90:
        return 2
    # 10--30% and 70--90% are transition bands, not forced labels.
    return None


def _required(row: dict[str, str], name: str, line: int) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise ValueError(f"manifest line {line}: missing {name}")
    return value


def load_manifest(manifest: Path, audio_root: Path) -> tuple[list[Capture], list[str]]:
    """Load shake rows and report rows that cannot be used without guessing."""
    captures: list[Capture] = []
    diagnostics: list[str] = []
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {
            "recording_id",
            "session_id",
            "container_id",
            "device_id",
            "capacity_ml",
            "water_ml",
            "action",
            "audio_filename",
        }
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("manifest is missing columns: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            action = row.get("action", "").strip().lower()
            if action != "shake":
                continue
            try:
                capacity = float(_required(row, "capacity_ml", line))
                water = float(_required(row, "water_ml", line))
                if capacity <= 0 or water < 0 or water > capacity:
                    raise ValueError("capacity/water values are out of range")
                audio = audio_root / _required(row, "audio_filename", line)
                if not audio.is_file():
                    raise ValueError(f"audio file not found: {audio}")
                captures.append(
                    Capture(
                        recording_id=_required(row, "recording_id", line),
                        session_id=_required(row, "session_id", line),
                        container_id=_required(row, "container_id", line),
                        device_id=_required(row, "device_id", line),
                        capacity_ml=capacity,
                        water_ml=water,
                        action=action,
                        path=audio,
                    )
                )
            except ValueError as error:
                diagnostics.append(str(error))
    return captures, diagnostics


def validate_dataset(captures: list[Capture]) -> dict:
    """Return counts and raise when a trustworthy pilot cannot be evaluated."""
    if not captures:
        raise ValueError("no shake recordings found; collect rows with action=shake")

    levels = {capture.recording_id: level_index(capture.ratio) for capture in captures}
    transitions = [capture.recording_id for capture in captures if levels[capture.recording_id] is None]
    usable = [capture for capture in captures if levels[capture.recording_id] is not None]
    counts = Counter(levels[capture.recording_id] for capture in usable)
    sessions_by_level: dict[int, set[str]] = defaultdict(set)
    for capture in usable:
        sessions_by_level[levels[capture.recording_id]].add(capture.session_id)  # type: ignore[index]

    report = {
        "totalShakeRows": len(captures),
        "usableRows": len(usable),
        "transitionRows": len(transitions),
        "transitionRecordingIds": transitions,
        "classCounts": {LEVEL_NAMES[index]: counts[index] for index in range(3)},
        "sessionsPerClass": {
            LEVEL_NAMES[index]: len(sessions_by_level[index]) for index in range(3)
        },
        "containerCount": len({capture.container_id for capture in usable}),
        "deviceCount": len({capture.device_id for capture in usable}),
    }
    missing = [LEVEL_NAMES[index] for index in range(3) if counts[index] == 0]
    if missing:
        raise ValueError(
            "cannot train: missing class(es) "
            + ", ".join(missing)
            + "; class counts="
            + json.dumps(report["classCounts"], ensure_ascii=False)
        )
    sparse = [LEVEL_NAMES[index] for index in range(3) if counts[index] < 2]
    if sparse:
        raise ValueError(
            "cannot evaluate: need at least 2 recordings per class; sparse="
            + ", ".join(sparse)
        )
    split_sparse = [
        LEVEL_NAMES[index] for index in range(3) if len(sessions_by_level[index]) < 2
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


def _recording_arrays(
    captures: list[Capture], feature_cache: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([feature_cache[item.recording_id] for item in captures])
    labels = np.concatenate(
        [
            np.full(
                len(feature_cache[item.recording_id]),
                level_index(item.ratio),
                dtype=np.int64,
            )
            for item in captures
        ]
    )
    weights = np.concatenate(
        [
            np.full(len(feature_cache[item.recording_id]), 1.0 / len(feature_cache[item.recording_id]))
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
        if {level_index(item.ratio) for item in train} != set(classes):
            raise ValueError(
                f"session {held_out_session!r} leaves a training fold without all 3 classes"
            )
        x_train, y_train, weights = _recording_arrays(train, feature_cache)
        # Python's built-in hash is randomized between processes; crc32 keeps
        # the evaluation deterministic when the same manifest is rerun.
        seed = zlib.crc32(held_out_session.encode("utf-8")) & 0xFFFF
        classifier = SoftmaxClassifier(classes, seed=seed)
        classifier.fit(x_train, y_train, weights)
        for item in test:
            probabilities = classifier.predict_proba(feature_cache[item.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = int(level_index(item.ratio))
            true.append(actual)
            predicted.append(estimate)
            predictions.append(
                {
                    "recordingId": item.recording_id,
                    "heldOutSession": held_out_session,
                    "actual": LEVEL_NAMES[actual],
                    "predicted": LEVEL_NAMES[estimate],
                    "probabilities": probabilities.round(6).tolist(),
                }
            )
    result = metrics(true, predicted, classes)
    result["classes"] = list(LEVEL_NAMES)
    result["predictions"] = predictions
    return result


def train(manifest: Path, audio_root: Path, output: Path | None) -> dict:
    captures, diagnostics = load_manifest(manifest, audio_root)
    report = validate_dataset(captures)
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    feature_cache = {
        item.recording_id: features_for(item, filters) for item in captures
    }
    evaluation = evaluate(captures, feature_cache)
    x, y, weights = _recording_arrays(captures, feature_cache)
    classifier = SoftmaxClassifier([0, 1, 2], seed=7)
    classifier.fit(x, y, weights)
    artifact = {
        "version": 1,
        "task": "shake_fill_level",
        "classes": list(LEVEL_NAMES),
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "featureSize": 128,
        "model": classifier.serializable("shake_fill_level"),
        "dataset": report,
        "evaluation": evaluation,
        "warnings": [
            "Pilot only: use a new session for every phone/room/operator change.",
            "Classifies broad fill bands; it does not estimate arbitrary mL.",
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
        print(f"SHAKE PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "shake_fill_level: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balanced_accuracy']:.3f}, "
        f"macro_f1={evaluation['macro_f1']:.3f}, "
        f"n={evaluation['recordings']}"
    )
    if arguments.output:
        print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
