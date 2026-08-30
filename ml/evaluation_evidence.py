"""Evidence metrics for leakage-safe recording-level audio evaluation.

The production contract keeps an explicit ``unknown``/``未判定`` path.  A
plain accuracy number therefore is not enough: we also need to know how often
the model would abstain at the runtime confidence threshold and how reliable
the remaining predictions are.  This module intentionally contains no model
training and never changes a deployment decision by itself.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from train_baseline import metrics


DEFAULT_CONFIDENCE_THRESHOLDS = (0.55, 0.65, 0.75)


def _validated_probabilities(
    probabilities: Sequence[Sequence[float]],
    sample_count: int,
    class_count: int,
) -> np.ndarray:
    values = np.asarray(probabilities, dtype=np.float64)
    if values.shape != (sample_count, class_count):
        raise ValueError(
            "probabilities must have shape "
            f"({sample_count}, {class_count}), got {values.shape}"
        )
    if not np.all(np.isfinite(values)) or np.any(values < 0):
        raise ValueError("probabilities must be finite and non-negative")
    row_sums = values.sum(axis=1)
    if not np.allclose(row_sums, 1.0, atol=1e-5):
        raise ValueError("probability rows must sum to one")
    return values


def _bootstrap_intervals(
    true: list[int],
    predicted: list[int],
    classes: list[int],
    seed: int,
    samples: int,
) -> dict[str, object]:
    if samples <= 0:
        return {"samples": 0}
    rng = np.random.default_rng(seed)
    size = len(true)
    balanced: list[float] = []
    macro_f1: list[float] = []
    for _ in range(samples):
        indices = rng.integers(0, size, size=size)
        result = metrics(
            [true[index] for index in indices],
            [predicted[index] for index in indices],
            classes,
        )
        balanced.append(float(result["balanced_accuracy"]))
        macro_f1.append(float(result["macro_f1"]))
    return {
        "samples": samples,
        "balancedAccuracy95": [
            float(np.percentile(balanced, 2.5)),
            float(np.percentile(balanced, 97.5)),
        ],
        "macroF195": [
            float(np.percentile(macro_f1, 2.5)),
            float(np.percentile(macro_f1, 97.5)),
        ],
    }


def _selective_metrics(
    true: list[int],
    predicted: list[int],
    confidence: np.ndarray,
    classes: list[int],
    thresholds: Sequence[float],
) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for threshold in thresholds:
        if not np.isfinite(threshold) or not 0 < threshold < 1:
            raise ValueError("confidence thresholds must be finite values in (0, 1)")
        accepted = confidence >= threshold
        indices = np.flatnonzero(accepted)
        key = f"{float(threshold):.2f}"
        entry: dict[str, object] = {
            "threshold": float(threshold),
            "accepted": int(len(indices)),
            "abstained": int(len(confidence) - len(indices)),
            "coverage": float(len(indices) / max(len(confidence), 1)),
        }
        if len(indices):
            entry.update(
                metrics(
                    [true[index] for index in indices],
                    [predicted[index] for index in indices],
                    classes,
                )
            )
        else:
            entry["status"] = "no_accepted_predictions"
        result[key] = entry
    return result


def evidence_metrics(
    true: list[int],
    predicted: list[int],
    probabilities: Sequence[Sequence[float]],
    classes: list[int],
    *,
    confidence_thresholds: Sequence[float] = DEFAULT_CONFIDENCE_THRESHOLDS,
    bootstrap_samples: int = 200,
    seed: int = 7,
) -> dict[str, object]:
    """Return calibration, abstention, and uncertainty evidence.

    Inputs are recording-level predictions, not individual overlapping
    windows.  The function is deliberately deterministic for a fixed seed so
    reports can be regenerated and reviewed in CI.
    """
    if len(true) != len(predicted) or len(true) != len(probabilities):
        raise ValueError("true, predicted, and probabilities must be aligned")
    if not true:
        raise ValueError("evidence evaluation produced no recordings")
    values = _validated_probabilities(probabilities, len(true), len(classes))
    class_indices = {label: index for index, label in enumerate(classes)}
    if any(label not in class_indices for label in true):
        raise ValueError("true labels contain a class outside the evaluation classes")

    confidence = values.max(axis=1)
    estimates = values.argmax(axis=1)
    correct = np.asarray(
        [estimates[index] == class_indices[label] for index, label in enumerate(true)],
        dtype=np.float64,
    )
    one_hot = np.zeros_like(values)
    for index, label in enumerate(true):
        one_hot[index, class_indices[label]] = 1.0

    # Expected calibration error is descriptive only.  It does not turn a
    # softmax maximum into a medically meaningful probability.
    bin_edges = np.linspace(0.0, 1.0, 11)
    calibration_error = 0.0
    calibration_bins: list[dict[str, float | int]] = []
    for bin_index in range(len(bin_edges) - 1):
        lower = bin_edges[bin_index]
        upper = bin_edges[bin_index + 1]
        mask = (confidence >= lower) & (
            confidence < upper if bin_index < len(bin_edges) - 2 else confidence <= upper
        )
        if not np.any(mask):
            continue
        bin_confidence = float(confidence[mask].mean())
        bin_accuracy = float(correct[mask].mean())
        count = int(mask.sum())
        calibration_error += count / len(true) * abs(bin_accuracy - bin_confidence)
        calibration_bins.append(
            {
                "lower": float(lower),
                "upper": float(upper),
                "count": count,
                "confidence": bin_confidence,
                "accuracy": bin_accuracy,
            }
        )

    return {
        "minimumClassRecall": float(
            min(metrics(true, predicted, classes)["recall"].values())
        ),
        "meanConfidence": float(confidence.mean()),
        "brierScore": float(np.mean(np.sum((values - one_hot) ** 2, axis=1))),
        "expectedCalibrationError": float(calibration_error),
        "calibrationBins": calibration_bins,
        "bootstrap": _bootstrap_intervals(
            true, predicted, classes, seed, bootstrap_samples
        ),
        "selective": _selective_metrics(
            true,
            predicted,
            confidence,
            classes,
            confidence_thresholds,
        ),
    }
