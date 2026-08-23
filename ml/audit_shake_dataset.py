"""Audit a ColdKeep shake manifest before any model fitting.

The audit is intentionally independent of the classifier.  It detects
duplicate audio, label conflicts, class/group confounding, and whether the
requested group holdouts can actually be evaluated.  A report with
``status=insufficient_data`` is a valid result; it is not a license to invent
labels for external sound effects.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import wave
from collections import defaultdict
from pathlib import Path

from audio_features import read_pcm16_wav
from train_shake_ice_amount import (
    ICE_AMOUNT_NAMES,
    Capture,
    ice_amount_index,
    load_manifest,
    recording_day,
)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _class_names(captures: list[Capture]) -> dict[str, str]:
    return {
        capture.recording_id: ICE_AMOUNT_NAMES[ice_amount_index(capture.ice_count)]
        for capture in captures
    }


def _holdout_report(captures: list[Capture], field: str) -> dict:
    groups = sorted({getattr(capture, field) for capture in captures})
    valid: list[str] = []
    invalid: dict[str, str] = {}
    all_classes = set(range(len(ICE_AMOUNT_NAMES)))
    for held_out in groups:
        test = [capture for capture in captures if getattr(capture, field) == held_out]
        train = [capture for capture in captures if getattr(capture, field) != held_out]
        train_classes = {ice_amount_index(capture.ice_count) for capture in train}
        test_classes = {ice_amount_index(capture.ice_count) for capture in test}
        if train_classes == all_classes and test_classes == all_classes:
            valid.append(str(held_out))
        else:
            missing_train = sorted(all_classes - train_classes)
            missing_test = sorted(all_classes - test_classes)
            invalid[str(held_out)] = (
                "missing_train="
                + ",".join(ICE_AMOUNT_NAMES[index] for index in missing_train)
                + "; missing_test="
                + ",".join(ICE_AMOUNT_NAMES[index] for index in missing_test)
            )
    return {
        "groupField": field,
        "groupCount": len(groups),
        "groups": [str(group) for group in groups],
        "validFolds": valid,
        "invalidFolds": invalid,
        "evaluatable": bool(valid),
        "allFoldsEvaluatable": bool(groups) and not invalid,
    }


def _recording_day(value: str | None) -> str | None:
    # Keep the audit and trainer on one strict parser. A date-looking prefix
    # without a valid timezone must not satisfy the temporal holdout gate.
    return recording_day(value)


def _temporal_coverage(captures: list[Capture]) -> dict:
    values: dict[str, set[str]] = defaultdict(set)
    missing: dict[str, int] = defaultdict(int)
    for capture in captures:
        class_name = ICE_AMOUNT_NAMES[ice_amount_index(capture.ice_count)]
        day = _recording_day(capture.recorded_at)
        if day is None:
            missing[class_name] += 1
        else:
            values[class_name].add(day)
    return {
        class_name: {
            "days": sorted(values.get(class_name, set())),
            "uniqueDays": len(values.get(class_name, set())),
            "missingOrMalformed": missing.get(class_name, 0),
        }
        for class_name in ICE_AMOUNT_NAMES
    }


def _class_confounds(captures: list[Capture], field: str) -> dict:
    values: dict[str, set[str]] = defaultdict(set)
    for capture in captures:
        value = getattr(capture, field)
        if value is not None and str(value) != "":
            normalized = str(value)
            if field == "recorded_at":
                normalized = normalized[:10]
            values[ICE_AMOUNT_NAMES[ice_amount_index(capture.ice_count)]].add(normalized)
    return {
        ICE_AMOUNT_NAMES[index]: sorted(values.get(ICE_AMOUNT_NAMES[index], set()))
        for index in range(len(ICE_AMOUNT_NAMES))
    }


def _numeric_coverage(captures: list[Capture], field: str) -> dict:
    values: dict[str, list[float]] = defaultdict(list)
    for capture in captures:
        value = getattr(capture, field)
        if value is None:
            continue
        values[ICE_AMOUNT_NAMES[ice_amount_index(capture.ice_count)]].append(float(value))
    return {
        ICE_AMOUNT_NAMES[index]: {
            "count": len(values.get(ICE_AMOUNT_NAMES[index], [])),
            "unique": sorted(set(values.get(ICE_AMOUNT_NAMES[index], []))),
            "min": min(values[ICE_AMOUNT_NAMES[index]])
            if values.get(ICE_AMOUNT_NAMES[index])
            else None,
            "max": max(values[ICE_AMOUNT_NAMES[index]])
            if values.get(ICE_AMOUNT_NAMES[index])
            else None,
        }
        for index in range(len(ICE_AMOUNT_NAMES))
    }


def audit(captures: list[Capture], diagnostics: list[str]) -> dict:
    labels = _class_names(captures)
    by_hash: dict[str, list[str]] = defaultdict(list)
    file_errors: list[str] = []
    audio_metadata: dict[str, dict] = {}
    for capture in captures:
        try:
            digest = _file_sha256(capture.path)
            by_hash[digest].append(capture.recording_id)
            samples, sample_rate = read_pcm16_wav(capture.path)
            audio_metadata[capture.recording_id] = {
                "sha256": digest,
                "sampleRate": sample_rate,
                "samples": len(samples),
                "durationSeconds": len(samples) / sample_rate,
            }
        except (OSError, ValueError, wave.Error) as error:
            file_errors.append(f"{capture.recording_id}: {error}")

    duplicate_audio = {
        digest: recording_ids
        for digest, recording_ids in by_hash.items()
        if len(recording_ids) > 1
    }
    hash_label_conflicts = []
    for digest, recording_ids in duplicate_audio.items():
        classes = {labels[recording_id] for recording_id in recording_ids}
        if len(classes) > 1:
            hash_label_conflicts.append(
                {"sha256": digest, "recordingIds": recording_ids, "classes": sorted(classes)}
            )

    report = {
        "status": "ok" if captures else "insufficient_data",
        "totalShakeRows": len(captures),
        "classCounts": {
            name: sum(
                1 for capture in captures if ICE_AMOUNT_NAMES[ice_amount_index(capture.ice_count)] == name
            )
            for name in ICE_AMOUNT_NAMES
        },
        "sessionsPerClass": _class_confounds(captures, "session_id"),
        "containersPerClass": _class_confounds(captures, "container_id"),
        "devicesPerClass": _class_confounds(captures, "device_id"),
        "recordedAtPerClass": _class_confounds(captures, "recorded_at"),
        "temporalCoverage": _temporal_coverage(captures),
        "numericCoverage": {
            field: _numeric_coverage(captures, field)
            for field in (
                "capacity_ml",
                "water_ml",
                "temperature_c",
                "microphone_distance_cm",
            )
        },
        "duplicateAudio": duplicate_audio,
        "hashLabelConflicts": hash_label_conflicts,
        "fileErrors": file_errors,
        "skippedManifestRows": diagnostics,
        "holdouts": {
            field: _holdout_report(captures, field)
            for field in (
                "session_id",
                "container_id",
                "device_id",
                "room_id",
                "operator_id",
            )
        },
        "audio": audio_metadata,
    }
    report["warnings"] = []
    if duplicate_audio:
        report["warnings"].append("same audio SHA256 appears under multiple recording IDs")
    if hash_label_conflicts:
        report["warnings"].append("identical audio has conflicting ice amount labels")
    for field in ("session_id", "container_id", "device_id", "room_id", "operator_id"):
        field_report = report["holdouts"][field]
        if not field_report["evaluatable"]:
            report["warnings"].append(f"{field} holdout has no complete valid fold")
    for class_name, values in report["recordedAtPerClass"].items():
        if len(values) == 1 and values:
            report["warnings"].append(
                f"{class_name} is recorded at one timestamp; check day/session confounding"
            )
    for field, coverage in report["numericCoverage"].items():
        missing_classes = [
            class_name
            for class_name, summary in coverage.items()
            if summary["count"] == 0
        ]
        if missing_classes:
            report["warnings"].append(
                f"{field} is missing for class(es): {', '.join(missing_classes)}"
            )
    clean_integrity = bool(
        not diagnostics
        and not duplicate_audio
        and not file_errors
    )
    temporal_coverage = report["temporalCoverage"]
    temporal_holdout_ready = all(
        summary["uniqueDays"] >= 2 and summary["missingOrMalformed"] == 0
        for summary in temporal_coverage.values()
    )
    complete_class_coverage = bool(
        captures
        and all(report["classCounts"][name] >= 2 for name in ICE_AMOUNT_NAMES)
    )
    report["readyForAblation"] = bool(
        clean_integrity
        and complete_class_coverage
        and report["holdouts"]["session_id"]["allFoldsEvaluatable"]
    )
    report["readyForTraining"] = bool(
        report["readyForAblation"]
        and report["holdouts"]["container_id"]["allFoldsEvaluatable"]
        and report["holdouts"]["device_id"]["allFoldsEvaluatable"]
        and report["holdouts"]["room_id"]["allFoldsEvaluatable"]
        and report["holdouts"]["operator_id"]["allFoldsEvaluatable"]
        and temporal_holdout_ready
    )
    report["temporalHoldoutReady"] = temporal_holdout_ready
    report["integrity"] = {
        "clean": clean_integrity,
        "duplicateAudioRejected": not duplicate_audio,
        "fileErrorsRejected": not file_errors,
        "manifestDiagnosticsRejected": not diagnostics,
    }
    # Keep the explicit booleans above instead of relying on a warning-only
    # interpretation: callers use these gates before fitting any classifier.
    if not report["readyForAblation"]:
        report["warnings"].append("dataset is not safe for ablation")
    if not report["readyForTraining"]:
        report["warnings"].append(
            "dataset is not deployable: complete container, device, room, and operator holdouts are required"
        )
    if not temporal_holdout_ready:
        report["warnings"].append(
            "dataset is not deployable: every class needs two valid recording days"
        )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    captures, diagnostics = load_manifest(args.manifest, args.audio_root)
    report = audit(captures, diagnostics)
    serialized = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    print(serialized)
    if not report["readyForAblation"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
