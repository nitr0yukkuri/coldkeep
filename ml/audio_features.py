"""Dependency-light audio features used by the ColdKeep baselines."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


TARGET_SAMPLE_RATE = 16_000
FRAME_SIZE = 400
FRAME_HOP = 160
FFT_SIZE = 512
TRANSIENT_FEATURE_NAMES = (
    "onset_count",
    "transients_per_second",
    "inter_onset_interval_mean_s",
    "inter_onset_interval_std_s",
    "spectral_flux_mean",
    "spectral_flux_max",
    "spectral_flux_peak_count",
    "spectral_centroid_mean_hz",
    "spectral_centroid_std_hz",
    "high_frequency_energy_ratio",
    "spectral_rolloff_mean_hz",
    "zero_crossing_rate_mean",
    "zero_crossing_rate_std",
    "crest_factor_mean",
    "crest_factor_std",
    "rms_mean",
    "rms_std",
    "rms_max",
    "peak_to_rms",
    "transient_decay_mean_s",
    "transient_decay_std_s",
)


def read_pcm16_wav(path: Path) -> tuple[np.ndarray, int]:
    """Read an integer PCM16 WAV and return mono float32 samples."""
    with wave.open(str(path), "rb") as wav:
        if wav.getsampwidth() != 2:
            raise ValueError(f"{path} is not a 16-bit PCM WAV")
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        if sample_rate <= 0 or channels <= 0:
            raise ValueError(f"{path} has invalid sample rate or channel count")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")

    if samples.size % channels:
        raise ValueError(f"{path} contains an incomplete sample frame")
    if samples.size == 0:
        raise ValueError(f"{path} contains no PCM samples")
    samples = samples.reshape(-1, channels).astype(np.float32).mean(axis=1)
    return samples / 32768.0, sample_rate


def resample(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    """Band-limit and linearly resample a mono waveform."""
    if source_rate == target_rate:
        return samples.astype(np.float32, copy=False)
    if source_rate <= 0 or target_rate <= 0:
        raise ValueError("sample rates must be positive")

    filtered = samples.astype(np.float64)
    if target_rate < source_rate:
        taps = 127
        cutoff = 0.94 * target_rate / source_rate
        positions = np.arange(taps) - (taps - 1) / 2
        kernel = cutoff * np.sinc(cutoff * positions) * np.hamming(taps)
        kernel /= kernel.sum()
        filtered = np.convolve(filtered, kernel, mode="same")

    output_length = max(1, round(len(filtered) * target_rate / source_rate))
    old_positions = np.arange(len(filtered), dtype=np.float64)
    new_positions = np.arange(output_length, dtype=np.float64) * source_rate / target_rate
    return np.interp(new_positions, old_positions, filtered).astype(np.float32)


def segment_audio(
    samples: np.ndarray,
    sample_rate: int = TARGET_SAMPLE_RATE,
    seconds: float = 1.0,
    hop_seconds: float = 0.5,
) -> list[np.ndarray]:
    """Create fixed windows; a short recording is zero-padded once."""
    window = round(seconds * sample_rate)
    hop = round(hop_seconds * sample_rate)
    if window <= 0 or hop <= 0:
        raise ValueError("window and hop must be positive")
    if len(samples) <= window:
        return [np.pad(samples, (0, window - len(samples))).astype(np.float32)]
    starts = list(range(0, len(samples) - window + 1, hop))
    if starts[-1] != len(samples) - window:
        starts.append(len(samples) - window)
    return [samples[start : start + window] for start in starts]


def _hz_to_mel(frequency: np.ndarray | float) -> np.ndarray:
    return 2595.0 * np.log10(1.0 + np.asarray(frequency) / 700.0)


def _mel_to_hz(mel: np.ndarray | float) -> np.ndarray:
    return 700.0 * (10.0 ** (np.asarray(mel) / 2595.0) - 1.0)


def mel_filterbank(
    sample_rate: int,
    fft_size: int = 512,
    mel_bins: int = 32,
    minimum_hz: float = 60.0,
    maximum_hz: float = 7_600.0,
) -> np.ndarray:
    """Return triangular filters normalized to comparable area."""
    maximum_hz = min(maximum_hz, sample_rate / 2)
    mel_points = np.linspace(
        _hz_to_mel(minimum_hz), _hz_to_mel(maximum_hz), mel_bins + 2
    )
    frequencies = np.fft.rfftfreq(fft_size, 1.0 / sample_rate)
    edges = _mel_to_hz(mel_points)
    filters = np.zeros((mel_bins, len(frequencies)), dtype=np.float64)
    for index in range(mel_bins):
        left, center, right = edges[index : index + 3]
        filters[index] = np.maximum(
            0.0,
            np.minimum(
                (frequencies - left) / max(center - left, 1e-9),
                (right - frequencies) / max(right - center, 1e-9),
            ),
        )
        filters[index] /= max(filters[index].sum(), 1e-9)
    return filters.astype(np.float32)


def extract_features(
    samples: np.ndarray,
    sample_rate: int = TARGET_SAMPLE_RATE,
    filters: np.ndarray | None = None,
    gain_normalize: bool = True,
) -> np.ndarray:
    """Extract the version-1 log-mel statistics used by the baseline model."""
    if filters is None:
        filters = mel_filterbank(sample_rate)

    samples = _prepare_samples(samples, gain_normalize)

    frames = _analysis_frames(samples)
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(FRAME_SIZE), FFT_SIZE)) ** 2
    mel_energy = spectrum @ filters.T
    log_mel = np.log(np.maximum(mel_energy, 1e-10))

    delta = np.diff(log_mel, axis=0)
    if not len(delta):
        delta = np.zeros_like(log_mel)
    features = np.concatenate(
        [
            log_mel.mean(axis=0),
            log_mel.std(axis=0),
            delta.mean(axis=0),
            delta.std(axis=0),
        ]
    )
    return features.astype(np.float32)


def _prepare_samples(samples: np.ndarray, gain_normalize: bool) -> np.ndarray:
    prepared = samples.astype(np.float32, copy=True)
    if not len(prepared):
        prepared = np.zeros(FRAME_SIZE, dtype=np.float32)
    prepared -= prepared.mean()
    if gain_normalize:
        rms = float(np.sqrt(np.mean(prepared * prepared) + 1e-12))
        prepared *= 0.05 / max(rms, 1e-5)
    return np.clip(prepared, -1.0, 1.0)


def _analysis_frames(samples: np.ndarray) -> np.ndarray:
    if len(samples) < FRAME_SIZE:
        samples = np.pad(samples, (0, FRAME_SIZE - len(samples)))
    starts = range(0, len(samples) - FRAME_SIZE + 1, FRAME_HOP)
    return np.stack([samples[start : start + FRAME_SIZE] for start in starts])


def _frame_descriptors(
    samples: np.ndarray, sample_rate: int, gain_normalize: bool
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return RMS, spectral flux, centroid, rolloff and ZCR per frame.

    The descriptor definitions intentionally use only elementary operations so
    the same scalar feature vector can be reproduced in Rust and TypeScript.
    Spectral flux uses L1-normalized magnitude spectra; this removes overall
    gain from the event detector while retaining changes in spectral shape.
    """
    prepared = _prepare_samples(samples, gain_normalize)
    frames = _analysis_frames(prepared)
    windowed = frames * np.hanning(FRAME_SIZE)
    spectrum = np.abs(np.fft.rfft(windowed, FFT_SIZE))
    power = spectrum * spectrum
    frame_rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-12)
    magnitude_sum = np.maximum(spectrum.sum(axis=1, keepdims=True), 1e-12)
    normalized_magnitude = spectrum / magnitude_sum
    spectral_flux = np.zeros(len(frames), dtype=np.float64)
    if len(frames) > 1:
        spectral_flux[1:] = np.sqrt(
            np.sum(np.diff(normalized_magnitude, axis=0) ** 2, axis=1)
        )
    frequencies = np.fft.rfftfreq(FFT_SIZE, 1.0 / sample_rate)
    power_sum = np.maximum(power.sum(axis=1), 1e-12)
    centroid = (power @ frequencies) / power_sum
    rolloff = np.zeros(len(frames), dtype=np.float64)
    for index, row in enumerate(power):
        cumulative = np.cumsum(row)
        threshold = cumulative[-1] * 0.85
        rolloff[index] = frequencies[np.searchsorted(cumulative, threshold)]
    zcr = np.mean(frames[:, 1:] * frames[:, :-1] < 0, axis=1)
    return frame_rms, spectral_flux, centroid, rolloff, zcr


