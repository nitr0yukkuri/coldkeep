import tempfile
import unittest
from pathlib import Path

from train_ice_presence import Capture, load_manifest, validate_dataset


class IcePresenceTests(unittest.TestCase):
    def test_dataset_requires_two_containers_per_class(self):
        captures = [
            Capture(f"n{index}", "session-1", f"bottle-{index}", "phone", 0, Path("x"))
            for index in range(2)
        ] + [
            Capture(f"p{index}", "session-1", "bottle-ice", "phone", 1, Path("x"))
            for index in range(2)
        ]

        with self.assertRaisesRegex(ValueError, "containers per class"):
            validate_dataset(captures)

    def test_dataset_report_contains_class_and_group_counts(self):
        captures = [
            Capture("n1", "s1", "bottle-1", "phone-1", 0, Path("x")),
            Capture("n2", "s2", "bottle-2", "phone-2", 0, Path("x")),
            Capture("p1", "s1", "bottle-1", "phone-1", 1, Path("x")),
            Capture("p2", "s2", "bottle-2", "phone-2", 1, Path("x")),
        ]

        report = validate_dataset(captures)

        self.assertEqual(report["classCounts"], {"0": 2, "1": 2})
        self.assertEqual(report["containersPerClass"], {"0": 2, "1": 2})

    def test_manifest_rejects_external_label_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "audio"
            audio.mkdir()
            (audio / "external.wav").write_bytes(b"not a wav")
            manifest = root / "manifest.csv"
            manifest.write_text(
                "recording_id,session_id,container_id,device_id,ice_count,audio_filename,label_source\n"
                "external,s1,bottle,phone,1,external.wav,external_unlabeled\n",
                encoding="utf-8",
            )

            captures, diagnostics = load_manifest(manifest, audio)

        self.assertEqual(captures, [])
        self.assertTrue(
            any("label_source must be coldkeep_measured" in item for item in diagnostics)
        )


if __name__ == "__main__":
    unittest.main()
