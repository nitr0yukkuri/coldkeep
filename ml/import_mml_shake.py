"""Convert EPFL's open robot-shake archive into a derived feature cache.

The archive contains 300 ROS1 bags (five materials x two motion families x 30
trials).  This importer downloads only the selected bag byte ranges, decodes
the embedded 16 kHz MP3 microphone stream, and stores transient/log-mel
features.  It never copies raw audio into the repository.

Optional dependencies are kept separate from the dependency-light baseline:
install ``ml/requirements-external-shake.txt`` when running this importer.
"""

from __future__ import annotations

import argparse
import io
import json
import struct
import urllib.request
import zlib
from pathlib import Path

import numpy as np

from audio_features import (
    TARGET_SAMPLE_RATE,
    extract_features,
    extract_transient_features,
    mel_filterbank,
    segment_audio,
)


ARCHIVE_URL = "https://zenodo.org/records/6372438/files/annotated_bags_mml.zip?download=1"
ARCHIVE_SIZE = 795_903_546
DEFAULT_OUTPUT = Path("dataset/derived/mml-shake-action/features.npz")


def _fetch(start: int, end: int) -> bytes:
    request = urllib.request.Request(
        ARCHIVE_URL,
        headers={"Range": f"bytes={start}-{end}", "User-Agent": "ColdKeep-research/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
    expected = end - start + 1
    if len(payload) != expected:
        raise RuntimeError(f"range mismatch {start}-{end}: got {len(payload)} bytes")
    return payload


def _list_entries() -> list[dict]:
    tail_start = ARCHIVE_SIZE - 200_000
    tail = _fetch(tail_start, ARCHIVE_SIZE - 1)
    end_of_directory = tail.rfind(b"PK\x05\x06")
    if end_of_directory < 0:
        raise RuntimeError("ZIP end-of-central-directory record not found")
    fields = struct.unpack_from("<4s4H2LH", tail, end_of_directory)
    central_size, central_offset = fields[5:7]
    central = _fetch(central_offset, central_offset + central_size - 1)
    entries: list[dict] = []
    position = 0
    while position < len(central):
        if central[position : position + 4] != b"PK\x01\x02":
            raise RuntimeError(f"bad ZIP central-directory signature at {position}")
        values = struct.unpack_from("<4s6H3L5H2L", central, position)
        name_length, extra_length, comment_length = values[10:13]
        name = central[position + 46 : position + 46 + name_length].decode("utf-8")
        entries.append(
            {
                "name": name,
                "compressedSize": values[8],
                "uncompressedSize": values[9],
                "method": values[4],
                "localOffset": values[16],
            }
        )
        position += 46 + name_length + extra_length + comment_length
    return entries


def _extract(entry: dict, partial_archive: Path | None) -> bytes:
    local_offset = entry["localOffset"]
    local_header = _fetch(local_offset, local_offset + 29)
    if local_header[:4] != b"PK\x03\x04":
        raise RuntimeError(f"bad ZIP local header for {entry['name']}")
    values = struct.unpack("<4s5H3L2H", local_header)
    name_length, extra_length = values[9:11]
    data_start = local_offset + 30 + name_length + extra_length
    data_end = data_start + entry["compressedSize"] - 1
    if partial_archive and partial_archive.is_file() and data_end < partial_archive.stat().st_size:
        with partial_archive.open("rb") as stream:
            stream.seek(data_start)
            compressed = stream.read(entry["compressedSize"])
    else:
        compressed = _fetch(data_start, data_end)
    if entry["method"] == 0:
        return compressed
    if entry["method"] == 8:
        return zlib.decompress(compressed, -15)
    raise RuntimeError(f"unsupported ZIP compression method {entry['method']}")


def _select(entries: list[dict], per_condition: int) -> list[dict]:
    selected: list[dict] = []
    counts: dict[tuple[str, str], int] = {}
    for entry in entries:
        name = Path(entry["name"]).name
        if not name.endswith(".bag") or name.startswith("._"):
            continue
        parts = name.removesuffix(".bag").split("_")
        if len(parts) < 4:
            continue
        condition = (parts[1], parts[2])
        if counts.get(condition, 0) >= per_condition:
            continue
        selected.append(entry)
        counts[condition] = counts.get(condition, 0) + 1
    return selected


def _decode_audio(bag_bytes: bytes, temporary_bag: Path) -> np.ndarray:
    try:
        import av
        from rosbags.rosbag1 import Reader
    except ImportError as error:  # pragma: no cover - optional runtime path
        raise RuntimeError(
            "external importer needs ml/requirements-external-shake.txt"
        ) from error

    temporary_bag.write_bytes(bag_bytes)
    chunks: list[bytes] = []
    try:
        with Reader(temporary_bag) as reader:
            for connection, _, raw in reader.messages():
                if connection.topic != "/audio/audio":
                    continue
                size = struct.unpack_from("<I", raw, 0)[0]
                chunks.append(raw[4 : 4 + size])
    finally:
        temporary_bag.unlink(missing_ok=True)
    if not chunks:
        raise RuntimeError("bag contains no /audio/audio messages")
    container = av.open(io.BytesIO(b"".join(chunks)), format="mp3")
    frames = [frame.to_ndarray() for frame in container.decode(audio=0)]
    if not frames:
        raise RuntimeError("MP3 stream contains no decodable frames")
    return np.concatenate(frames, axis=1).reshape(-1).astype(np.float32)


def build_cache(
    output: Path,
    per_condition: int,
    partial_archive: Path | None,
    temporary_bag: Path,
) -> dict:
    filters = mel_filterbank(TARGET_SAMPLE_RATE)
    selected = _select(_list_entries(), per_condition)
    log_mel_rows: list[np.ndarray] = []
    transient_rows: list[np.ndarray] = []
    groups: list[str] = []
    for index, entry in enumerate(selected, start=1):
        name = Path(entry["name"]).name
        print(f"[{index}/{len(selected)}] {name}", flush=True)
        audio = _decode_audio(_extract(entry, partial_archive), temporary_bag)
        windows = segment_audio(audio)
        rms = np.sqrt(np.mean(np.square(windows), axis=1))
        for window_index in np.argsort(rms)[-min(3, len(windows)) :]:
            window = windows[window_index]
            log_mel_rows.append(extract_features(window, filters=filters))
            transient_rows.append(extract_transient_features(window))
            groups.append(name)
    if not transient_rows:
        raise RuntimeError("no features were extracted")
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        features=np.stack(log_mel_rows).astype(np.float32),
        transient_features=np.stack(transient_rows).astype(np.float32),
        labels=np.ones(len(groups), dtype=np.int64),
        groups=np.asarray(groups),
    )
    return {
        "source": "EPFL Multimodal Sensory Learning",
        "zenodoRecord": "6372438",
        "sourceUrl": ARCHIVE_URL,
        "recordings": len(set(groups)),
        "windows": len(groups),
        "perCondition": per_condition,
        "output": str(output),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--per-condition", type=int, default=5)
    parser.add_argument("--partial-archive", type=Path)
    parser.add_argument("--temporary-bag", type=Path, default=Path("tmp/mml_one.bag"))
    arguments = parser.parse_args()
    if arguments.per_condition < 1 or arguments.per_condition > 30:
        parser.error("--per-condition must be between 1 and 30")
    try:
        report = build_cache(
            arguments.output,
            arguments.per_condition,
            arguments.partial_archive,
            arguments.temporary_bag,
        )
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"MML SHAKE IMPORT BLOCKED: {error}")
        raise SystemExit(2) from error
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
