import tempfile
import unittest
from pathlib import Path

from audit_shake_dataset import audit
from train_shake_ice_amount import Capture


class ShakeDatasetAuditTests(unittest.TestCase):
    def test_duplicate_audio_with_conflicting_labels_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "same.wav"
            audio.write_bytes(b"not a wav")
            captures = [
                Capture("n", "s1", "b1", "d1", 0, audio),
                Capture("m", "s2", "b2", "d2", 4, audio),
            ]
            report = audit(captures, [])

        self.assertEqual(len(report["duplicateAudio"]), 1)
        self.assertEqual(len(report["hashLabelConflicts"]), 1)
        self.assertFalse(report["readyForAblation"])

    def test_group_holdout_requires_complete_test_and_train_classes(self):
        captures = [
            Capture("n1", "s1", "b-none", "d-none", 0, Path("n1")),
            Capture("f1", "s1", "b-few", "d-few", 1, Path("f1")),
            Capture("m1", "s1", "b-many", "d-many", 3, Path("m1")),
            Capture("n2", "s2", "b-none", "d-none", 0, Path("n2")),
            Capture("f2", "s2", "b-few", "d-few", 1, Path("f2")),
            Capture("m2", "s2", "b-many", "d-many", 3, Path("m2")),
        ]
        report = audit(captures, [])
        self.assertTrue(report["holdouts"]["session_id"]["evaluatable"])
        self.assertFalse(report["holdouts"]["container_id"]["evaluatable"])
        self.assertFalse(report["holdouts"]["device_id"]["evaluatable"])

    def test_same_label_duplicate_audio_is_not_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "same.wav"
            audio.write_bytes(b"not a wav")
            captures = [
                Capture("n1", "s1", "b1", "d1", 0, audio),
                Capture("n2", "s2", "b2", "d2", 0, audio),
            ]
            report = audit(captures, [])
        self.assertEqual(len(report["duplicateAudio"]), 1)
        self.assertFalse(report["readyForAblation"])
        self.assertFalse(report["readyForTraining"])

    def test_incomplete_group_or_temporal_holdouts_are_not_deployable(self):
        captures = [
            Capture(
                recording_id=f"{class_name}-{index}",
                session_id=f"session-{index}",
                container_id=f"container-{index}",
                device_id=f"device-{index}",
                ice_count=ice_count,
                path=Path(f"{class_name}-{index}.wav"),
                recorded_at="2026-08-01T10:00:00Z",
            )
            for index, (class_name, ice_count) in enumerate(
                [("none", 0), ("few", 1), ("many", 3)]
            )
        ]
        report = audit(captures, [])
        self.assertFalse(report["readyForAblation"])
        self.assertFalse(report["readyForTraining"])
        self.assertFalse(report["temporalHoldoutReady"])


if __name__ == "__main__":
    unittest.main()
