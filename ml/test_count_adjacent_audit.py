import json
import tempfile
import unittest
from pathlib import Path

from audit_count_adjacent_metadata import audit


class CountAdjacentAuditTests(unittest.TestCase):
    def test_audit_preserves_numeric_counts_without_creating_ice_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.jsonl"
            path.write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "experiment_id": "a",
                                "audio_file_name": "a.wav",
                                "n_objects": 0,
                                "object": "empty",
                                "box_material": "cardboard",
                                "speakers": "mic-a",
                            }
                        ),
                        json.dumps(
                            {
                                "experiment_id": "b",
                                "audio_file_name": "b.wav",
                                "n_objects": 2,
                                "object": "cube",
                                "box_material": "cardboard",
                                "speakers": "mic-b",
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            report = audit(
                path,
                dataset_name="fixture",
                source_url="https://example.invalid/dataset",
                license_name="CC BY",
            )
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["rows"], 2)
        self.assertEqual(report["labelDistribution"], {"0": 1, "2": 1})
        self.assertEqual(report["numericLabelValues"], [0, 2])
        self.assertFalse(report["productionLabelEligible"])
        self.assertFalse(report["labelsUsedForProductionTraining"])
        self.assertEqual(report["duplicateIds"], {})

    def test_audit_reports_malformed_rows_and_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "metadata.jsonl"
            path.write_text(
                '{"experiment_id":"same","audio_file_name":"same.wav","n_objects":1}\n'
                '{"experiment_id":"same","audio_file_name":"same.wav","n_objects":2}\n'
                "not-json\n",
                encoding="utf-8",
            )
            report = audit(
                path,
                dataset_name="fixture",
                source_url="https://example.invalid/dataset",
                license_name="CC BY",
            )
        self.assertEqual(report["status"], "insufficient_data")
        self.assertEqual(report["rows"], 2)
        self.assertEqual(report["duplicateIds"], {"same": 2})
        self.assertEqual(report["duplicateAudioReferences"], {"same.wav": 2})
        self.assertEqual(len(report["invalidRows"]), 1)


if __name__ == "__main__":
    unittest.main()
