import tempfile
import unittest
from pathlib import Path

from train_shake_ice_amount import (
    Capture,
    ICE_AMOUNT_NAMES,
    ice_amount_index,
    load_manifest,
    validate_dataset,
)


class ShakeIceAmountTests(unittest.TestCase):
    def test_public_bands_are_coarse_and_stable(self):
        self.assertEqual([ice_amount_index(value) for value in (0, 1, 2, 3, 99)], [0, 1, 1, 2, 2])
        self.assertEqual(ICE_AMOUNT_NAMES, ("none", "few", "many"))

    def test_dataset_requires_all_bands_in_two_sessions(self):
        captures = [
            Capture(f"n{index}", f"s{index % 2}", "bottle", "phone", 0, Path("x"))
            for index in range(2)
        ] + [
            Capture(f"f{index}", f"s{index % 2}", "bottle", "phone", 1, Path("x"))
            for index in range(2)
        ]
        with self.assertRaisesRegex(ValueError, r"missing class\(es\) many"):
            validate_dataset(captures)

    def test_manifest_rejects_path_escape_and_duplicate_id(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio_root = root / "audio"
            audio_root.mkdir()
            (audio_root / "ok.wav").write_bytes(b"not a wav")
            manifest = root / "manifest.csv"
            manifest.write_text(
                "recording_id,session_id,container_id,device_id,capacity_ml,water_ml,ice_count,ice_mass_g,temperature_c,microphone_distance_cm,action,audio_filename,label_source\n"
                "outside,s1,bottle,phone,500,250,0,0,20,10,shake,../outside.wav,coldkeep_measured\n"
                "same,s1,bottle,phone,500,250,1,0,20,10,shake,ok.wav,coldkeep_measured\n"
                "same,s1,bottle,phone,500,250,1,0,20,10,shake,ok.wav,coldkeep_measured\n",
                encoding="utf-8",
            )
            captures, diagnostics = load_manifest(manifest, audio_root)
        self.assertEqual([item.recording_id for item in captures], ["same"])
        self.assertTrue(any("escapes the audio root" in item for item in diagnostics))
        self.assertTrue(any("duplicate recording_id" in item for item in diagnostics))

    def test_manifest_rejects_external_label_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio_root = root / "audio"
            audio_root.mkdir()
            (audio_root / "external.wav").write_bytes(b"not a wav")
            manifest = root / "manifest.csv"
            manifest.write_text(
                "recording_id,session_id,container_id,device_id,ice_count,action,audio_filename,label_source\n"
                "external,s1,bottle,phone,0,shake,external.wav,external_unlabeled\n",
                encoding="utf-8",
            )
            captures, diagnostics = load_manifest(manifest, audio_root)
        self.assertEqual(captures, [])
        self.assertTrue(any("label_source must be coldkeep_measured" in item for item in diagnostics))


if __name__ == "__main__":
    unittest.main()
