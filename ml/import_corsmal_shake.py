"""Create an explicitly unlabeled external manifest from CORSMAL CCM.

The official annotation table contains filling levels but does not expose the
physical action as a ColdKeep label.  Therefore this importer requires an
explicit file of IDs known to be shaking recordings.  It never guesses an
action from a filename or scenario.  The generated rows are external material
only: CORSMAL has no measured ColdKeep ice-count ground truth, so the ColdKeep
trainer must reject these rows as labels.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


OUTPUT_HEADER = [
    "recording_id",
    "recorded_at",
    "session_id",
    "container_id",
    "device_id",
    "capacity_ml",
    "water_ml",
    "ice_count",
    "ice_mass_g",
    "temperature_c",
    "microphone_distance_cm",
    "action",
    "audio_filename",
    "sample_rate_hz",
    "channels",
    "bit_depth",
    "duration_seconds",
    "platform",
    "label_source",
]


def read_ids(path: Path) -> list[int]:
    ids: list[int] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        value = raw.strip()
        if not value or value.startswith("#"):
            continue
        try:
            identifier = int(value.split(",", 1)[0].strip())
        except ValueError as error:
            raise ValueError(f"shake id line {line_number} is not an integer: {value!r}") from error
        if identifier < 0:
            raise ValueError(f"shake id must be non-negative: {identifier}")
        ids.append(identifier)
    if len(ids) != len(set(ids)):
        raise ValueError("shake id file contains duplicates")
    return ids


def read_session_map(path: Path | None) -> dict[int, str]:
    if path is None:
        return {}
    result: dict[int, str] = {}
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not reader.fieldnames or not {"id", "session_id"}.issubset(reader.fieldnames):
            raise ValueError("session map must contain id,session_id columns")
        for row in reader:
            identifier = int((row.get("id") or "").strip())
            session = (row.get("session_id") or "").strip()
            if not session:
                raise ValueError(f"session map has an empty session_id for {identifier}")
            if identifier in result:
                raise ValueError(f"session map contains duplicate id {identifier}")
            result[identifier] = session
    return result


def load_annotations(path: Path) -> dict[int, dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"id", "container id", "container capacity", "filling level"}
        missing = sorted(required - set(reader.fieldnames or []))
        if missing:
            raise ValueError("annotation file is missing columns: " + ", ".join(missing))
        result: dict[int, dict[str, str]] = {}
        for row in reader:
            identifier = int((row.get("id") or "").strip())
            if identifier in result:
                raise ValueError(f"annotation file contains duplicate id {identifier}")
            result[identifier] = row
    return result


def find_audio(data_root: Path, identifier: int) -> Path | None:
    filename = f"{identifier:06d}.wav"
    direct_candidates = [
        data_root / "audio" / filename,
        data_root / "audios" / filename,
    ]
    for candidate in direct_candidates:
        if candidate.is_file():
            return candidate
    # The dataset has shipped with both a flat audio directory and numbered
    # container directories. Limit the fallback to the exact filename.
    matches = sorted(data_root.rglob(filename))
    return matches[0] if matches else None


def level_ratio(raw: str, identifier: int) -> float:
    try:
        level = int(float(raw))
    except ValueError as error:
        raise ValueError(f"annotation {identifier} has invalid filling level {raw!r}") from error
    if level not in (0, 1, 2):
        raise ValueError(f"annotation {identifier} has unsupported filling level {level}")
    return (0.0, 0.5, 1.0)[level]


def import_manifest(
    data_root: Path,
    annotations_path: Path,
    shake_ids_path: Path,
    output_path: Path,
    session_map_path: Path | None = None,
) -> dict[str, int]:
    annotations = load_annotations(annotations_path)
    shake_ids = read_ids(shake_ids_path)
    sessions = read_session_map(session_map_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = skipped = 0
    with output_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=OUTPUT_HEADER)
        writer.writeheader()
        for identifier in shake_ids:
            row = annotations.get(identifier)
            audio = find_audio(data_root, identifier)
            if row is None or audio is None:
                skipped += 1
                continue
            capacity = float((row.get("container capacity") or "").strip())
            if capacity <= 0:
                raise ValueError(f"annotation {identifier} has invalid capacity")
            ratio = level_ratio(row.get("filling level") or "", identifier)
            relative_audio = audio.relative_to(data_root).as_posix()
            writer.writerow(
                {
                    "recording_id": f"corsmal-{identifier:06d}",
                    "recorded_at": "",
                    "session_id": sessions.get(identifier, "corsmal-train"),
                    "container_id": f"corsmal-{(row.get('container id') or '').strip()}",
                    "device_id": "corsmal-array-8ch",
                    "capacity_ml": f"{capacity:g}",
                    "water_ml": f"{capacity * ratio:g}",
                    # CORSMAL has no ColdKeep ice-count ground truth. Keep the
                    # fields empty instead of turning external audio into a
                    # false `none` label.
                    "ice_count": "",
                    "ice_mass_g": "",
                    "temperature_c": "20",
                    "microphone_distance_cm": "0",
                    "action": "shake",
                    "audio_filename": relative_audio,
                    "sample_rate_hz": "44100",
                    "channels": "8",
                    "bit_depth": "16",
                    "duration_seconds": "",
                    "platform": "corsmal-ccm-pretrain",
                    "label_source": "external_unlabeled",
                }
            )
            written += 1
    return {"requested": len(shake_ids), "written": written, "skipped": skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--shake-ids", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--session-map", type=Path)
    args = parser.parse_args()
    report = import_manifest(
        args.data_root,
        args.annotations,
        args.shake_ids,
        args.output,
        args.session_map,
    )
    print(
        f"CORSMAL shake manifest: requested={report['requested']} "
        f"written={report['written']} skipped={report['skipped']}"
    )


if __name__ == "__main__":
    main()
