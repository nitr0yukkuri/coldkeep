import unittest
from pathlib import Path

from train_ice_presence import Capture, validate_dataset


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


if __name__ == "__main__":
    unittest.main()
