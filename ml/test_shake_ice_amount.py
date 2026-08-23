import tempfile
import unittest
from pathlib import Path

from train_shake_ice_amount import (
    Capture,
    ICE_AMOUNT_NAMES,
    HOLDOUT_FIELDS,
    group_evaluations_pass_gate,
    ice_amount_index,
    load_manifest,
    recording_day,
    validate_dataset,
)


class ShakeIceAmountTests(unittest.TestCase):
    def test_public_bands_are_coarse_and_stable(self):
        self.assertEqual([ice_amount_index(value) for value in (0, 1, 2, 3, 99)], [0, 1, 1, 2, 2])
        self.assertEqual(ICE_AMOUNT_NAMES, ("none", "few", "many"))

    def test_every_required_holdout_metric_must_pass_the_deployment_gate(self):
        evaluations = {
            field: {
                "recordings": 6,
                "validFolds": 2,
                "balanced_accuracy": 0.67,
            }
            for field in HOLDOUT_FIELDS
        }
        self.assertTrue(group_evaluations_pass_gate(evaluations))

        evaluations["device_id"]["balanced_accuracy"] = 0.669
        self.assertFalse(group_evaluations_pass_gate(evaluations))
        evaluations.pop("device_id")
        self.assertFalse(group_evaluations_pass_gate(evaluations))

    def test_recording_day_requires_a_valid_timezone_aware_iso_timestamp(self):
        self.assertEqual(recording_day("2026-08-01T10:00:00Z"), "2026-08-01")
        self.assertEqual(recording_day("2026-08-01T10:00:00+09:00"), "2026-08-01")
        self.assertIsNone(recording_day("2026-08-01T10:00:00"))
        self.assertIsNone(recording_day("2026-99-99T10:00:00Z"))

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
                "recording_id,session_id,container_id,device_id,capacity_ml,water_ml,ice_count,ice_mass_g,temperature_c,microphone_distance_cm,action,audio_filename,label_source,room_id,operator_id\n"
                "outside,s1,bottle,phone,500,250,0,0,20,10,shake,../outside.wav,coldkeep_measured,room-1,operator-1\n"
                "same,s1,bottle,phone,500,250,1,0,20,10,shake,ok.wav,coldkeep_measured,room-1,operator-1\n"
                "same,s1,bottle,phone,500,250,1,0,20,10,shake,ok.wav,coldkeep_measured,room-1,operator-1\n",
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
                "recording_id,session_id,container_id,device_id,ice_count,action,audio_filename,label_source,room_id,operator_id\n"
                "external,s1,bottle,phone,0,shake,external.wav,external_unlabeled,room-1,operator-1\n",
                encoding="utf-8",
            )
            captures, diagnostics = load_manifest(manifest, audio_root)
        self.assertEqual(captures, [])
        self.assertTrue(any("label_source must be coldkeep_measured" in item for item in diagnostics))

    def test_manifest_requires_room_and_operator_holdout_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio_root = root / "audio"
            audio_root.mkdir()
            manifest = root / "manifest.csv"
            manifest.write_text(
                "recording_id,session_id,container_id,device_id,ice_count,action,audio_filename,label_source\n"
                "missing,s1,bottle,phone,0,shake,missing.wav,coldkeep_measured\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "missing columns:.*operator_id"):
                load_manifest(manifest, audio_root)


if __name__ == "__main__":
    unittest.main()
