"""Run leakage-safe ablations for the ColdKeep shake ice task.

This script never writes a production model.  It compares the existing
log-mel summary (A), interpretable transient descriptors (B), and their
concatenation (C) on the same recording-level group folds.  External audio is
not accepted as labelled input; only rows with an exact ColdKeep ``ice_count``
in the exported manifest are loaded.
"""

from __future__ import annotations

import argparse
import json
import zlib
from pathlib import Path

import numpy as np

from audio_features import (
    TARGET_SAMPLE_RATE,
    extract_feature_set,
    mel_filterbank,
    read_pcm16_wav,
    resample,
    segment_audio,
)
from train_baseline import SoftmaxClassifier, metrics
from train_shake_ice_amount import ICE_AMOUNT_NAMES, Capture, ice_amount_index, load_manifest


FEATURE_MODES = ("log_mel", "transient", "combined")
NORMALIZATION_MODES = ("gain_normalized", "raw")
GROUP_FIELDS = ("session_id", "container_id", "device_id")


def _recording_features(
    capture: Capture,
    mode: str,
    gain_normalize: bool,
    filters: np.ndarray,
) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(capture.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    windows = segment_audio(waveform)
    return np.stack(
        [
            extract_feature_set(
                window,
                mode,
                TARGET_SAMPLE_RATE,
                filters,
                gain_normalize,
            )
            for window in windows
        ]
    )


def _arrays(
    captures: list[Capture],
    cache: dict[str, np.ndarray],
    label_function,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([cache[capture.recording_id] for capture in captures])
    labels = np.concatenate(
        [
            np.full(len(cache[capture.recording_id]), label_function(capture), dtype=np.int64)
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


def _folds(captures: list[Capture], field: str) -> list[dict]:
    folds = []
    for held_out in sorted({getattr(capture, field) for capture in captures}):
        train = [capture for capture in captures if getattr(capture, field) != held_out]
        test = [capture for capture in captures if getattr(capture, field) == held_out]
        folds.append({"heldOut": str(held_out), "train": train, "test": test})
    return folds


def _metric_report(true: list[int], predicted: list[int]) -> dict:
    result = metrics(true, predicted, [0, 1, 2])
    confusion = np.asarray(result["confusion_matrix"], dtype=np.int64)
    recall = {}
    precision = {}
    for index, name in enumerate(ICE_AMOUNT_NAMES):
        tp = int(confusion[index, index])
        fp = int(confusion[:, index].sum() - tp)
        fn = int(confusion[index, :].sum() - tp)
        recall[name] = tp / max(tp + fn, 1)
        precision[name] = tp / max(tp + fp, 1)
    result["recall"] = recall
    result["precision"] = precision
    return result


def _train_classifier(
    captures: list[Capture],
    cache: dict[str, np.ndarray],
    labels,
    classes: list[int],
    seed: int,
    epochs: int,
) -> SoftmaxClassifier:
    features, targets, weights = _arrays(captures, cache, labels)
    classifier = SoftmaxClassifier(classes, seed=seed)
    classifier.fit(features, targets, weights, epochs=epochs)
    return classifier


def _direct_three_class(
    captures: list[Capture],
    cache: dict[str, np.ndarray],
    field: str,
    epochs: int,
) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    predictions: list[dict] = []
    skipped_folds: dict[str, str] = {}
    valid_fold_count = 0
    for fold in _folds(captures, field):
        train = fold["train"]
        test = fold["test"]
        train_classes = {ice_amount_index(capture.ice_count) for capture in train}
        test_classes = {ice_amount_index(capture.ice_count) for capture in test}
        if train_classes != {0, 1, 2} or test_classes != {0, 1, 2}:
            skipped_folds[fold["heldOut"]] = "train/test fold does not contain all 3 classes"
            continue
        valid_fold_count += 1
        seed = zlib.crc32(f"direct:{field}:{fold['heldOut']}".encode()) & 0xFFFF
        classifier = _train_classifier(
            train,
            cache,
            lambda capture: ice_amount_index(capture.ice_count),
            [0, 1, 2],
            seed,
            epochs,
        )
        for capture in test:
            probabilities = classifier.predict_proba(cache[capture.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = ice_amount_index(capture.ice_count)
            true.append(actual)
            predicted.append(estimate)
            predictions.append(
                {
                    "recordingId": capture.recording_id,
                    "heldOut": fold["heldOut"],
                    "actual": ICE_AMOUNT_NAMES[actual],
                    "predicted": ICE_AMOUNT_NAMES[estimate],
                    "probabilities": probabilities.round(6).tolist(),
                }
            )
    if not true:
        return {
            "status": "insufficient_data",
            "skippedFolds": skipped_folds,
            "validFolds": 0,
        }
    result = _metric_report(true, predicted)
    result.update({"status": "ok", "validFolds": valid_fold_count, "predictions": predictions})
    if skipped_folds:
        result["skippedFolds"] = skipped_folds
    return result


def _two_stage(
    captures: list[Capture],
    cache: dict[str, np.ndarray],
    field: str,
    epochs: int,
) -> dict:
    true: list[int] = []
    predicted: list[int] = []
    skipped_folds: dict[str, str] = {}
    valid_fold_count = 0
    for fold in _folds(captures, field):
        train = fold["train"]
        test = fold["test"]
        positive_train = [capture for capture in train if capture.ice_count > 0]
        positive_test = [capture for capture in test if capture.ice_count > 0]
        if {capture.ice_count > 0 for capture in train} != {False, True}:
            skipped_folds[fold["heldOut"]] = "stage-1 train fold lacks ice/no-ice"
            continue
        if {capture.ice_count > 0 for capture in test} != {False, True}:
            skipped_folds[fold["heldOut"]] = "stage-1 test fold lacks ice/no-ice"
            continue
        if {ice_amount_index(capture.ice_count) for capture in positive_train} != {1, 2}:
            skipped_folds[fold["heldOut"]] = "stage-2 train fold lacks few/many"
            continue
        if {ice_amount_index(capture.ice_count) for capture in positive_test} != {1, 2}:
            skipped_folds[fold["heldOut"]] = "stage-2 test fold lacks few/many"
            continue
        valid_fold_count += 1
        seed = zlib.crc32(f"stage1:{field}:{fold['heldOut']}".encode()) & 0xFFFF
        stage_one = _train_classifier(
            train,
            cache,
            lambda capture: int(capture.ice_count > 0),
            [0, 1],
            seed,
            epochs,
        )
        stage_two = _train_classifier(
            positive_train,
            cache,
            lambda capture: ice_amount_index(capture.ice_count),
            [1, 2],
            seed ^ 0x5A5A,
            epochs,
        )
        for capture in test:
            stage_one_probabilities = stage_one.predict_proba(cache[capture.recording_id]).mean(axis=0)
            has_ice = int(stage_one.classes[np.argmax(stage_one_probabilities)]) == 1
            if not has_ice:
                estimate = 0
            else:
                stage_two_probabilities = stage_two.predict_proba(
                    cache[capture.recording_id]
                ).mean(axis=0)
                estimate = int(stage_two.classes[np.argmax(stage_two_probabilities)])
            true.append(ice_amount_index(capture.ice_count))
            predicted.append(estimate)
    if not true:
        return {
            "status": "insufficient_data",
            "skippedFolds": skipped_folds,
            "validFolds": 0,
        }
    result = _metric_report(true, predicted)
    result.update({"status": "ok", "validFolds": valid_fold_count})
    if skipped_folds:
        result["skippedFolds"] = skipped_folds
    return result


def run_ablation(captures: list[Capture], epochs: int = 1_000) -> dict:
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    report = {
        "version": 1,
        "task": "shake_ice_amount",
        "classes": list(ICE_AMOUNT_NAMES),
        "featureModes": {
            "log_mel": {"description": "A: current 128-dim log-mel summary", "size": 128},
            "transient": {"description": "B: onset/transient descriptors", "size": 21},
            "combined": {"description": "C: log-mel + transient descriptors", "size": 149},
        },
        "normalization": list(NORMALIZATION_MODES),
        "holdoutGroups": list(GROUP_FIELDS),
        "training": {"classifier": "weighted linear softmax", "epochs": epochs},
        "results": {},
    }
    for mode in FEATURE_MODES:
        for normalization in NORMALIZATION_MODES:
            gain_normalize = normalization == "gain_normalized"
            key = f"{mode}:{normalization}"
            cache = {
                capture.recording_id: _recording_features(
                    capture, mode, gain_normalize, filters
                )
                for capture in captures
            }
            report["results"][key] = {
                "featureMode": mode,
                "normalization": normalization,
                "groupHoldout": {
                    field: {
                        "direct3Class": _direct_three_class(
                            captures, cache, field, epochs
                        ),
                        "twoStage": _two_stage(captures, cache, field, epochs),
                    }
                    for field in GROUP_FIELDS
                },
            }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=1_000)
    args = parser.parse_args()
    try:
        captures, diagnostics = load_manifest(args.manifest, args.audio_root)
        if not captures:
            raise ValueError("no usable ColdKeep shake recordings")
        if diagnostics:
            raise ValueError(
                "manifest contains invalid or unlabeled shake rows; refusing ablation: "
                + " | ".join(diagnostics)
            )
        from audit_shake_dataset import audit

        audit_report = audit(captures, diagnostics)
        if not audit_report["readyForAblation"]:
            raise ValueError(
                "dataset audit is not ready for ablation: "
                + "; ".join(audit_report["warnings"])
            )
        if len({ice_amount_index(capture.ice_count) for capture in captures}) < 3:
            raise ValueError("all none/few/many classes are required")
        report = run_ablation(captures, epochs=args.epochs)
        report["manifestDiagnostics"] = diagnostics
        report["audit"] = audit_report
    except (OSError, ValueError) as error:
        report = {
            "version": 1,
            "task": "shake_ice_amount",
            "status": "insufficient_data",
            "error": str(error),
            "results": {},
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        raise SystemExit(2) from error
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
