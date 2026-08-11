"""Dependency-light audio features used by the ColdKeep baselines."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np


TARGET_SAMPLE_RATE = 16_000


def read_pcm16_wav(path: Path) -> tuple[np.ndarray, int]:
    """Read an integer PCM16 WAV and return mono float32 samples."""
    with wave.open(str(path), "rb") as wav:
        if wav.getsampwidth() != 2:
            raise ValueError(f"{path} is not a 16-bit PCM WAV")
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2")

    if samples.size % channels:
        raise ValueError(f"{path} contains an incomplete sample frame")
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
) -> np.ndarray:
    """Extract gain-robust log-mel statistics from one fixed-length window."""
    if filters is None:
        filters = mel_filterbank(sample_rate)

    samples = samples.astype(np.float32)
    samples = samples - samples.mean()
    rms = float(np.sqrt(np.mean(samples * samples) + 1e-12))
    samples = np.clip(samples * (0.05 / max(rms, 1e-5)), -1.0, 1.0)

    frame_size = 400
    frame_hop = 160
    fft_size = 512
    if len(samples) < frame_size:
        samples = np.pad(samples, (0, frame_size - len(samples)))
    starts = range(0, len(samples) - frame_size + 1, frame_hop)
    frames = np.stack([samples[start : start + frame_size] for start in starts])
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(frame_size), fft_size)) ** 2
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
