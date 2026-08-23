import unittest

import numpy as np

from run_external_mixture_experiment import (
    SeedAudio,
    generate_recordings,
    research_artifact,
    run_experiment,
)


class ExternalMixtureExperimentTests(unittest.TestCase):
    def _seeds(self):
        first = np.zeros(32_000, dtype=np.float32)
        second = np.zeros(32_000, dtype=np.float32)
        first[2_000:2_160] = np.hanning(160).astype(np.float32)
        second[8_000:8_240] = np.hanning(240).astype(np.float32)
        return [
            SeedAudio("one-soft", "one-soft.mp3", "https://example.test/one", "A" * 64, first),
            SeedAudio("one-loud", "one-loud.mp3", "https://example.test/two", "B" * 64, second),
        ]

    def test_generation_has_all_synthetic_amount_bands(self):
        captures = generate_recordings(self._seeds(), groups=2, repetitions=1, seed=7)
        self.assertEqual(len(captures), 48)
        self.assertEqual({capture.ice_count for capture in captures}, set(range(6)))
        self.assertEqual({capture.source_id for capture in captures}, {"one-soft", "one-loud"})

    def test_report_and_artifact_are_research_only(self):
        report = run_experiment(self._seeds(), groups=2, repetitions=1, epochs=4, seed=7)
        self.assertEqual(report["status"], "research_only")
        self.assertFalse(report["labelsUsedForProductionTraining"])
        self.assertFalse(report["productionArtifactUpdated"])
        self.assertEqual(report["labelSource"], "synthetic_external_single_event_mixture")
        self.assertIn("source_id", report["holdoutGroups"])
        artifact = research_artifact(report)
        self.assertEqual(artifact["status"], "research_only")
        self.assertEqual(artifact["featureSize"], 149)
        self.assertFalse(artifact["provenance"]["productionArtifactUpdated"])


if __name__ == "__main__":
    unittest.main()
