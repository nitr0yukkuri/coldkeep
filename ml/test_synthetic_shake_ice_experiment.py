import unittest

import numpy as np

from run_synthetic_shake_ice_experiment import (
    CLASS_NAMES,
    GROUP_FIELDS,
    generate_recordings,
    run_experiment,
)


class SyntheticShakeIceExperimentTests(unittest.TestCase):
    def test_balanced_groups_and_deterministic_waveforms(self):
        first = generate_recordings(groups=2, repetitions=1, seed=123)
        second = generate_recordings(groups=2, repetitions=1, seed=123)
        self.assertEqual(len(first), len(second))
        self.assertEqual(len(first), 48)
        self.assertEqual(len({item.recording_id for item in first}), len(first))
        for left, right in zip(first, second):
            self.assertEqual(left.recording_id, right.recording_id)
            np.testing.assert_array_equal(left.samples, right.samples)
            self.assertEqual(left.samples.shape, (32_000,))
            self.assertTrue(np.isfinite(left.samples).all())

        for field in GROUP_FIELDS:
            for group in sorted({getattr(item, field) for item in first}):
                classes = {
                    CLASS_NAMES[item.ice_count if item.ice_count == 0 else 1]
                    if item.ice_count <= 2
                    else CLASS_NAMES[2]
                    for item in first
                    if getattr(item, field) == group
                }
                self.assertEqual(classes, set(CLASS_NAMES))

    def test_experiment_is_explicitly_research_only(self):
        report = run_experiment(groups=2, repetitions=1, epochs=12, seed=456)
        self.assertEqual(report["status"], "research_only")
        self.assertFalse(report["labelsUsedForProductionTraining"])
        self.assertFalse(report["productionArtifactUpdated"])
        self.assertEqual(set(report["results"]), {
            f"{mode}:{normalization}"
            for mode in ("log_mel", "transient", "combined")
            for normalization in ("gain_normalized", "raw")
        })
        self.assertEqual(len(report["researchModel"]["featureMean"]), 149)


if __name__ == "__main__":
    unittest.main()
