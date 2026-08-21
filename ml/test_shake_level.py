import tempfile
import unittest
from pathlib import Path

from train_shake_level import (
    MIN_DEPLOYABLE_BALANCED_ACCURACY,
    Capture,
    level_index,
    load_manifest,
    validate_dataset,
)


class ShakeLevelTests(unittest.TestCase):
    def test_deployment_gate_is_explicit(self):
        self.assertGreaterEqual(MIN_DEPLOYABLE_BALANCED_ACCURACY, 0.5)
        self.assertLessEqual(MIN_DEPLOYABLE_BALANCED_ACCURACY, 1.0)

    def test_transition_bands_are_not_forced_into_a_class(self):
        self.assertEqual(level_index(0.0), 0)
        self.assertEqual(level_index(0.10), 0)
        self.assertIsNone(level_index(0.20))
        self.assertEqual(level_index(0.50), 1)
        self.assertIsNone(level_index(0.80))
        self.assertEqual(level_index(0.90), 2)
        self.assertIsNone(level_index(1.01))

    def test_dataset_requires_all_classes_in_two_sessions(self):
        captures = [
            Capture(f"e{index}", f"s{index % 2}", "bottle", "phone", 500, 0, "shake", Path("x"))
            for index in range(2)
        ] + [
            Capture(f"h{index}", f"s{index % 2}", "bottle", "phone", 500, 250, "shake", Path("x"))
            for index in range(2)
        ]
        with self.assertRaisesRegex(ValueError, r"missing class\(es\) full"):
            validate_dataset(captures)

    def test_manifest_rejects_audio_path_escape_and_duplicate_id(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio_root = root / "audio"
            audio_root.mkdir()
            (audio_root / "ok.wav").write_bytes(b"not a wav")
            manifest = root / "manifest.csv"
            manifest.write_text(
                "recording_id,session_id,container_id,device_id,capacity_ml,water_ml,ice_count,ice_mass_g,temperature_c,microphone_distance_cm,action,audio_filename\n"
                "outside,s1,bottle,phone,500,250,0,0,20,10,shake,../outside.wav\n"
                "same,s1,bottle,phone,500,250,0,0,20,10,shake,ok.wav\n"
                "same,s1,bottle,phone,500,250,0,0,20,10,shake,ok.wav\n",
                encoding="utf-8",
            )

            captures, diagnostics = load_manifest(manifest, audio_root)

        self.assertEqual([item.recording_id for item in captures], ["same"])
        self.assertTrue(any("escapes the audio root" in item for item in diagnostics))
        self.assertTrue(any("duplicate recording_id" in item for item in diagnostics))


if __name__ == "__main__":
    unittest.main()
