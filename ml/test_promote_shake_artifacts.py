import json
import tempfile
import unittest
from pathlib import Path

from promote_shake_artifacts import promote, promote_many, validate_candidate


def candidate(task: str, status: str = "trained", score: float = 0.8) -> dict:
    classes = ["empty", "half", "full"] if task == "shake_fill_level" else ["none", "few", "many"]
    per_class = round(score * 100)
    remainder = 100 - per_class
    confusion = [
        [per_class, remainder, 0],
        [0, per_class, remainder],
        [remainder, 0, per_class],
    ]
    evaluation = {
        "classes": classes,
        "recordings": 300,
        "accuracy": score,
        "balanced_accuracy": score,
        "macro_f1": score,
        "confusion_matrix": confusion,
        "recall": {str(index): score for index in range(3)},
        "precision": {str(index): score for index in range(3)},
    }
    model = {
        "task": task,
        "classes": [0, 1, 2],
        "featureMean": [0.0] * 128,
        "featureScale": [1.0] * 128,
        "weights": [[0.0, 0.0, 0.0] for _ in range(128)],
        "bias": [0.0, 0.0, 0.0],
    }
    artifact = {
        "version": 1,
        "task": task,
        "status": status,
        "classes": classes,
        "sampleRate": 16_000,
        "windowSamples": 16_000,
        "hopSamples": 8_000,
        "featureSize": 128,
        "model": model,
        "evaluation": evaluation,
        "audit": {
            "readyForTraining": True,
            "labelSource": "coldkeep_measured_only" if task == "shake_ice_amount" else "coldkeep_measured_only",
        },
        "provenance": {
            "manifestSha256": "a" * 64,
            "trainer": f"ml/train_{'shake_ice_amount' if task == 'shake_ice_amount' else 'shake_level'}.py",
            "trainerVersion": "test",
        },
    }
    if task == "shake_ice_amount":
        artifact["featureSchema"] = {"name": "log_mel_summary_v1", "version": 1}
        artifact["groupEvaluations"] = {
            field: {
                **evaluation,
                "groupField": field,
                "validFolds": 2,
            }
            for field in (
                "session_id",
                "container_id",
                "device_id",
                "room_id",
                "operator_id",
            )
        }
    return artifact


class ShakeArtifactPromotionTests(unittest.TestCase):
    def test_untrained_candidate_is_rejected_without_touching_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate_path = root / "candidate.json"
            target = root / "target.json"
            candidate_path.write_text(json.dumps(candidate("shake_fill_level", "untrained")), encoding="utf-8")
            target.write_text("keep-me", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "status is not trained"):
                promote(candidate_path, target, "shake_fill_level")
            self.assertEqual(target.read_text(encoding="utf-8"), "keep-me")

    def test_low_score_candidate_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            path.write_text(json.dumps(candidate("shake_ice_amount", score=0.66)), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "below the deployment gate"):
                validate_candidate(path, "shake_ice_amount")

    def test_ice_candidate_requires_scored_physical_holdouts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            value = candidate("shake_ice_amount")
            value.pop("groupEvaluations")
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "groupEvaluations is missing"):
                validate_candidate(path, "shake_ice_amount")

    def test_fill_candidate_with_inferred_labels_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            value = candidate("shake_fill_level")
            value["audit"]["labelSource"] = "external_unlabeled"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "measured ColdKeep labels"):
                validate_candidate(path, "shake_fill_level")

    def test_trained_candidate_is_atomically_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate_path = root / "candidate.json"
            target = root / "nested" / "artifact.json"
            candidate_path.write_text(json.dumps(candidate("shake_ice_amount")), encoding="utf-8")

            promoted = promote(candidate_path, target, "shake_ice_amount")
            self.assertEqual(promoted["status"], "trained")
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["task"], "shake_ice_amount")

    def test_bulk_promotion_validates_every_candidate_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fill_path = root / "fill.json"
            ice_path = root / "ice.json"
            fill_target = root / "fill-target.json"
            ice_target = root / "ice-target.json"
            fill_path.write_text(json.dumps(candidate("shake_fill_level")), encoding="utf-8")
            invalid_ice = candidate("shake_ice_amount", score=0.66)
            ice_path.write_text(json.dumps(invalid_ice), encoding="utf-8")
            fill_target.write_text("keep-fill", encoding="utf-8")
            ice_target.write_text("keep-ice", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "below the deployment gate"):
                promote_many(
                    [
                        (fill_path, fill_target, "shake_fill_level"),
                        (ice_path, ice_target, "shake_ice_amount"),
                    ]
                )
            self.assertEqual(fill_target.read_text(encoding="utf-8"), "keep-fill")
            self.assertEqual(ice_target.read_text(encoding="utf-8"), "keep-ice")

    def test_manifest_hash_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            path.write_text(json.dumps(candidate("shake_ice_amount")), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "manifest hash"):
                validate_candidate(path, "shake_ice_amount", "b" * 64)

    def test_claimed_precision_and_macro_f1_must_match_confusion_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            value = candidate("shake_ice_amount")
            value["evaluation"]["precision"]["0"] = 0.1
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"precision\[0\].*confusion"):
                validate_candidate(path, "shake_ice_amount")

            value = candidate("shake_ice_amount")
            value["evaluation"]["macro_f1"] = 0.1
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"macro_f1.*confusion"):
                validate_candidate(path, "shake_ice_amount")


if __name__ == "__main__":
    unittest.main()
