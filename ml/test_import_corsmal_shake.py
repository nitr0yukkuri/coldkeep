import csv
import tempfile
import unittest
from pathlib import Path

from import_corsmal_shake import import_manifest, read_ids


class CorsmalShakeImporterTests(unittest.TestCase):
    def test_import_requires_explicit_ids_and_preserves_level_ratio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            (data / "audio").mkdir(parents=True)
            (data / "audio" / "000001.wav").write_bytes(b"wav")
            annotations = root / "annotations.csv"
            annotations.write_text(
                "id,container id,container capacity,filling level\n"
                "1,7,500,2\n",
                encoding="utf-8",
            )
            shake_ids = root / "shake_ids.txt"
            shake_ids.write_text("# explicit action mapping\n1\n", encoding="utf-8")
            output = root / "manifest.csv"

            report = import_manifest(data, annotations, shake_ids, output)

            self.assertEqual(report, {"requested": 1, "written": 1, "skipped": 0})
            with output.open(encoding="utf-8", newline="") as stream:
                row = next(csv.DictReader(stream))
            self.assertEqual(row["action"], "shake")
            self.assertEqual(row["water_ml"], "500")
            self.assertEqual(row["session_id"], "corsmal-train")
            self.assertEqual(row["label_source"], "external_unlabeled")
            self.assertEqual(row["ice_count"], "")
            self.assertEqual(row["ice_mass_g"], "")

    def test_missing_audio_is_reported_without_guessing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            data.mkdir()
            annotations = root / "annotations.csv"
            annotations.write_text(
                "id,container id,container capacity,filling level\n"
                "1,7,500,1\n",
                encoding="utf-8",
            )
            shake_ids = root / "shake_ids.txt"
            shake_ids.write_text("1\n", encoding="utf-8")

            report = import_manifest(
                data, annotations, shake_ids, root / "manifest.csv"
            )

            self.assertEqual(report["skipped"], 1)

    def test_duplicate_ids_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ids.txt"
            path.write_text("1\n1\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicates"):
                read_ids(path)


if __name__ == "__main__":
    unittest.main()
