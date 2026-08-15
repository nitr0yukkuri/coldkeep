"""Re-run the ACM-S2 shake pilot without manufacturing labels.

ACM-S2 contains only two shake recordings from the same muesli box: empty and
50% pasta.  This command deliberately exercises the real shake trainer and
exits with a blocked result instead of emitting a model artifact.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from train_shake_level import Capture, validate_dataset


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIO_ROOT = ROOT / "dataset" / "external" / "acm-s2" / "acm_s2_audio"


def run(audio_root: Path) -> dict:
    """Validate the two labelled ACM-S2 shake recordings."""
    # `Capture.water_ml` is the existing trainer's generic fill-volume field;
    # ACM-S2's second row is 50% pasta, not water.  Only the ratio is used here.
    rows = [
        Capture(
            recording_id="000017",
            session_id="acm-s2-muesli-box",
            container_id="muesli_box",
            device_id="blue-yeti",
            capacity_ml=300,
            water_ml=0,
            action="shake",
            path=audio_root / "000017.wav",
        ),
        Capture(
            recording_id="000011",
            session_id="acm-s2-muesli-box",
            container_id="muesli_box",
            device_id="blue-yeti",
            capacity_ml=300,
            water_ml=150,
            action="shake",
            path=audio_root / "000011.wav",
        ),
    ]
    missing = [str(item.path) for item in rows if not item.path.is_file()]
    if missing:
        raise FileNotFoundError("ACM-S2 shake audio is missing: " + ", ".join(missing))
    return validate_dataset(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio-root", type=Path, default=DEFAULT_AUDIO_ROOT)
    arguments = parser.parse_args()
    try:
        report = run(arguments.audio_root)
    except (FileNotFoundError, ValueError) as error:
        print(f"SHAKE PILOT BLOCKED: {error}")
        raise SystemExit(2) from error
    print(report)


if __name__ == "__main__":
    main()
