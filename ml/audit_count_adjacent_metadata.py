"""Audit a public count-adjacent metadata snapshot without making labels.

Some public vibration datasets expose an exact object-count field, but that
does not make the rows ColdKeep ice labels.  This tool deliberately stops at
provenance and coverage accounting.  It never maps a numeric count to
``none``/``few``/``many`` and never writes a model or a ColdKeep manifest.

The input is JSON Lines so a large upstream metadata file can be audited
without loading audio or the complete dataset into memory.  The report is
safe to check in as research evidence and always carries an explicit
``productionLabelEligible: false`` guard.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


DEFAULT_LABEL_FIELD = "n_objects"
DEFAULT_ID_FIELD = "experiment_id"
DEFAULT_AUDIO_FIELD = "audio_file_name"


def _display_value(value: Any) -> str:
    """Return a stable, bounded JSON-compatible key for report counters."""
    if value is None:
        return "<missing>"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, str)):
        return str(value)
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def _read_rows(path: Path) -> tuple[Iterable[dict[str, Any]], list[str]]:
    """Read JSONL rows and retain malformed-line diagnostics."""
    diagnostics: list[str] = []

    def rows() -> Iterable[dict[str, Any]]:
        with path.open(encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as error:
                    diagnostics.append(f"line {line_number}: invalid JSON ({error.msg})")
                    continue
                if not isinstance(value, dict):
                    diagnostics.append(f"line {line_number}: row is not an object")
                    continue
                yield value

    return rows(), diagnostics


def audit(
    path: Path,
    *,
    dataset_name: str,
    source_url: str,
    license_name: str,
    label_field: str = DEFAULT_LABEL_FIELD,
    id_field: str = DEFAULT_ID_FIELD,
    audio_field: str = DEFAULT_AUDIO_FIELD,
    object_field: str = "object",
    material_field: str = "box_material",
    sensor_field: str = "speakers",
) -> dict[str, Any]:
    """Return an auditable count-adjacent report for one local JSONL file."""
    rows, diagnostics = _read_rows(path)
    label_counts: Counter[str] = Counter()
    object_counts: Counter[str] = Counter()
    material_counts: Counter[str] = Counter()
    sensor_counts: Counter[str] = Counter()
    ids: Counter[str] = Counter()
    audio_urls: Counter[str] = Counter()
    row_count = 0
    missing_labels = 0
    numeric_labels: list[float] = []

    for row in rows:
        row_count += 1
        label = row.get(label_field)
        if label is None or label == "":
            missing_labels += 1
        else:
            label_counts[_display_value(label)] += 1
            if isinstance(label, (int, float)) and not isinstance(label, bool):
                numeric_labels.append(float(label))
        object_counts[_display_value(row.get(object_field))] += 1
        material_counts[_display_value(row.get(material_field))] += 1
        sensor_counts[_display_value(row.get(sensor_field))] += 1
        if row.get(id_field) not in (None, ""):
            ids[_display_value(row[id_field])] += 1
        if row.get(audio_field) not in (None, ""):
            audio_urls[_display_value(row[audio_field])] += 1

    duplicate_ids = {key: count for key, count in ids.items() if count > 1}
    duplicate_audio = {key: count for key, count in audio_urls.items() if count > 1}
    integer_labels = all(value.is_integer() for value in numeric_labels)
    label_values = sorted(
        {int(value) if value.is_integer() else value for value in numeric_labels}
    )
    return {
        "version": 1,
        "status": "ok" if row_count and not diagnostics else "insufficient_data",
        "task": "count_adjacent_metadata_audit",
        "productionLabelEligible": False,
        "labelsUsedForProductionTraining": False,
        "productionArtifactUpdated": False,
        "dataset": {
            "name": dataset_name,
            "sourceUrl": source_url,
            "license": license_name,
            # Keep reports portable: the input is a local snapshot and may
            # live outside the repository on the machine that ran the audit.
            "metadataPath": path.name,
            "labelField": label_field,
            "idField": id_field,
            "audioField": audio_field,
        },
        "rows": row_count,
        "invalidRows": diagnostics,
        "missingLabelRows": missing_labels,
        "labelDistribution": dict(sorted(label_counts.items())),
        "numericLabelValues": label_values if integer_labels else numeric_labels,
        "objectDistribution": dict(sorted(object_counts.items())),
        "materialDistribution": dict(sorted(material_counts.items())),
        "sensorDistribution": dict(sorted(sensor_counts.items())),
        "duplicateIds": duplicate_ids,
        "duplicateAudioReferences": duplicate_audio,
        "warnings": [
            "The numeric count is not an ice_count measured with a ColdKeep phone and bottle.",
            "Do not map this field to none/few/many or add rows to the ColdKeep training manifest.",
            "Use only for feature development, auxiliary pretraining, or domain-gap analysis.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="local JSONL metadata snapshot")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dataset-name", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--license", dest="license_name", required=True)
    parser.add_argument("--label-field", default=DEFAULT_LABEL_FIELD)
    parser.add_argument("--id-field", default=DEFAULT_ID_FIELD)
    parser.add_argument("--audio-field", default=DEFAULT_AUDIO_FIELD)
    args = parser.parse_args()
    report = audit(
        args.input,
        dataset_name=args.dataset_name,
        source_url=args.source_url,
        license_name=args.license_name,
        label_field=args.label_field,
        id_field=args.id_field,
        audio_field=args.audio_field,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if report["status"] != "ok":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
