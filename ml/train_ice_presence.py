"""Train the paired ice-present/ice-absent baseline from ColdKeep captures.

The public ACM-S2 corpus has no ice label, so this task intentionally reads the
app's collection manifest.  It refuses to train until both classes are present
and reports the number of unique containers; a split by container is the
minimum useful check against a microphone/container shortcut.
"""

from __future__ import annotations

import argparse
import csv
import json
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


@dataclass(frozen=True)
class Capture:
    recording_id: str
    container_id: str
    ice_presence: int
    path: Path


def load_manifest(manifest: Path, audio_root: Path | None) -> list[Capture]:
    root = audio_root or manifest.parent
    captures: list[Capture] = []
    with manifest.open(newline="", encoding="utf-8-sig") as stream:
        for row in csv.DictReader(stream):
            filename = row.get("audio_filename", "").strip()
            if not filename:
                continue
            captures.append(
                Capture(
                    recording_id=row.get("recording_id", "unknown"),
                    container_id=row.get("container_id", "unknown"),
                    ice_presence=int(float(row.get("ice_count", "0") or 0) > 0),
                    path=root / filename,
                )
            )
    if not captures:
        raise ValueError("manifest has no rows with audio_filename")
    return captures


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


def metrics(captures: list[Capture], cache: dict[str, np.ndarray], classifier: SoftmaxClassifier) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    for capture in captures:
        probabilities = classifier.predict_proba(cache[capture.recording_id]).mean(axis=0)
        predicted.append(int(classifier.classes[np.argmax(probabilities)]))
        true.append(capture.ice_presence)
    matrix = [[0, 0], [0, 0]]
    for actual, estimate in zip(true, predicted):
        matrix[actual][estimate] += 1
    return {
        "recordings": len(captures),
        "correct": sum(actual == estimate for actual, estimate in zip(true, predicted)),
        "accuracy": float(np.mean(np.asarray(true) == np.asarray(predicted))),
        "classes": [0, 1],
        "confusion_matrix": matrix,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument(
        "--audio-root",
        type=Path,
        help="directory containing the manifest's audio_filename paths; defaults to manifest directory",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    captures = load_manifest(arguments.manifest, arguments.audio_root)
    labels = {capture.ice_presence for capture in captures}
    if labels != {0, 1}:
        raise ValueError(
            "ice_presence needs both classes (ice_count=0 and ice_count>0); "
            f"received classes {sorted(labels)}"
        )
    missing = [capture.path for capture in captures if not capture.path.exists()]
    if missing:
        raise FileNotFoundError(f"missing audio file: {missing[0]}")

    cache = feature_cache(captures)
    features = np.concatenate([cache[capture.recording_id] for capture in captures])
    labels_array = np.concatenate(
        [np.full(len(cache[capture.recording_id]), capture.ice_presence) for capture in captures]
    )
    weights = np.concatenate(
        [
            np.full(len(cache[capture.recording_id]), 1.0 / len(cache[capture.recording_id]))
            for capture in captures
        ]
    )
    classifier = SoftmaxClassifier([0, 1], seed=19)
    classifier.fit(features, labels_array, weights)

    artifact = {
        "version": 1,
        "task": "ice_presence",
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "melBins": 32,
        "featureSize": 128,
        "models": {"ice_presence": classifier.serializable("ice_presence")},
        "data": {
            "recordings": len(captures),
            "containers": len({capture.container_id for capture in captures}),
            "class_counts": {
                str(label): sum(capture.ice_presence == label for capture in captures)
                for label in (0, 1)
            },
            "warning": "training-only baseline; evaluate on a held-out container before product use",
        },
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(artifact, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(metrics(captures, cache, classifier), indent=2))
    print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
