import json
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from audio_features import (
    TRANSIENT_FEATURE_NAMES,
    extract_features,
    extract_feature_set,
    extract_transient_features,
    read_pcm16_wav,
    resample,
    segment_audio,
)
from train_baseline import metrics


class AudioFeatureTests(unittest.TestCase):
    def test_reads_stereo_pcm16_as_mono(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.wav"
            stereo = np.asarray([[32767, -32768], [16384, 16384]], dtype="<i2")
            with wave.open(str(path), "wb") as output:
                output.setnchannels(2)
                output.setsampwidth(2)
                output.setframerate(48_000)
                output.writeframes(stereo.tobytes())
            samples, sample_rate = read_pcm16_wav(path)
        self.assertEqual(sample_rate, 48_000)
        self.assertEqual(samples.shape, (2,))
        self.assertAlmostEqual(float(samples[1]), 0.5, places=4)

    def test_rejects_pcm16_wav_without_samples(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.wav"
            with wave.open(str(path), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(48_000)
            with self.assertRaisesRegex(ValueError, "no PCM samples"):
                read_pcm16_wav(path)

    def test_resampling_has_expected_length(self):
        source = np.sin(2 * np.pi * 440 * np.arange(48_000) / 48_000).astype(np.float32)
        output = resample(source, 48_000, 16_000)
        self.assertEqual(len(output), 16_000)

    def test_segmentation_includes_recording_tail(self):
        segments = segment_audio(np.zeros(40_000, dtype=np.float32))
        self.assertEqual(len(segments), 4)
        self.assertTrue(all(len(segment) == 16_000 for segment in segments))

    def test_features_are_finite_and_gain_robust(self):
        time = np.arange(16_000) / 16_000
        quiet = (0.01 * np.sin(2 * np.pi * 880 * time)).astype(np.float32)
        loud = quiet * 8
        quiet_features = extract_features(quiet)
        loud_features = extract_features(loud)
        self.assertEqual(quiet_features.shape, (128,))
        self.assertTrue(np.isfinite(quiet_features).all())
        np.testing.assert_allclose(quiet_features, loud_features, atol=1e-4)

    def test_transient_schema_is_finite_and_gain_robust(self):
        time = np.arange(16_000) / 16_000
        quiet = (0.01 * np.sin(2 * np.pi * 880 * time)).astype(np.float32)
        loud = quiet * 8
        quiet_features = extract_transient_features(quiet)
        loud_features = extract_transient_features(loud)
        self.assertEqual(quiet_features.shape, (len(TRANSIENT_FEATURE_NAMES),))
        self.assertTrue(np.isfinite(quiet_features).all())
        np.testing.assert_allclose(quiet_features, loud_features, atol=1e-4)

    def test_ablation_feature_sizes_are_explicit(self):
        samples = np.zeros(16_000, dtype=np.float32)
        self.assertEqual(extract_feature_set(samples, "log_mel").shape, (128,))
        self.assertEqual(
            extract_feature_set(samples, "transient").shape,
            (len(TRANSIENT_FEATURE_NAMES),),
        )
        self.assertEqual(
            extract_feature_set(samples, "combined").shape,
            (128 + len(TRANSIENT_FEATURE_NAMES),),
        )

    def test_golden_fixture_matches_python_reference(self):
        fixture_path = Path(__file__).parent / "fixtures" / "audio_features_golden.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        samples = np.zeros(fixture["length"], dtype=np.float32)
        for offset, value in fixture["pcm16Impulses"].items():
            samples[int(offset)] = int(value) / 32768.0
        np.testing.assert_allclose(
            extract_features(samples), fixture["logMel"], rtol=0, atol=1e-6
        )
        np.testing.assert_allclose(
            extract_transient_features(samples), fixture["transient"], rtol=0, atol=1e-6
        )

    def test_metrics_reject_empty_or_misaligned_evaluation(self):
        with self.assertRaisesRegex(ValueError, "no recordings"):
            metrics([], [], [0, 1])
        with self.assertRaisesRegex(ValueError, "different lengths"):
            metrics([0], [], [0, 1])

    def test_metrics_expose_class_recall_and_precision(self):
        result = metrics([0, 1, 1], [0, 0, 1], [0, 1])
        self.assertEqual(result["recall"], {"0": 1.0, "1": 0.5})
        self.assertEqual(result["precision"], {"0": 0.5, "1": 1.0})


if __name__ == "__main__":
    unittest.main()
