"""Train a conservative three-band ice amount classifier for shake recordings.

The phone collection screen records the exact ice count as ground truth, but
the deployable task intentionally collapses it to ``none`` (0), ``few`` (1-2),
or ``many`` (3+).  This prevents the app from claiming an exact cube count
that the acoustic signal and the pilot dataset cannot support.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import zlib
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
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


ICE_AMOUNT_NAMES = ("none", "few", "many")
MIN_DEPLOYABLE_BALANCED_ACCURACY = 0.67
HOLDOUT_FIELDS = (
    "session_id",
    "container_id",
    "device_id",
    "room_id",
    "operator_id",
)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class Capture:
    recording_id: str
    session_id: str
    container_id: str
    device_id: str
    ice_count: int
    path: Path
    # The CSV loader requires these fields so physical/environment holdouts
    # cannot silently disappear.  Defaults preserve compatibility for small
    # in-memory fixtures and external research scripts that predate the
    # expanded collection schema; such fixtures are never deployable data.
    room_id: str = "unknown-room"
    operator_id: str = "unknown-operator"
    capacity_ml: float | None = None
    water_ml: float | None = None
    temperature_c: float | None = None
    microphone_distance_cm: float | None = None
    recorded_at: str | None = None
    platform: str | None = None
    label_source: str = "coldkeep_measured"


def ice_amount_index(count: int) -> int:
    """Map exact collection ground truth to the public three-band target."""
    if count <= 0:
        return 0
    if count <= 2:
        return 1
    return 2


def _required(row: dict[str, str], name: str, line: int) -> str:
    value = row.get(name, "").strip()
    if not value:
        raise ValueError(f"manifest line {line}: missing {name}")
    return value


def recording_day(value: str | None) -> str | None:
    """Return an ISO calendar day only for a timezone-aware timestamp."""
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.date().isoformat()


def load_manifest(manifest: Path, audio_root: Path) -> tuple[list[Capture], list[str]]:
    """Load shake rows and skip malformed rows without guessing labels."""
    captures: list[Capture] = []
    diagnostics: list[str] = []
    resolved_audio_root = audio_root.resolve()
    seen_recording_ids: set[str] = set()
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {
            "recording_id",
            "session_id",
            "container_id",
            "device_id",
            "room_id",
            "operator_id",
            "ice_count",
            "action",
            "audio_filename",
            "label_source",
        }
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("manifest is missing columns: " + ", ".join(missing))
        for line, row in enumerate(reader, start=2):
            if row.get("action", "").strip().lower() != "shake":
                continue
            try:
                recording_id = _required(row, "recording_id", line)
                if recording_id in seen_recording_ids:
                    raise ValueError(f"duplicate recording_id: {recording_id}")
                label_source = _required(row, "label_source", line)
                if label_source != "coldkeep_measured":
                    raise ValueError(
                        "label_source must be coldkeep_measured for supervised training; "
                        f"got {label_source!r}"
                    )
                ice_count = int(_required(row, "ice_count", line))
                if ice_count < 0:
                    raise ValueError("ice_count must be >= 0")
                audio = (audio_root / _required(row, "audio_filename", line)).resolve()
                if audio != resolved_audio_root and resolved_audio_root not in audio.parents:
                    raise ValueError("audio_filename escapes the audio root")
                if not audio.is_file():
                    raise ValueError(f"audio file not found: {audio}")
                def optional_number(name: str) -> float | None:
                    raw = row.get(name, "").strip()
                    if not raw:
                        return None
                    value = float(raw)
                    if not np.isfinite(value):
                        raise ValueError(f"{name} must be finite")
                    return value

                recorded_at = row.get("recorded_at", "").strip() or None
                if recorded_at is not None and recording_day(recorded_at) is None:
                    raise ValueError(
                        "recorded_at must be a valid ISO 8601 timestamp with a timezone"
                    )

                captures.append(
                    Capture(
                        recording_id=recording_id,
                        session_id=_required(row, "session_id", line),
                        container_id=_required(row, "container_id", line),
                        device_id=_required(row, "device_id", line),
                        room_id=_required(row, "room_id", line),
                        operator_id=_required(row, "operator_id", line),
                        ice_count=ice_count,
                        path=audio,
                        capacity_ml=optional_number("capacity_ml"),
                        water_ml=optional_number("water_ml"),
                        temperature_c=optional_number("temperature_c"),
                        microphone_distance_cm=optional_number(
                            "microphone_distance_cm"
                        ),
                        recorded_at=recorded_at,
                        platform=row.get("platform", "").strip() or None,
                        label_source=label_source,
                    )
                )
                seen_recording_ids.add(recording_id)
            except (TypeError, ValueError) as error:
                diagnostics.append(str(error))
    return captures, diagnostics


def validate_dataset(captures: list[Capture]) -> dict:
    """Return audit counts and require a session-held-out pilot dataset."""
    if not captures:
        raise ValueError("no shake recordings found; collect rows with action=shake")
    labels = {item.recording_id: ice_amount_index(item.ice_count) for item in captures}
    counts = Counter(labels.values())
    sessions_by_class: dict[int, set[str]] = defaultdict(set)
    containers_by_class: dict[int, set[str]] = defaultdict(set)
    rooms_by_class: dict[int, set[str]] = defaultdict(set)
    operators_by_class: dict[int, set[str]] = defaultdict(set)
    for item in captures:
        label = labels[item.recording_id]
        sessions_by_class[label].add(item.session_id)
        containers_by_class[label].add(item.container_id)
        rooms_by_class[label].add(item.room_id)
        operators_by_class[label].add(item.operator_id)
    report = {
        "totalShakeRows": len(captures),
        "classCounts": {ICE_AMOUNT_NAMES[index]: counts[index] for index in range(3)},
        "sessionsPerClass": {
            ICE_AMOUNT_NAMES[index]: len(sessions_by_class[index]) for index in range(3)
        },
        "containersPerClass": {
            ICE_AMOUNT_NAMES[index]: len(containers_by_class[index]) for index in range(3)
        },
        "roomsPerClass": {
            ICE_AMOUNT_NAMES[index]: len(rooms_by_class[index]) for index in range(3)
        },
        "operatorsPerClass": {
            ICE_AMOUNT_NAMES[index]: len(operators_by_class[index]) for index in range(3)
        },
        "deviceCount": len({item.device_id for item in captures}),
        "recordedAtCount": len({item.recorded_at for item in captures if item.recorded_at}),
    }
    missing = [ICE_AMOUNT_NAMES[index] for index in range(3) if counts[index] == 0]
    if missing:
        raise ValueError(
            "cannot train: missing class(es) "
            + ", ".join(missing)
            + "; class counts="
            + json.dumps(report["classCounts"], ensure_ascii=False)
        )
    sparse = [ICE_AMOUNT_NAMES[index] for index in range(3) if counts[index] < 2]
    if sparse:
        raise ValueError(
            "cannot evaluate: need at least 2 recordings per class; sparse="
            + ", ".join(sparse)
        )
    split_sparse = [
        ICE_AMOUNT_NAMES[index]
        for index in range(3)
        if len(sessions_by_class[index]) < 2
    ]
    if split_sparse:
        raise ValueError(
            "cannot evaluate session-held-out generalization: each class needs "
            "at least 2 sessions; sparse="
            + ", ".join(split_sparse)
        )
    report["holdoutCoverage"] = {}
    all_classes = set(range(3))
    for field in ("session_id", "container_id", "device_id", "room_id", "operator_id"):
        groups = sorted({getattr(item, field) for item in captures})
        valid = []
        invalid = {}
        for held_out in groups:
            train = [item for item in captures if getattr(item, field) != held_out]
            test = [item for item in captures if getattr(item, field) == held_out]
            train_classes = {ice_amount_index(item.ice_count) for item in train}
            test_classes = {ice_amount_index(item.ice_count) for item in test}
            if train_classes == all_classes and test_classes == all_classes:
                valid.append(str(held_out))
            else:
                invalid[str(held_out)] = {
                    "missingTrain": [
                        ICE_AMOUNT_NAMES[index]
                        for index in sorted(all_classes - train_classes)
                    ],
                    "missingTest": [
                        ICE_AMOUNT_NAMES[index]
                        for index in sorted(all_classes - test_classes)
                    ],
                }
        report["holdoutCoverage"][field] = {
            "groupCount": len(groups),
            "validFolds": valid,
            "invalidFolds": invalid,
        }
    return report


def features_for(capture: Capture, filters: np.ndarray) -> np.ndarray:
    waveform, sample_rate = read_pcm16_wav(capture.path)
    waveform = resample(waveform, sample_rate, TARGET_SAMPLE_RATE)
    windows = segment_audio(waveform)
    return np.stack([extract_features(window, filters=filters) for window in windows])


def recording_arrays(
    captures: list[Capture], feature_cache: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    features = np.concatenate([feature_cache[item.recording_id] for item in captures])
    labels = np.concatenate(
        [
            np.full(
                len(feature_cache[item.recording_id]),
                ice_amount_index(item.ice_count),
                dtype=np.int64,
            )
            for item in captures
        ]
    )
    weights = np.concatenate(
        [
            np.full(
                len(feature_cache[item.recording_id]),
                1.0 / len(feature_cache[item.recording_id]),
            )
            for item in captures
        ]
    )
    return features, labels, weights


def evaluate(
    captures: list[Capture],
    feature_cache: dict[str, np.ndarray],
    group_field: str = "session_id",
) -> dict:
    """Evaluate one complete leave-one-group-out split.

    The previous trainer only computed session-held-out metrics while the
    audit checked physical holdout coverage structurally.  A candidate could
    therefore pass the deployment gate without any measured container/device
    generalisation score.  Keep the split logic in one function and record a
    metric report for every required nuisance group.
    """
    if group_field not in HOLDOUT_FIELDS:
        raise ValueError(f"unsupported holdout field: {group_field}")
    classes = [0, 1, 2]
    true: list[int] = []
    predicted: list[int] = []
    predictions: list[dict] = []
    held_out_groups = sorted({getattr(item, group_field) for item in captures})
    for held_out_group in held_out_groups:
        train = [item for item in captures if getattr(item, group_field) != held_out_group]
        test = [item for item in captures if getattr(item, group_field) == held_out_group]
        if (
            {ice_amount_index(item.ice_count) for item in train} != set(classes)
            or {ice_amount_index(item.ice_count) for item in test} != set(classes)
        ):
            continue
        x_train, y_train, weights = recording_arrays(train, feature_cache)
        seed = zlib.crc32(
            f"{group_field}:{held_out_group}".encode("utf-8")
        ) & 0xFFFF
        classifier = SoftmaxClassifier(classes, seed=seed)
        classifier.fit(x_train, y_train, weights)
        for item in test:
            probabilities = classifier.predict_proba(feature_cache[item.recording_id]).mean(axis=0)
            estimate = int(classifier.classes[np.argmax(probabilities)])
            actual = ice_amount_index(item.ice_count)
            true.append(actual)
            predicted.append(estimate)
            predictions.append(
                {
                    "recordingId": item.recording_id,
                    "heldOutGroupField": group_field,
                    "heldOutGroup": held_out_group,
                    "actual": ICE_AMOUNT_NAMES[actual],
                    "predicted": ICE_AMOUNT_NAMES[estimate],
                    "probabilities": probabilities.round(6).tolist(),
                }
            )
    result = metrics(true, predicted, classes)
    result["classes"] = list(ICE_AMOUNT_NAMES)
    result["groupField"] = group_field
    result["validFolds"] = sum(
        1
        for held_out_group in held_out_groups
        if {
            ice_amount_index(item.ice_count)
            for item in captures
            if getattr(item, group_field) != held_out_group
        }
        == set(classes)
        and {
            ice_amount_index(item.ice_count)
            for item in captures
            if getattr(item, group_field) == held_out_group
        }
        == set(classes)
    )
    result["predictions"] = predictions
    return result


def group_evaluations_pass_gate(evaluations: dict[str, dict]) -> bool:
    """Return true only when every required holdout has scored the gate.

    Structural holdout coverage and measured performance are intentionally
    separate checks.  This function requires both a non-empty evaluation and
    balanced accuracy >= the production threshold for every nuisance group.
    """
    return all(
        isinstance(report, dict)
        and int(report.get("recordings", 0)) > 0
        and int(report.get("validFolds", 0)) > 0
        and float(report.get("balanced_accuracy", 0.0))
        >= MIN_DEPLOYABLE_BALANCED_ACCURACY
        for field in HOLDOUT_FIELDS
        for report in [evaluations.get(field)]
    )


def train(manifest: Path, audio_root: Path, output: Path | None) -> dict:
    captures, diagnostics = load_manifest(manifest, audio_root)
    if diagnostics:
        raise ValueError(
            "manifest contains invalid or unlabeled shake rows; refusing to train: "
            + " | ".join(diagnostics)
        )
    report = validate_dataset(captures)
    # Import locally to avoid the audit module's intentional dependency on the
    # Capture/load helpers above.
    from audit_shake_dataset import audit

    audit_report = audit(captures, diagnostics)
    # Keep provenance in the candidate itself so the promotion command cannot
    # accidentally accept a model whose labels were inferred from public
    # effects or another task.
    audit_report["labelSource"] = "coldkeep_measured_only"
    if audit_report["fileErrors"]:
        raise ValueError(
            "audio audit failed; refusing to train: "
            + " | ".join(audit_report["fileErrors"])
        )
    if audit_report["duplicateAudio"]:
        raise ValueError(
            "duplicate audio audit failed; refusing to train: "
            + json.dumps(audit_report["duplicateAudio"], ensure_ascii=False)
        )
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    feature_cache = {item.recording_id: features_for(item, filters) for item in captures}
    group_evaluations = {
        field: evaluate(captures, feature_cache, field)
        for field in HOLDOUT_FIELDS
    }
    evaluation = group_evaluations["session_id"]
    x, y, weights = recording_arrays(captures, feature_cache)
    classifier = SoftmaxClassifier([0, 1, 2], seed=7)
    classifier.fit(x, y, weights)
    status = (
        "trained"
        if (
            audit_report["readyForTraining"]
            and group_evaluations_pass_gate(group_evaluations)
        )
        else "experimental"
    )
    artifact = {
        "version": 1,
        "task": "shake_ice_amount",
        "status": status,
        "classes": list(ICE_AMOUNT_NAMES),
        "sampleRate": TARGET_SAMPLE_RATE,
        "windowSamples": TARGET_SAMPLE_RATE,
        "hopSamples": TARGET_SAMPLE_RATE // 2,
        "featureSize": 128,
        "featureSchema": {
            "name": "log_mel_summary_v1",
            "version": 1,
            "description": "32 normalized log-mel bands plus mean/std and first differences",
            "gainNormalization": "per-window RMS target 0.05, clip [-1,1]",
        },
        "model": classifier.serializable("shake_ice_amount"),
        "dataset": report,
        "audit": audit_report,
        "provenance": {
            "manifestSha256": _file_sha256(manifest),
            "trainer": "ml/train_shake_ice_amount.py",
            "trainerVersion": "shake_ice_amount_v1",
        },
        "evaluation": evaluation,
        "groupEvaluations": group_evaluations,
        "warnings": [
            "Pilot only: collect new sessions across phones, bottles, rooms, and operators.",
            "Public output is none/few/many; exact ice cube counts are not estimated.",
            f"Deployment status is {status}; balanced accuracy gate is "
            f"{MIN_DEPLOYABLE_BALANCED_ACCURACY:.2f}.",
            "A trained artifact requires complete session/container/device/room/operator holdouts and a clean audio audit.",
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
        print(f"SHAKE ICE PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    evaluation = artifact["evaluation"]
    print(
        "shake_ice_amount: "
        f"accuracy={evaluation['accuracy']:.3f}, "
        f"balanced_accuracy={evaluation['balanced_accuracy']:.3f}, "
        f"macro_f1={evaluation['macro_f1']:.3f}, n={evaluation['recordings']}"
    )
    if arguments.output:
        print(f"wrote {arguments.output}")


if __name__ == "__main__":
    main()
