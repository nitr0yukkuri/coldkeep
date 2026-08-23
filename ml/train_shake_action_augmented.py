"""Train the expanded experimental shake-action gate.

The local ACM-S2 corpus contains only two shake recordings.  This trainer
adds *positive shake examples only* from the open EPFL Multimodal Sensory
Learning feature cache and keeps the 19 ACM-S2 pours as the local negative
class.  The external recordings are robot/container audio, not phone or
water-bottle audio, so the emitted artifact is permanently marked
``experimental``.  It is a research pre-training comparison, not a product
accuracy claim.

The external cache is intentionally a derived feature file rather than raw
audio.  ``ml/import_mml_shake.py`` creates it from the source archive when the
optional ``rosbags`` and ``av`` packages are available.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np

from audio_features import (
    TARGET_SAMPLE_RATE,
    TRANSIENT_FEATURE_NAMES,
    extract_transient_features,
    read_pcm16_wav,
    resample,
    segment_audio,
)
from train_baseline import SoftmaxClassifier, metrics
from train_shake_action import (
    ACTION_NAMES,
    DEFAULT_DATA,
    DEFAULT_LABELS,
    Recording,
    load_recordings,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "ml" / "artifacts" / "shake_action_augmented.json"
# Keep target-domain ACM-S2 examples four times heavier than the external
# robot-shake positives. This is a fixed domain-adaptation prior, not a value
# selected from the held-out fold.
EXTERNAL_POSITIVE_WEIGHT = 0.25


def local_recording_features(recording: Recording) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(recording.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    return np.stack(
        [extract_transient_features(window) for window in segment_audio(waveform)]
    )


def load_external_features(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Load positive transient features and preserve one group per source bag."""

    with np.load(path, allow_pickle=False) as archive:
        required = {"transient_features", "labels", "groups"}
        missing = sorted(required - set(archive.files))
        if missing:
            raise ValueError("external feature cache is missing: " + ", ".join(missing))
        features = np.asarray(archive["transient_features"], dtype=np.float32)
        labels = np.asarray(archive["labels"], dtype=np.int64)
        groups = np.asarray(archive["groups"])

    if features.ndim != 2 or features.shape[1] != len(TRANSIENT_FEATURE_NAMES):
        raise ValueError(
            "external transient feature shape must be "
            f"(n, {len(TRANSIENT_FEATURE_NAMES)}), got {features.shape}"
        )
    if len(features) != len(labels) or len(features) != len(groups):
        raise ValueError("external features, labels, and groups must have equal length")
    if not len(features):
        raise ValueError("external feature cache is empty")
    if set(labels.tolist()) != {1}:
        raise ValueError("external cache must contain shake positives only (label 1)")
    if any(not str(group) for group in groups):
        raise ValueError("external cache contains an empty source group")
    if not np.isfinite(features).all():
        raise ValueError("external cache contains non-finite features")
    return features, groups.astype(str)


def _external_by_group(features: np.ndarray, groups: np.ndarray) -> dict[str, np.ndarray]:
    return {group: features[groups == group] for group in sorted(set(groups.tolist()))}


