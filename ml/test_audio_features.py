import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from audio_features import (
    extract_features,
    read_pcm16_wav,
    resample,
    segment_audio,
)


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


if __name__ == "__main__":
    unittest.main()

