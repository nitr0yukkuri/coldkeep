import unittest
from pathlib import Path

from train_shake_level import Capture, level_index, validate_dataset


class ShakeLevelTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
