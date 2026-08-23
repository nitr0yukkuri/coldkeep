import csv
import hashlib
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

try:
    from .probe_external_ice_audio import probe
except ImportError:  # Support unittest discovery with ml as the search root.
    from probe_external_ice_audio import probe


class ExternalIceProbeTests(unittest.TestCase):
    def _write_manifest(self, root: Path, label: str) -> Path:
        audio = root / "ice.wav"
        samples = np.zeros(16_000, dtype="<i2")
        with wave.open(str(audio), "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(16_000)
            stream.writeframes(samples.tobytes())
        manifest = root / "manifest.csv"
        with manifest.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(
                stream,
                fieldnames=["filename", "source_url", "label", "license", "usage", "sha256"],
            )
            writer.writeheader()
            writer.writerow(
                {
                    "filename": "ice.wav",
                    "source_url": "https://example.invalid/ice",
                    "label": label,
                    "license": "CC0",
                    "usage": "feature_probe_only",
                    "sha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
                }
            )
        return manifest

    def test_probe_is_research_only_and_never_emits_a_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = probe(self._write_manifest(root, "ice_present"), root)
        self.assertEqual(report["status"], "research_only")
        self.assertIsNone(report["model"])
        self.assertFalse(report["labelsUsedForTraining"])
        self.assertFalse(report["productionArtifactUpdated"])
        self.assertEqual(len(report["records"]), 1)
        self.assertTrue(report["records"][0]["logMelFinite"])

    def test_probe_rejects_external_amount_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self._write_manifest(root, "few")
            with self.assertRaisesRegex(ValueError, "forbidden amount label"):
                probe(manifest, root)


if __name__ == "__main__":
    unittest.main()
