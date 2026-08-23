import tempfile
import unittest
from pathlib import Path

import numpy as np

from audio_features import TRANSIENT_FEATURE_NAMES
from train_shake_action_augmented import load_external_features


class AugmentedShakeActionTests(unittest.TestCase):
    def test_external_cache_is_grouped_and_shape_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "features.npz"
            np.savez(
                path,
                transient_features=np.zeros((2, len(TRANSIENT_FEATURE_NAMES)), dtype=np.float32),
                labels=np.ones(2, dtype=np.int64),
                groups=np.asarray(["bag-a", "bag-a"]),
            )
            features, groups = load_external_features(path)
            self.assertEqual(features.shape, (2, len(TRANSIENT_FEATURE_NAMES)))
            self.assertEqual(groups.tolist(), ["bag-a", "bag-a"])

    def test_external_cache_rejects_non_shake_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "features.npz"
            np.savez(
                path,
                transient_features=np.zeros((1, len(TRANSIENT_FEATURE_NAMES)), dtype=np.float32),
                labels=np.zeros(1, dtype=np.int64),
                groups=np.asarray(["bag-a"]),
            )
            with self.assertRaisesRegex(ValueError, "shake positives"):
                load_external_features(path)


if __name__ == "__main__":
    unittest.main()