def _onset_indices(flux: np.ndarray) -> np.ndarray:
    if len(flux) < 3:
        return np.empty(0, dtype=np.int64)
    threshold = float(np.median(flux) + 1.5 * np.std(flux))
    candidates = [
        index
        for index in range(1, len(flux) - 1)
        if flux[index] > threshold
        and flux[index] >= flux[index - 1]
        and flux[index] > flux[index + 1]
    ]
    # Avoid counting the same impact over adjacent 10 ms frames.
    refractory_frames = max(1, round(0.05 * TARGET_SAMPLE_RATE / FRAME_HOP))
    selected: list[int] = []
    for index in candidates:
        if not selected or index - selected[-1] >= refractory_frames:
            selected.append(index)
        elif flux[index] > flux[selected[-1]]:
            selected[-1] = index
    return np.asarray(selected, dtype=np.int64)


def _spectral_flux_peak_count(flux: np.ndarray) -> int:
    # The refractory peak count deliberately uses the same candidate selector
    # as onset_count so that all runtimes make the same decision near a noise
    # threshold. It is still a flux-domain event count, not a cube count.
    return len(_onset_indices(flux))


def extract_transient_features(
    samples: np.ndarray,
    sample_rate: int = TARGET_SAMPLE_RATE,
    gain_normalize: bool = True,
) -> np.ndarray:
    """Extract interpretable impact/transient statistics.

    These features are hypotheses about collision density, not cube-count
    labels.  In particular, one cube can bounce several times and several
    cubes can collide in one transient, so the onset count is never treated as
    exact ground truth.
    """
    rms, flux, centroid, rolloff, zcr = _frame_descriptors(
        samples, sample_rate, gain_normalize
    )
    prepared = _prepare_samples(samples, gain_normalize)
    frames = _analysis_frames(prepared)
    frame_peaks = np.max(np.abs(frames), axis=1)
    crest = frame_peaks / np.maximum(rms, 1e-5)
    onset_indices = _onset_indices(flux)
    duration_s = max(len(prepared) / sample_rate, FRAME_SIZE / sample_rate)
    onset_times = onset_indices * FRAME_HOP / sample_rate
    intervals = np.diff(onset_times)
    high_frequency = np.fft.rfftfreq(FFT_SIZE, 1.0 / sample_rate) >= 2_000
    windowed = frames * np.hanning(FRAME_SIZE)
    power = np.abs(np.fft.rfft(windowed, FFT_SIZE)) ** 2
    hf_ratio = power[:, high_frequency].sum(axis=1) / np.maximum(
        power.sum(axis=1), 1e-12
    )

    decay: list[float] = []
    for onset in onset_indices:
        level = rms[onset]
        limit = min(len(rms), onset + round(0.5 * sample_rate / FRAME_HOP))
        end = onset
        while end < limit and rms[end] >= level * 0.5:
            end += 1
        decay.append((end - onset) * FRAME_HOP / sample_rate)

    values = np.asarray(
        [
            float(len(onset_indices)),
            float(len(onset_indices) / duration_s),
            float(intervals.mean()) if len(intervals) else 0.0,
            float(intervals.std()) if len(intervals) else 0.0,
            float(flux.mean()),
            float(flux.max(initial=0.0)),
            float(_spectral_flux_peak_count(flux)),
            float(centroid.mean()),
            float(centroid.std()),
            float(hf_ratio.mean()),
            float(rolloff.mean()),
            float(zcr.mean()),
            float(zcr.std()),
            float(crest.mean()),
            float(crest.std()),
            float(rms.mean()),
            float(rms.std()),
            float(rms.max(initial=0.0)),
            float(np.max(np.abs(prepared)) / max(float(rms.mean()), 1e-5)),
            float(np.mean(decay)) if decay else 0.0,
            float(np.std(decay)) if decay else 0.0,
        ],
        dtype=np.float32,
    )
    if values.shape != (len(TRANSIENT_FEATURE_NAMES),):
        raise AssertionError("transient feature schema and vector differ")
    return values


def extract_feature_set(
    samples: np.ndarray,
    mode: str,
    sample_rate: int = TARGET_SAMPLE_RATE,
    filters: np.ndarray | None = None,
    gain_normalize: bool = True,
) -> np.ndarray:
    """Select one of the ablation feature sets A/B/C."""
    if mode == "log_mel":
        return extract_features(samples, sample_rate, filters, gain_normalize)
    transient = extract_transient_features(samples, sample_rate, gain_normalize)
    if mode == "transient":
        return transient
    if mode == "combined":
        baseline = extract_features(samples, sample_rate, filters, gain_normalize)
        return np.concatenate([baseline, transient]).astype(np.float32)
    raise ValueError(f"unknown feature mode: {mode}")
