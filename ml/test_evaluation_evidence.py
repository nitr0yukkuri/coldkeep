import unittest

from evaluation_evidence import evidence_metrics


class EvaluationEvidenceTests(unittest.TestCase):
    def test_selective_metrics_make_unknown_path_measurable(self):
        result = evidence_metrics(
            [0, 1, 2, 0],
            [0, 1, 1, 2],
            [
                [0.90, 0.05, 0.05],
                [0.10, 0.80, 0.10],
                [0.20, 0.70, 0.10],
                [0.40, 0.30, 0.30],
            ],
            [0, 1, 2],
            bootstrap_samples=20,
            seed=11,
        )

        selective = result["selective"]
        self.assertEqual(selective["0.65"]["accepted"], 3)
        self.assertEqual(selective["0.65"]["abstained"], 1)
        self.assertEqual(selective["0.65"]["coverage"], 0.75)
        self.assertEqual(result["bootstrap"]["samples"], 20)
        self.assertGreaterEqual(result["expectedCalibrationError"], 0.0)

    def test_invalid_probability_rows_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "sum to one"):
            evidence_metrics(
                [0],
                [0],
                [[0.5, 0.5, 0.5]],
                [0, 1, 2],
                bootstrap_samples=0,
            )


if __name__ == "__main__":
    unittest.main()