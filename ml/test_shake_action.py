import csv
import tempfile
import unittest
from pathlib import Path

from train_shake_action import ACTION_NAMES, load_action_labels


class ShakeActionTests(unittest.TestCase):
    def test_checked_in_map_contains_both_actions(self):
        root = Path(__file__).resolve().parents[1]
        labels = load_action_labels(
            root / "dataset" / "derived" / "acm-s2-shake-action" / "action_labels.csv"
        )
        self.assertEqual(len(labels), 21)
        self.assertEqual(sum(action == "shake" for action in labels.values()), 2)
        self.assertEqual(set(labels.values()), set(ACTION_NAMES))
        self.assertEqual(
            {recording_id for recording_id, action in labels.items() if action == "shake"},
            {11, 17},
        )

    def test_mapping_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "labels.csv"
            with path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(
                    stream, fieldnames=["recording_id", "action", "label_source"]
                )
                writer.writeheader()
                writer.writerow({"recording_id": "1", "action": "pour", "label_source": "test"})
                writer.writerow({"recording_id": "1", "action": "shake", "label_source": "test"})
            with self.assertRaisesRegex(ValueError, "duplicate id"):
                load_action_labels(path)

    def test_mapping_rejects_unknown_action(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "labels.csv"
            path.write_text(
                "recording_id,action,label_source\n1,throw,test\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "unsupported action"):
                load_action_labels(path)


if __name__ == "__main__":
    unittest.main()
