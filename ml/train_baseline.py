"""Train honest, container-held-out baselines on the local ACM-S2 dataset."""

from __future__ import annotations

import argparse
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


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "dataset" / "external" / "acm-s2"
DEFAULT_OUTPUT = ROOT / "ml" / "artifacts"


@dataclass(frozen=True)
class Recording:
    recording_id: int
    container_id: int
    filling_type: int
    filling_level: int
    path: Path


class SoftmaxClassifier:
    """Small weighted linear model with Adam optimization."""

    def __init__(self, classes: list[int], seed: int = 7):
        self.classes = np.asarray(classes, dtype=np.int64)
        self.mean: np.ndarray | None = None
        self.scale: np.ndarray | None = None
        self.weights: np.ndarray | None = None
        self.bias: np.ndarray | None = None
        self.seed = seed

    def fit(
        self,
        features: np.ndarray,
        labels: np.ndarray,
        sample_weights: np.ndarray,
        epochs: int = 1_500,
        learning_rate: float = 0.025,
        l2: float = 0.02,
    ) -> None:
        self.mean = features.mean(axis=0)
        self.scale = features.std(axis=0)
        normalized = (features - self.mean) / np.maximum(self.scale, 1e-5)
        targets = np.searchsorted(self.classes, labels)
        one_hot = np.eye(len(self.classes))[targets]
        sample_weights = sample_weights / sample_weights.sum()

        generator = np.random.default_rng(self.seed)
        self.weights = generator.normal(
            0.0, 0.01, size=(features.shape[1], len(self.classes))
        )
        self.bias = np.zeros(len(self.classes), dtype=np.float64)
        first_w = np.zeros_like(self.weights)
        second_w = np.zeros_like(self.weights)
        first_b = np.zeros_like(self.bias)
        second_b = np.zeros_like(self.bias)

        for step in range(1, epochs + 1):
            logits = normalized @ self.weights + self.bias
            logits -= logits.max(axis=1, keepdims=True)
            probabilities = np.exp(logits)
            probabilities /= probabilities.sum(axis=1, keepdims=True)
            error = (probabilities - one_hot) * sample_weights[:, None]
            gradient_w = normalized.T @ error + l2 * self.weights
            gradient_b = error.sum(axis=0)

            first_w = 0.9 * first_w + 0.1 * gradient_w
            second_w = 0.999 * second_w + 0.001 * gradient_w**2
            first_b = 0.9 * first_b + 0.1 * gradient_b
            second_b = 0.999 * second_b + 0.001 * gradient_b**2
            correction_1 = 1.0 - 0.9**step
            correction_2 = 1.0 - 0.999**step
            self.weights -= learning_rate * (first_w / correction_1) / (
                np.sqrt(second_w / correction_2) + 1e-8
            )
            self.bias -= learning_rate * (first_b / correction_1) / (
                np.sqrt(second_b / correction_2) + 1e-8
            )

    def predict_proba(self, features: np.ndarray) -> np.ndarray:
        if any(value is None for value in (self.mean, self.scale, self.weights, self.bias)):
            raise RuntimeError("classifier is not fitted")
        normalized = (features - self.mean) / np.maximum(self.scale, 1e-5)
        logits = normalized @ self.weights + self.bias
        logits -= logits.max(axis=1, keepdims=True)
        probabilities = np.exp(logits)
        return probabilities / probabilities.sum(axis=1, keepdims=True)

    def save(self, path: Path, task: str) -> None:
        np.savez_compressed(
            path,
            task=np.asarray(task),
            classes=self.classes,
            feature_mean=self.mean,
            feature_scale=self.scale,
            weights=self.weights,
            bias=self.bias,
            sample_rate=np.asarray(TARGET_SAMPLE_RATE),
            window_seconds=np.asarray(1.0),
        )

    def serializable(self, task: str) -> dict:
        if any(value is None for value in (self.mean, self.scale, self.weights, self.bias)):
            raise RuntimeError("classifier is not fitted")
        return {
            "task": task,
            "classes": self.classes.tolist(),
            "featureMean": self.mean.tolist(),
            "featureScale": self.scale.tolist(),
            "weights": self.weights.tolist(),
            "bias": self.bias.tolist(),
        }


def load_recordings(data_directory: Path) -> list[Recording]:
    annotations_path = data_directory / "acm_s2_annotations.json"
    with annotations_path.open(encoding="utf-8") as stream:
        metadata = json.load(stream)
    audio_names = {item["audio_id"]: item["filename"] for item in metadata["audios"]}
    return [
        Recording(
            recording_id=item["id"],
            container_id=item["containerID"],
            filling_type=item["filling_type"],
            filling_level=item["filling_level"],
            path=data_directory / "acm_s2_audio" / audio_names[item["id"]],
        )
        for item in metadata["annotations"]
    ]