def training_arrays(
    recordings: list[Recording],
    cache: dict[int, np.ndarray],
    external: dict[str, np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build class-balanced windows while keeping external bags as groups."""

    class_recordings = Counter(item.action_index for item in recordings)
    feature_rows: list[np.ndarray] = []
    label_rows: list[np.ndarray] = []
    weight_rows: list[np.ndarray] = []
    for item in recordings:
        values = cache[item.recording_id]
        feature_rows.append(values)
        label_rows.append(np.full(len(values), item.action_index, dtype=np.int64))
        weight_rows.append(
            np.full(
                len(values),
                1.0 / (class_recordings[item.action_index] * len(values)),
            )
        )
    for values in external.values():
        feature_rows.append(values)
        label_rows.append(np.ones(len(values), dtype=np.int64))
        weight_rows.append(
            np.full(
                len(values),
                EXTERNAL_POSITIVE_WEIGHT / (len(external) * len(values)),
            )
        )
    return (
        np.concatenate(feature_rows),
        np.concatenate(label_rows),
        np.concatenate(weight_rows),
    )


def evaluate(
    recordings: list[Recording],
    cache: dict[int, np.ndarray],
    external: dict[str, np.ndarray],
) -> dict:
    """Hold out each ACM-S2 recording; external bags are training-only."""

    true: list[int] = []
    predicted: list[int] = []
    probabilities: list[list[float]] = []
    predictions: list[dict] = []
    for held_out in recordings:
        train = [item for item in recordings if item.recording_id != held_out.recording_id]
        x_train, y_train, weights = training_arrays(train, cache, external)
        classifier = SoftmaxClassifier([0, 1], seed=held_out.recording_id)
        classifier.fit(x_train, y_train, weights, epochs=2_000)
        mean_probability = classifier.predict_proba(cache[held_out.recording_id]).mean(axis=0)
        estimate = int(classifier.classes[np.argmax(mean_probability)])
        actual = held_out.action_index
        true.append(actual)
        predicted.append(estimate)
        probabilities.append(mean_probability.tolist())
        predictions.append(
            {
                "recordingId": held_out.recording_id,
                "actual": ACTION_NAMES[actual],
                "predicted": ACTION_NAMES[estimate],
                "probabilities": np.round(mean_probability, 6).tolist(),
            }
        )
    result = metrics(true, predicted, [0, 1])
    result.update(
        {
            "classes": list(ACTION_NAMES),
            "predictions": predictions,
            "operatingPoints": {
                str(threshold): _threshold_metrics(true, probabilities, threshold)
                for threshold in (0.5, 0.6)
            },
        }
    )
    return result


def _threshold_metrics(
    true: list[int], probabilities: list[list[float]], threshold: float
) -> dict:
    predicted = [int(probability[1] >= threshold) for probability in probabilities]
    result = metrics(true, predicted, [0, 1])
    return {
        "accuracy": result["accuracy"],
        "balancedAccuracy": result["balanced_accuracy"],
        "macroF1": result["macro_f1"],
        "shakePrecision": result["precision"]["1"],
        "shakeRecall": result["recall"]["1"],
        "falsePositivePourCount": result["confusion_matrix"][0][1],
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def train(
    data_directory: Path,
    labels_path: Path,
    external_path: Path,
    output: Path | None,
) -> dict:
    recordings = load_recordings(data_directory, labels_path)
    external_features, external_groups = load_external_features(external_path)
    external = _external_by_group(external_features, external_groups)
    cache = {item.recording_id: local_recording_features(item) for item in recordings}
    evaluation = evaluate(recordings, cache, external)
    features, labels, weights = training_arrays(recordings, cache, external)
    classifier = SoftmaxClassifier([0, 1], seed=7)
    classifier.fit(features, labels, weights, epochs=2_000)
    counts = Counter(item.action for item in recordings)
    artifact = {
        "version": 1,
        "task": "shake_action",
        "status": "experimental",
        "featureMode": "transient",
        "featureNames": list(TRANSIENT_FEATURE_NAMES),
        "classes": list(ACTION_NAMES),
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "featureSize": len(TRANSIENT_FEATURE_NAMES),
        "model": classifier.serializable("shake_action_transient"),
        "dataset": {
            "localSource": "ACM-S2",
            "localRecordings": len(recordings),
            "localClassCounts": {action: counts[action] for action in ACTION_NAMES},
            "externalSource": "EPFL Multimodal Sensory Learning (Zenodo 6372438)",
            "externalRecordings": len(external),
            "externalWindows": len(external_features),
            "externalPositiveWeight": EXTERNAL_POSITIVE_WEIGHT,
            "externalFeatureCache": str(external_path),
            "externalFeatureCacheSha256": _sha256(external_path),
            "externalLicenseStatus": "review_required",
        },
        "evaluation": evaluation,
        "warnings": [
            "Experimental action gate only; this is not a fill-level or millilitre model.",
            "External positives are robot-mounted microphone recordings of a plastic container.",
            "ACM-S2 negatives are 19 pours from a different room and microphone setup.",
            "The model has no phone, water-bottle, or user-recorded validation fold.",
            "The Zenodo record does not state a redistributable license; review terms before sharing derived data or weights.",
            "Recording-held-out scores must not be presented as product accuracy.",
            "A real ColdKeep collection should retrain with phone recordings before deployment.",
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
    parser.add_argument("--external-features", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    try:
        artifact = train(
            arguments.data,
            arguments.labels,
            arguments.external_features,
            arguments.output,
        )
    except (FileNotFoundError, ValueError) as error:
        print(f"AUGMENTED SHAKE ACTION BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "shake_action_augmented: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balanced_accuracy']:.3f}, "
        f"macro_f1={evaluation['macro_f1']:.3f}, "
        f"shake_recall={evaluation['recall']['1']:.3f}, "
        f"n={evaluation['recordings']}"
    )
    print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
