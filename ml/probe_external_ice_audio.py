"""Probe external ice audio without creating an ice-amount model.

External sound effects are useful for checking feature extraction and onset
detectors, but they are not ColdKeep ``none/few/many`` labels.  This script is
deliberately a feature probe: it emits provenance, finite feature summaries,
and decoder diagnostics, never a classifier or production artifact.

WAV/PCM16 input works with the standard library.  MP3/OGG/AIFF input is
optional and uses ``miniaudio`` when it is installed in the research
environment; it is intentionally not a production dependency.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np

try:
    from .audio_features import (
        TARGET_SAMPLE_RATE,
        extract_features,
        extract_transient_features,
        read_pcm16_wav,
        resample,
        segment_audio,
    )
except ImportError:  # Support direct execution from the ml directory.
    from audio_features import (
        TARGET_SAMPLE_RATE,
        extract_features,
        extract_transient_features,
        read_pcm16_wav,
        resample,
        segment_audio,
    )


FORBIDDEN_AMOUNT_LABELS = {"none", "few", "many"}
REQUIRED_COLUMNS = {
    "filename",
    "source_url",
    "label",
    "license",
    "usage",
    # Make the safety boundary explicit in every external manifest.  An
    # omitted opt-out must not be interpreted as permission to reuse a source
    # description as a production amount label.
    "production_label_eligible",
}
PRODUCTION_GUARD_COLUMN = "production_label_eligible"


def _resolve_audio(root: Path, filename: str) -> Path:
    resolved_root = root.resolve()
    candidate = (root / filename).resolve()
    if candidate != resolved_root and resolved_root not in candidate.parents:
        raise ValueError(f"audio filename escapes the audio root: {filename}")
    if not candidate.is_file():
        raise ValueError(f"audio file not found: {candidate}")
    return candidate


def _decode_audio(path: Path) -> np.ndarray:
    if path.suffix.lower() == ".wav":
        samples, sample_rate = read_pcm16_wav(path)
        return resample(samples, sample_rate, TARGET_SAMPLE_RATE)

    try:
        import miniaudio  # type: ignore[import-not-found]
    except ImportError as error:
        raise ValueError(
            f"{path.name}: install optional miniaudio for {path.suffix} decoding, "
            "or convert the file to PCM16 WAV before probing"
        ) from error

    try:
        decoded = miniaudio.decode_file(
            str(path), nchannels=1, sample_rate=TARGET_SAMPLE_RATE
        )
    except Exception as error:  # Decoder-specific errors vary by optional backend.
        raise ValueError(f"{path.name}: audio decoder failed: {error}") from error
    return (
        np.frombuffer(decoded.samples, dtype=np.int16).astype(np.float32) / 32768.0
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def probe(manifest: Path, audio_root: Path) -> dict:
    records: list[dict] = []
    diagnostics: list[str] = []
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - fieldnames)
        if missing:
            raise ValueError("external manifest is missing columns: " + ", ".join(missing))

        for line, row in enumerate(reader, start=2):
            label = (row.get("label") or "").strip().lower()
            if label in FORBIDDEN_AMOUNT_LABELS:
                raise ValueError(
                    f"manifest line {line} contains forbidden amount label {label!r}; "
                    "external audio must not train none/few/many"
                )
            guard = (row.get(PRODUCTION_GUARD_COLUMN) or "").strip().lower()
            if guard != "false":
                raise ValueError(
                    f"manifest line {line} must set "
                    f"{PRODUCTION_GUARD_COLUMN}=false for external audio"
                )
            filename = (row.get("filename") or "").strip()
            if not filename:
                diagnostics.append(f"line {line}: missing filename")
                continue
            try:
                path = _resolve_audio(audio_root, filename)
                actual_hash = _sha256(path)
                expected_hash = (row.get("sha256") or "").strip().upper()
                if expected_hash and expected_hash != actual_hash:
                    raise ValueError(
                        f"sha256 mismatch (expected {expected_hash}, got {actual_hash})"
                    )
                samples = _decode_audio(path)
                windows = segment_audio(samples)
                transient = np.stack(
                    [extract_transient_features(window) for window in windows]
                )
                log_mel = np.stack([extract_features(window) for window in windows])
                records.append(
                    {
                        "filename": filename,
                        "sourceUrl": (row.get("source_url") or "").strip(),
                        "label": label or None,
                        "license": (row.get("license") or "").strip(),
                        "usage": (row.get("usage") or "").strip(),
                        # A source description can be retained for audit, but
                        # is never converted into a ColdKeep amount label.
                        "authorClaimedCount": (
                            row.get("author_claimed_count") or ""
                        ).strip()
                        or None,
                        "claimText": (row.get("claim_text") or "").strip() or None,
                        "sha256": actual_hash,
                        "durationSeconds": len(samples) / TARGET_SAMPLE_RATE,
                        "windows": len(windows),
                        "transientMean": np.round(transient.mean(axis=0), 6).tolist(),
                        "logMelFinite": bool(np.isfinite(log_mel).all()),
                    }
                )
            except (OSError, ValueError) as error:
                diagnostics.append(f"line {line}: {error}")

    return {
        "status": "research_only",
        "task": "external_ice_feature_probe",
        "model": None,
        "labelsUsedForTraining": False,
        "productionArtifactUpdated": False,
        "records": records,
        "diagnostics": diagnostics,
        "warnings": [
            "External audio is not ColdKeep measured ground truth.",
            "Transient/onset values are feature probes, not cube counts.",
            "Do not use this report as ColdKeep accuracy evidence.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = probe(args.manifest, args.audio_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        f"external feature probe: records={len(report['records'])}, "
        f"diagnostics={len(report['diagnostics'])}, status={report['status']}"
    )


if __name__ == "__main__":
    main()