def recording_features(recording: Recording, filters: np.ndarray) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(recording.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    windows = segment_audio(waveform)
    return np.stack([extract_features(window, filters=filters) for window in windows])


def task_recordings(recordings: list[Recording], task: str) -> list[Recording]:
    if task == "fill_level_water":
        return [item for item in recordings if item.filling_type == 3]
    if task in ("content_type", "water_presence"):
        # Container 19 is a muesli box manipulated by shaking, whereas the
        # three cups/glasses are pouring recordings. Excluding it prevents the
        # classifier from using action type as a shortcut for content type.
        return [
            item
            for item in recordings
            if item.filling_type in (1, 2, 3) and item.container_id != 19
        ]
    raise ValueError(f"unknown task: {task}")


def task_label(recording: Recording, task: str) -> int:
    if task == "fill_level_water":
        return recording.filling_level
    if task == "water_presence":
        return int(recording.filling_type == 3)
    return recording.filling_type


def metrics(true: list[int], predicted: list[int], classes: list[int]) -> dict:
    confusion = np.zeros((len(classes), len(classes)), dtype=np.int64)
    indices = {label: index for index, label in enumerate(classes)}
    for actual, estimate in zip(true, predicted):
        confusion[indices[actual], indices[estimate]] += 1
    recalls = []
    f1_scores = []
    for index in range(len(classes)):
        tp = confusion[index, index]
        fp = confusion[:, index].sum() - tp
        fn = confusion[index, :].sum() - tp
        recall = tp / max(tp + fn, 1)
        precision = tp / max(tp + fp, 1)
        recalls.append(recall)
        f1_scores.append(2 * precision * recall / max(precision + recall, 1e-12))
    correct = int(np.sum(np.asarray(true) == np.asarray(predicted)))
    sample_count = len(true)
    accuracy = correct / max(sample_count, 1)
    z = 1.959963984540054
    denominator = 1.0 + z**2 / sample_count
    center = (accuracy + z**2 / (2 * sample_count)) / denominator
    margin = (
        z
        * np.sqrt(
            accuracy * (1 - accuracy) / sample_count
            + z**2 / (4 * sample_count**2)
        )
        / denominator
    )
    majority_count = max(true.count(label) for label in classes)
    return {
        "recordings": len(true),
        "correct": correct,
        "accuracy": float(accuracy),
        "accuracy_wilson_95": [float(center - margin), float(center + margin)],
        "majority_baseline_accuracy": float(majority_count / sample_count),
        "balanced_accuracy": float(np.mean(recalls)),
        "macro_f1": float(np.mean(f1_scores)),
        "confusion_matrix": confusion.tolist(),
    }


def train_arrays(
    selected: list[Recording],
    cache: dict[int, np.ndarray],
    task: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([cache[item.recording_id] for item in selected])
    labels = np.concatenate(
        [
            np.full(len(cache[item.recording_id]), task_label(item, task))
            for item in selected
        ]
    )
    weights = np.concatenate(
        [
            np.full(len(cache[item.recording_id]), 1.0 / len(cache[item.recording_id]))
            for item in selected
        ]
    )
    return features, labels, weights


def evaluate_task(
    recordings: list[Recording],
    cache: dict[int, np.ndarray],
    task: str,
) -> dict:
    selected = task_recordings(recordings, task)
    classes = sorted({task_label(item, task) for item in selected})
    true: list[int] = []
    predicted: list[int] = []
    predictions = []

    for held_out_container in sorted({item.container_id for item in selected}):
        train = [item for item in selected if item.container_id != held_out_container]
        test = [item for item in selected if item.container_id == held_out_container]
        if set(task_label(item, task) for item in train) != set(classes):
            continue
        x_train, y_train, train_weights = train_arrays(train, cache, task)
        classifier = SoftmaxClassifier(classes, seed=held_out_container)
        classifier.fit(x_train, y_train, train_weights)
        for recording in test:
            probabilities = classifier.predict_proba(cache[recording.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = task_label(recording, task)
            true.append(actual)
            predicted.append(estimate)
            predictions.append(
                {
                    "recording_id": recording.recording_id,
                    "held_out_container": held_out_container,
                    "actual": actual,
                    "predicted": estimate,
                    "probabilities": probabilities.round(6).tolist(),
                }
            )

    result = metrics(true, predicted, classes)
    result.update({"classes": classes, "predictions": predictions})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    recordings = load_recordings(arguments.data)
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    cache = {
        recording.recording_id: recording_features(recording, filters)
        for recording in recordings
    }
    task_results = {
        task: evaluate_task(recordings, cache, task)
        for task in ("fill_level_water", "water_presence", "content_type")
    }

    arguments.output.mkdir(parents=True, exist_ok=True)
    deployable_models = {}
    for task in task_results:
        selected = task_recordings(recordings, task)
        classes = sorted({task_label(item, task) for item in selected})
        features, labels, weights = train_arrays(selected, cache, task)
        classifier = SoftmaxClassifier(classes)
        classifier.fit(features, labels, weights)
        classifier.save(arguments.output / f"{task}_baseline.npz", task)
        deployable_models[task] = classifier.serializable(task)

    (arguments.output / "public_audio_baseline.json").write_text(
        json.dumps(
            {
                "version": 1,
                "sampleRate": TARGET_SAMPLE_RATE,
                "windowSamples": TARGET_SAMPLE_RATE,
                "hopSamples": TARGET_SAMPLE_RATE // 2,
                "melBins": 32,
                "featureSize": 128,
                "models": deployable_models,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    report = {
        "dataset": "ACM-S2",
        "evaluation": "leave-one-container-out; probabilities averaged per recording",
        "feature": "1 s gain-normalized log-mel summary, 0.5 s hop",
        "warning": "ACM-S2 is a 21-recording external validation set, not a training corpus.",
        "tasks": task_results,
    }
    report_path = arguments.output / "baseline_metrics.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    for task, result in task_results.items():
        print(
            f"{task}: accuracy={result['accuracy']:.3f}, "
            f"balanced_accuracy={result['balanced_accuracy']:.3f}, "
            f"macro_f1={result['macro_f1']:.3f}, n={result['recordings']}"
        )
    print(f"wrote {report_path}")


if __name__ == "__main__":
    main()
