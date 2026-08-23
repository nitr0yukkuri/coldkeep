"""Train a small, auditable shake-vs-pour action model.

This is the first trainable gate for ColdKeep's shake path.  It uses the
21 recordings checked into ACM-S2, with the two recordings documented as
shaking a muesli box and the remaining 19 documented as pouring.  It is not a
fill-level model and it is intentionally emitted as ``experimental`` because
the data has one room, one microphone setup, one subject, and no phone or
water-bottle recordings.

The action mapping is supplied as a separate CSV rather than inferred from a
filename.  This makes the small external corpus auditable and prevents a
pour-only file from silently entering the shake class.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
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


ACTION_NAMES = ("pour", "shake")
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "dataset" / "external" / "acm-s2"
DEFAULT_LABELS = (
    ROOT / "dataset" / "derived" / "acm-s2-shake-action" / "action_labels.csv"
)
DEFAULT_OUTPUT = ROOT / "ml" / "artifacts" / "shake_action_pilot.json"


@dataclass(frozen=True)
class Recording:
    recording_id: int
    action: str
    container_id: int
    path: Path

    @property
    def action_index(self) -> int:
        return ACTION_NAMES.index(self.action)


def load_action_labels(path: Path) -> dict[int, str]:
    """Read the explicit action mapping and reject ambiguous rows."""

    result: dict[int, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"recording_id", "action", "label_source"}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("action map is missing columns: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            raw_id = (row.get("recording_id") or "").strip()
            action = (row.get("action") or "").strip().lower()
            source = (row.get("label_source") or "").strip()
            if not raw_id or not source:
                raise ValueError(f"action map line {line} is missing an id or source")
            try:
                recording_id = int(raw_id)
            except ValueError as error:
                raise ValueError(f"action map line {line} has invalid id {raw_id!r}") from error
            if action not in ACTION_NAMES:
                raise ValueError(f"action map line {line} has unsupported action {action!r}")
            if recording_id in result:
                raise ValueError(f"action map contains duplicate id {recording_id}")
            result[recording_id] = action
    return result


def load_recordings(data_directory: Path, labels_path: Path) -> list[Recording]:
    """Join ACM-S2 annotations, audio files, and the explicit action map."""

    annotations_path = data_directory / "acm_s2_annotations.json"
    with annotations_path.open(encoding="utf-8") as stream:
        metadata = json.load(stream)
    audio_names = {item["audio_id"]: item["filename"] for item in metadata["audios"]}
    labels = load_action_labels(labels_path)
    annotation_ids = {int(item["id"]) for item in metadata["annotations"]}
    if set(labels) != annotation_ids:
        missing = sorted(annotation_ids - set(labels))
        extra = sorted(set(labels) - annotation_ids)
        raise ValueError(f"action map/annotations mismatch: missing={missing}, extra={extra}")

    recordings: list[Recording] = []
    for annotation in metadata["annotations"]:
        recording_id = int(annotation["id"])
        path = data_directory / "acm_s2_audio" / audio_names[recording_id]
        if not path.is_file():
            raise FileNotFoundError(f"audio file not found for recording {recording_id}: {path}")
        recordings.append(
            Recording(
                recording_id=recording_id,
                action=labels[recording_id],
                container_id=int(annotation["containerID"]),
                path=path,
            )
        )
    return recordings


def recording_features(recording: Recording, filters: np.ndarray) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(recording.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    windows = segment_audio(waveform)
    return np.stack([extract_features(window, filters=filters) for window in windows])


def recording_arrays(
    recordings: list[Recording], cache: dict[int, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    recordings_per_action = Counter(item.action_index for item in recordings)
    features = np.concatenate([cache[item.recording_id] for item in recordings])
    labels = np.concatenate(
        [
            np.full(len(cache[item.recording_id]), item.action_index, dtype=np.int64)
            for item in recordings
        ]
    )
    weights = np.concatenate(
        [
            np.full(
                len(cache[item.recording_id]),
                1.0
                / (
                    recordings_per_action[item.action_index]
                    * len(cache[item.recording_id])
                ),
            )
            for item in recordings
        ]
    )
    return features, labels, weights


def evaluate(
    recordings: list[Recording], cache: dict[int, np.ndarray]
) -> dict:
    """Evaluate with recording-held-out folds, not overlapping audio windows."""

    true: list[int] = []
    predicted: list[int] = []
    predictions: list[dict] = []
    for held_out in recordings:
        train = [item for item in recordings if item.recording_id != held_out.recording_id]
        if {item.action_index for item in train} != {0, 1}:
            raise ValueError(
                "leave-one-recording-out fold lost a class; at least two recordings "
                "per action are required"
            )
        x_train, y_train, weights = recording_arrays(train, cache)
        classifier = SoftmaxClassifier([0, 1], seed=held_out.recording_id)
        classifier.fit(x_train, y_train, weights)
        probabilities = classifier.predict_proba(cache[held_out.recording_id]).mean(axis=0)
        estimate = int(classifier.classes[np.argmax(probabilities)])
        actual = held_out.action_index
        true.append(actual)
        predicted.append(estimate)
        predictions.append(
            {
                "recordingId": held_out.recording_id,
                "actual": ACTION_NAMES[actual],
                "predicted": ACTION_NAMES[estimate],
                "probabilities": probabilities.round(6).tolist(),
            }
        )
    result = metrics(true, predicted, [0, 1])
    result["classes"] = list(ACTION_NAMES)
    result["predictions"] = predictions
    return result


def train(data_directory: Path, labels_path: Path, output: Path | None) -> dict:
    recordings = load_recordings(data_directory, labels_path)
    counts = Counter(item.action for item in recordings)
    if any(counts[action] < 2 for action in ACTION_NAMES):
        raise ValueError(f"need at least two recordings per action; counts={dict(counts)}")

    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    cache = {
        item.recording_id: recording_features(item, filters) for item in recordings
    }
    evaluation = evaluate(recordings, cache)
    features, labels, weights = recording_arrays(recordings, cache)
    classifier = SoftmaxClassifier([0, 1], seed=7)
    classifier.fit(features, labels, weights)

    artifact = {
        "version": 1,
        "task": "shake_action",
        "status": "experimental",
        "classes": list(ACTION_NAMES),
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "featureSize": 128,
        "model": classifier.serializable("shake_action"),
        "dataset": {
            "source": "ACM-S2",
            "totalRecordings": len(recordings),
            "classCounts": {action: counts[action] for action in ACTION_NAMES},
            "containerIds": sorted({item.container_id for item in recordings}),
            "shakeContainerIds": sorted(
                {item.container_id for item in recordings if item.action == "shake"}
            ),
            "labelMap": str(labels_path),
        },
        "evaluation": evaluation,
        "warnings": [
            "Experimental action gate only; this is not a fill-level or millilitre model.",
            "ACM-S2 has only two shake recordings, both from one muesli box/session.",
            "The microphone, room, subject, and container differ from a phone and water bottle.",
            "Recording-held-out scores must not be presented as product accuracy.",
        ],
    }
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--labels", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    try:
        artifact = train(arguments.data, arguments.labels, arguments.output)
    except (FileNotFoundError, ValueError) as error:
        print(f"SHAKE ACTION PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "shake_action: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balanced_accuracy']:.3f}, "
        f"macro_f1={evaluation['macro_f1']:.3f}, "
        f"n={evaluation['recordings']}"
    )
    print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
