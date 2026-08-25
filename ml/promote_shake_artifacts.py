"""Promote a measured shake model into the app's production artifacts.

Training and deployment are deliberately separate operations.  A trainer may
write an ``experimental`` candidate for inspection, but this command refuses
to copy it into the checked-in artifacts unless the candidate proves that it
was trained from ColdKeep measurements and passed every deployment gate.

The command is intentionally dependency-free so it can run in CI and on the
Windows collection workstation:

    python ml/promote_shake_artifacts.py \
      --manifest C:/path/to/coldkeep-dataset/manifest.csv \
      --fill-candidate C:/tmp/shake_fill.json \
      --ice-candidate C:/tmp/shake_ice.json

Each candidate is optional; when supplied, it is validated and promoted to
the corresponding default artifact.  No candidate is modified in-place.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILL_TARGET = ROOT / "ml" / "artifacts" / "shake_fill_level_pilot.json"
DEFAULT_ICE_TARGET = ROOT / "ml" / "artifacts" / "shake_ice_amount_pilot.json"
MIN_DEPLOYABLE_BALANCED_ACCURACY = 0.67
MANIFEST_SHA256_LENGTH = 64
REQUIRED_GROUP_EVALUATIONS = (
    "session_id",
    "container_id",
    "device_id",
    "room_id",
    "operator_id",
)


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    result = float(value)
    if not result == result or result in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be finite")
    return result


def _validate_common(
    artifact: dict[str, Any],
    expected_task: str,
    classes: list[str],
    expected_manifest_sha256: str | None = None,
    require_group_evaluations: bool = False,
) -> None:
    if artifact.get("version") != 1:
        raise ValueError("artifact version must be 1")
    if artifact.get("task") != expected_task:
        raise ValueError(f"artifact task must be {expected_task!r}")
    if artifact.get("status") != "trained":
        raise ValueError("artifact status is not trained")
    if artifact.get("classes") != classes:
        raise ValueError(f"artifact classes must be {classes!r}")
    for name, expected in (
        ("sampleRate", 16_000),
        ("windowSamples", 16_000),
        ("hopSamples", 8_000),
        ("featureSize", 128),
    ):
        if artifact.get(name) != expected:
            raise ValueError(f"artifact {name} must be {expected}")

    model = artifact.get("model")
    if not isinstance(model, dict):
        raise ValueError("artifact model is missing")
    if model.get("classes") != list(range(len(classes))):
        raise ValueError("artifact model class indexes do not match the public classes")
    if model.get("task") != expected_task:
        raise ValueError("artifact model task does not match the artifact task")
    feature_size = artifact["featureSize"]
    for name in ("featureMean", "featureScale"):
        values = model.get(name)
        if not isinstance(values, list) or len(values) != feature_size:
            raise ValueError(f"artifact model {name} must have {feature_size} values")
        for index, value in enumerate(values):
            _number(value, f"model.{name}[{index}]")
    weights = model.get("weights")
    if not isinstance(weights, list) or len(weights) != feature_size:
        raise ValueError(f"artifact model weights must have {feature_size} rows")
    for row_index, row in enumerate(weights):
        if not isinstance(row, list) or len(row) != len(classes):
            raise ValueError(f"model.weights[{row_index}] has the wrong output size")
        for column_index, value in enumerate(row):
            _number(value, f"model.weights[{row_index}][{column_index}]")
    bias = model.get("bias")
    if not isinstance(bias, list) or len(bias) != len(classes):
        raise ValueError("artifact model bias has the wrong output size")
    for index, value in enumerate(bias):
        _number(value, f"model.bias[{index}]")

    _validate_evaluation(artifact.get("evaluation"), classes)
    if require_group_evaluations:
        _validate_group_evaluations(artifact.get("groupEvaluations"), classes)
        _validate_temporal_evaluation(artifact.get("temporalEvaluation"), classes)
    audit = artifact.get("audit")
    if not isinstance(audit, dict) or audit.get("readyForTraining") is not True:
        raise ValueError("audit.readyForTraining is not true")
    if audit.get("labelSource") != "coldkeep_measured_only":
        raise ValueError("artifact was not trained from measured ColdKeep labels")
    provenance = artifact.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("artifact provenance is missing")
    manifest_sha256 = provenance.get("manifestSha256")
    if (
        not isinstance(manifest_sha256, str)
        or len(manifest_sha256) != MANIFEST_SHA256_LENGTH
        or any(character not in "0123456789abcdef" for character in manifest_sha256.lower())
    ):
        raise ValueError("artifact provenance.manifestSha256 is invalid")
    if expected_manifest_sha256 is not None and manifest_sha256.lower() != expected_manifest_sha256:
        raise ValueError("artifact manifest hash does not match the supplied manifest")


def _validate_evaluation(value: Any, classes: list[str]) -> None:
    """Reject incomplete or internally inconsistent claimed metrics.

    Promotion still expects the candidate to come from the checked-in
    trainers, but validating the confusion matrix and class recalls prevents a
    hand-edited score from disagreeing with the evidence carried in the same
    artifact.  The manifest-level audit remains the source of truth for data
    provenance.
    """
    if not isinstance(value, dict):
        raise ValueError("evaluation report is missing")
    if value.get("classes") != classes:
        raise ValueError("evaluation classes do not match the artifact classes")
    recordings = value.get("recordings")
    if isinstance(recordings, bool) or not isinstance(recordings, int) or recordings <= 0:
        raise ValueError("evaluation.recordings must be a positive integer")
    metrics = {}
    for name in ("accuracy", "balanced_accuracy", "macro_f1"):
        score = _number(value.get(name), f"evaluation.{name}")
        if not 0.0 <= score <= 1.0:
            raise ValueError(f"evaluation.{name} must be between 0 and 1")
        metrics[name] = score

    confusion = value.get("confusion_matrix")
    if not isinstance(confusion, list) or len(confusion) != len(classes):
        raise ValueError("evaluation.confusion_matrix has the wrong shape")
    if any(
        not isinstance(row, list)
        or len(row) != len(classes)
        or any(isinstance(cell, bool) or not isinstance(cell, int) or cell < 0 for cell in row)
        for row in confusion
    ):
        raise ValueError("evaluation.confusion_matrix contains invalid counts")
    total = sum(cell for row in confusion for cell in row)
    if total != recordings:
        raise ValueError("evaluation.confusion_matrix does not match recordings")
    confusion_accuracy = sum(confusion[index][index] for index in range(len(classes))) / recordings
    if abs(confusion_accuracy - metrics["accuracy"]) > 1e-6:
        raise ValueError("evaluation.accuracy disagrees with confusion_matrix")

    recall = value.get("recall")
    if not isinstance(recall, dict):
        raise ValueError("evaluation.recall is missing")
    recalls: list[float] = []
    for index in range(len(classes)):
        score = _number(recall.get(str(index)), f"evaluation.recall[{index}]")
        if not 0.0 <= score <= 1.0:
            raise ValueError(f"evaluation.recall[{index}] must be between 0 and 1")
        row_total = sum(confusion[index])
        expected = confusion[index][index] / row_total if row_total else 0.0
        if abs(expected - score) > 1e-6:
            raise ValueError(f"evaluation.recall[{index}] disagrees with confusion_matrix")
        recalls.append(score)
    if abs(sum(recalls) / len(recalls) - metrics["balanced_accuracy"]) > 1e-6:
        raise ValueError("evaluation.balanced_accuracy disagrees with class recall")

    precision = value.get("precision")
    if not isinstance(precision, dict):
        raise ValueError("evaluation.precision is missing")
    f1_scores: list[float] = []
    for index in range(len(classes)):
        score = _number(precision.get(str(index)), f"evaluation.precision[{index}]")
        if not 0.0 <= score <= 1.0:
            raise ValueError(f"evaluation.precision[{index}] must be between 0 and 1")
        column_total = sum(confusion[row_index][index] for row_index in range(len(classes)))
        expected = confusion[index][index] / column_total if column_total else 0.0
        if abs(expected - score) > 1e-6:
            raise ValueError(
                f"evaluation.precision[{index}] disagrees with confusion_matrix"
            )
        recall_value = recalls[index]
        f1_scores.append(
            2 * expected * recall_value / max(expected + recall_value, 1e-12)
        )
    if abs(sum(f1_scores) / len(f1_scores) - metrics["macro_f1"]) > 1e-6:
        raise ValueError("evaluation.macro_f1 disagrees with confusion_matrix")

    if metrics["balanced_accuracy"] < MIN_DEPLOYABLE_BALANCED_ACCURACY:
        raise ValueError(
            "balanced accuracy is below the deployment gate "
            f"{MIN_DEPLOYABLE_BALANCED_ACCURACY:.2f}"
        )


def _validate_group_evaluations(value: Any, classes: list[str]) -> None:
    """Require scored metrics for every physical nuisance holdout."""
    if not isinstance(value, dict):
        raise ValueError("groupEvaluations is missing")
    if set(value) != set(REQUIRED_GROUP_EVALUATIONS):
        raise ValueError(
            "groupEvaluations must contain session/container/device/room/operator"
        )
    for field in REQUIRED_GROUP_EVALUATIONS:
        report = value[field]
        if not isinstance(report, dict) or report.get("groupField") != field:
            raise ValueError(f"groupEvaluations[{field}] has the wrong groupField")
        _validate_evaluation(report, classes)


def _validate_temporal_evaluation(value: Any, classes: list[str]) -> None:
    """Require a scored calendar-day holdout for the ice production model."""
    if not isinstance(value, dict) or value.get("groupField") != "recorded_day":
        raise ValueError("temporalEvaluation must be a recorded_day holdout")
    if isinstance(value.get("validFolds"), bool) or not isinstance(value.get("validFolds"), int):
        raise ValueError("temporalEvaluation.validFolds is missing")
    if value["validFolds"] <= 0:
        raise ValueError("temporalEvaluation has no valid folds")
    _validate_evaluation(value, classes)

def validate_candidate(
    path: Path,
    task: str,
    expected_manifest_sha256: str | None = None,
) -> dict[str, Any]:
    """Validate one candidate and return its parsed JSON."""
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read candidate {path}: {error}") from error
    if not isinstance(artifact, dict):
        raise ValueError("candidate root must be an object")

    if task == "shake_fill_level":
        _validate_common(
            artifact,
            task,
            ["empty", "half", "full"],
            expected_manifest_sha256,
        )
    elif task == "shake_ice_amount":
        _validate_common(
            artifact,
            task,
            ["none", "few", "many"],
            expected_manifest_sha256,
            require_group_evaluations=True,
        )
        schema = artifact.get("featureSchema")
        if not isinstance(schema, dict) or schema.get("name") != "log_mel_summary_v1" or schema.get("version") != 1:
            raise ValueError("ice artifact feature schema must be log_mel_summary_v1 v1")
    return artifact


def _atomic_write(target: Path, artifact: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(artifact, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()


def promote(candidate: Path, target: Path, task: str) -> dict[str, Any]:
    artifact = validate_candidate(candidate, task)
    _atomic_write(target, artifact)
    return artifact


def promote_many(
    candidates: list[tuple[Path, Path, str]],
    expected_manifest_sha256: str | None = None,
) -> list[tuple[str, Path, dict[str, Any]]]:
    """Validate all candidates before writing any production artifact."""
    pending: list[tuple[Path, Path, str, dict[str, Any]]] = []
    for candidate, target, task in candidates:
        pending.append(
            (
                candidate,
                target,
                task,
                validate_candidate(candidate, task, expected_manifest_sha256),
            )
        )
    promoted: list[tuple[str, Path, dict[str, Any]]] = []
    for _, target, task, artifact in pending:
        _atomic_write(target, artifact)
        promoted.append((task, target, artifact))
    return promoted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fill-candidate", type=Path)
    parser.add_argument("--ice-candidate", type=Path)
    parser.add_argument("--fill-target", type=Path, default=DEFAULT_FILL_TARGET)
    parser.add_argument("--ice-target", type=Path, default=DEFAULT_ICE_TARGET)
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="the exact ColdKeep manifest used for both candidates",
    )
    args = parser.parse_args()
    if args.fill_candidate is None and args.ice_candidate is None:
        parser.error("at least one candidate is required")

    try:
        manifest_digest = hashlib.sha256(args.manifest.read_bytes()).hexdigest()
        # Validate every candidate before touching either target.  This keeps
        # a bad ice candidate from leaving a newly promoted fill artifact when
        # both models are supplied in one release operation.
        candidates: list[tuple[Path, Path, str]] = []
        if args.fill_candidate is not None:
            candidates.append((args.fill_candidate, args.fill_target, "shake_fill_level"))
        if args.ice_candidate is not None:
            candidates.append((args.ice_candidate, args.ice_target, "shake_ice_amount"))

        for task, target, artifact in promote_many(candidates, manifest_digest):
            print(
                f"promoted {task}: "
                f"balanced_accuracy={artifact['evaluation']['balanced_accuracy']:.3f} "
                f"-> {target}"
            )
    except (OSError, ValueError) as error:
        print(f"SHAKE PROMOTION BLOCKED: {error}")
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
