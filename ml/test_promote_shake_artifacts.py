import json
import tempfile
import unittest
from pathlib import Path

from promote_shake_artifacts import promote, validate_candidate


def candidate(task: str, status: str = "trained", score: float = 0.8) -> dict:
    classes = ["empty", "half", "full"] if task == "shake_fill_level" else ["none", "few", "many"]
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
        "evaluation": {"balanced_accuracy": score},
        "audit": {
            "readyForTraining": True,
            "labelSource": "coldkeep_measured_only" if task == "shake_ice_amount" else "coldkeep_measured_only",
        },
    }
    if task == "shake_ice_amount":
        artifact["featureSchema"] = {"name": "log_mel_summary_v1", "version": 1}
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

    def test_trained_candidate_is_atomically_promoted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate_path = root / "candidate.json"
            target = root / "nested" / "artifact.json"
            candidate_path.write_text(json.dumps(candidate("shake_ice_amount")), encoding="utf-8")

            promoted = promote(candidate_path, target, "shake_ice_amount")
            self.assertEqual(promoted["status"], "trained")
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["task"], "shake_ice_amount")


if __name__ == "__main__":
    unittest.main()
