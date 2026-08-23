"""Promote a measured shake model into the app's production artifacts.

Training and deployment are deliberately separate operations.  A trainer may
write an ``experimental`` candidate for inspection, but this command refuses
to copy it into the checked-in artifacts unless the candidate proves that it
was trained from ColdKeep measurements and passed every deployment gate.

The command is intentionally dependency-free so it can run in CI and on the
Windows collection workstation:

    python ml/promote_shake_artifacts.py \
      --fill-candidate C:/tmp/shake_fill.json \
      --ice-candidate C:/tmp/shake_ice.json

Each candidate is optional; when supplied, it is validated and promoted to
the corresponding default artifact.  No candidate is modified in-place.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILL_TARGET = ROOT / "ml" / "artifacts" / "shake_fill_level_pilot.json"
DEFAULT_ICE_TARGET = ROOT / "ml" / "artifacts" / "shake_ice_amount_pilot.json"
MIN_DEPLOYABLE_BALANCED_ACCURACY = 0.67


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    result = float(value)
    if not result == result or result in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be finite")
    return result


def _validate_common(artifact: dict[str, Any], expected_task: str, classes: list[str]) -> None:
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

    evaluation = artifact.get("evaluation")
    if not isinstance(evaluation, dict):
        raise ValueError("evaluation report is missing")
    balanced_accuracy = _number(
        evaluation.get("balanced_accuracy"), "evaluation.balanced_accuracy"
    )
    if balanced_accuracy < MIN_DEPLOYABLE_BALANCED_ACCURACY:
        raise ValueError(
            "balanced accuracy is below the deployment gate "
            f"{MIN_DEPLOYABLE_BALANCED_ACCURACY:.2f}"
        )
    audit = artifact.get("audit")
    if not isinstance(audit, dict) or audit.get("readyForTraining") is not True:
        raise ValueError("audit.readyForTraining is not true")
    if audit.get("labelSource") != "coldkeep_measured_only":
        raise ValueError("artifact was not trained from measured ColdKeep labels")


def validate_candidate(path: Path, task: str) -> dict[str, Any]:
    """Validate one candidate and return its parsed JSON."""
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read candidate {path}: {error}") from error
    if not isinstance(artifact, dict):
        raise ValueError("candidate root must be an object")

    if task == "shake_fill_level":
        _validate_common(artifact, task, ["empty", "half", "full"])
    elif task == "shake_ice_amount":
        _validate_common(artifact, task, ["none", "few", "many"])
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fill-candidate", type=Path)
    parser.add_argument("--ice-candidate", type=Path)
    parser.add_argument("--fill-target", type=Path, default=DEFAULT_FILL_TARGET)
    parser.add_argument("--ice-target", type=Path, default=DEFAULT_ICE_TARGET)
    args = parser.parse_args()
    if args.fill_candidate is None and args.ice_candidate is None:
        parser.error("at least one candidate is required")

    try:
        if args.fill_candidate is not None:
            artifact = promote(args.fill_candidate, args.fill_target, "shake_fill_level")
            print(
                f"promoted shake_fill_level: "
                f"balanced_accuracy={artifact['evaluation']['balanced_accuracy']:.3f} "
                f"-> {args.fill_target}"
            )
        if args.ice_candidate is not None:
            artifact = promote(args.ice_candidate, args.ice_target, "shake_ice_amount")
            print(
                f"promoted shake_ice_amount: "
                f"balanced_accuracy={artifact['evaluation']['balanced_accuracy']:.3f} "
                f"-> {args.ice_target}"
            )
    except ValueError as error:
        print(f"SHAKE PROMOTION BLOCKED: {error}")
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
