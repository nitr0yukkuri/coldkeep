//! Small, deterministic inference core for ColdKeep.
//!
//! The feature pipeline intentionally mirrors `publicAudioClassifier.ts` and
//! `ml/audio_features.py`: 16 kHz mono PCM16, 25 ms Hann windows, 10 ms hop,
//! 32 normalized log-mel bands and mean/std summaries of the bands and their
//! deltas.  Keeping this contract identical lets Android use Rust without
//! silently changing the model that was evaluated in Python.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MODEL_JSON: &str = include_str!("../../../ml/artifacts/public_audio_baseline.json");
const SHAKE_MODEL_JSON: &str = include_str!("../../../ml/artifacts/shake_fill_level_pilot.json");
const ICE_MODEL_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/ice_presence_model.json"));
const SHAKE_ICE_MODEL_JSON: &str =
    include_str!(concat!(env!("OUT_DIR"), "/shake_ice_amount_model.json"));
const FFT_SIZE: usize = 512;
const FRAME_SIZE: usize = 400;
const FRAME_HOP: usize = 160;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelArtifact {
    sample_rate: u32,
    window_samples: usize,
    hop_samples: usize,
    mel_bins: usize,
    feature_size: usize,
    models: BTreeMap<String, LinearModel>,
}

#[derive(Debug, Deserialize)]
struct LinearModel {
    classes: Vec<i32>,
    #[serde(rename = "featureMean")]
    feature_mean: Vec<f64>,
    #[serde(rename = "featureScale")]
    feature_scale: Vec<f64>,
    weights: Vec<Vec<f64>>,
    bias: Vec<f64>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Prediction {
    pub contains_water: bool,
    pub water_confidence: f64,
    pub fill_level: Option<u8>,
    pub fill_confidence: Option<f64>,
    /// `None` is deliberate until paired ice/no-ice recordings exist.
    pub ice_presence: Option<bool>,
    pub ice_confidence: Option<f64>,
    pub ice_status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ice_amount: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ice_amount_confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ice_amount_status: Option<&'static str>,
    pub engine: &'static str,
    pub model_version: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub measurement_action: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub measurement_status: Option<&'static str>,
}

#[derive(Debug, Deserialize)]
struct ShakeModelArtifact {
    status: String,
    classes: Vec<String>,
    model: Option<LinearModel>,
}

fn shake_artifact() -> Result<ShakeModelArtifact, String> {
    serde_json::from_str(SHAKE_MODEL_JSON).map_err(|error| format!("shake model artifact: {error}"))
}

fn shake_status(status: &str) -> &'static str {
    match status {
        "trained" => "trained",
        "experimental" => "experimental",
        _ => "untrained",
    }
}

#[derive(Debug, Deserialize)]
struct ShakeIceAmountArtifact {
    status: String,
    classes: Vec<String>,
    model: Option<LinearModel>,
}

fn shake_ice_artifact() -> Result<ShakeIceAmountArtifact, String> {
    serde_json::from_str(SHAKE_ICE_MODEL_JSON)
        .map_err(|error| format!("shake ice amount model artifact: {error}"))
}

fn shake_ice_status(status: &str) -> &'static str {
    match status {
        "trained" => "trained",
        "experimental" => "experimental",
        _ => "untrained",
    }
}

fn shake_ice_class(class: &str) -> Option<&'static str> {
    match class {
        "none" => Some("none"),
        "few" => Some("few"),
        "many" => Some("many"),
        _ => None,
    }
}

fn artifact() -> Result<ModelArtifact, String> {
    serde_json::from_str(MODEL_JSON).map_err(|error| format!("model artifact: {error}"))
}

fn optional_ice_model() -> Option<LinearModel> {
    #[derive(Deserialize)]
    struct IceArtifact {
        models: BTreeMap<String, LinearModel>,
    }
    serde_json::from_str::<IceArtifact>(ICE_MODEL_JSON)
        .ok()
        .and_then(|mut artifact| artifact.models.remove("ice_presence"))
        .or_else(|| serde_json::from_str::<LinearModel>(ICE_MODEL_JSON).ok())
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let end = offset.checked_add(2).ok_or("WAV offset overflow")?;
    let slice = bytes.get(offset..end).ok_or("truncated WAV u16")?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let end = offset.checked_add(4).ok_or("WAV offset overflow")?;
    let slice = bytes.get(offset..end).ok_or("truncated WAV u32")?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

/// Read PCM16 WAV without depending on a platform audio library.
fn parse_wav(bytes: &[u8]) -> Result<(Vec<f64>, u32), String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("expected RIFF/WAVE".to_string());
    }
    let mut cursor = 12usize;
    let mut sample_rate = None;
    let mut channels = None;
    let mut bits_per_sample = None;
    let mut audio_format = None;
    let mut data: Option<&[u8]> = None;

    while cursor.checked_add(8).is_some_and(|end| end <= bytes.len()) {
        let chunk_size = read_u32(bytes, cursor + 4)? as usize;
        let chunk_start = cursor + 8;
        let chunk_end = chunk_start
            .checked_add(chunk_size)
            .ok_or("WAV chunk overflow")?;
        if chunk_end > bytes.len() {
            return Err("truncated WAV chunk".to_string());
        }
        match &bytes[cursor..cursor + 4] {
            b"fmt " if chunk_size >= 16 => {
                audio_format = Some(read_u16(bytes, chunk_start)?);
                channels = Some(read_u16(bytes, chunk_start + 2)?);
                sample_rate = Some(read_u32(bytes, chunk_start + 4)?);
                bits_per_sample = Some(read_u16(bytes, chunk_start + 14)?);
            }
            b"data" => data = Some(&bytes[chunk_start..chunk_end]),
            _ => {}
        }
        // RIFF chunks are word aligned.
        cursor = chunk_end + (chunk_size & 1);
    }

    if audio_format != Some(1) {
        return Err("only PCM WAV is supported".to_string());
    }
    let channels = channels.ok_or("WAV fmt chunk is missing")? as usize;
    let rate = sample_rate.ok_or("WAV sample rate is missing")?;
    let bits = bits_per_sample.ok_or("WAV bit depth is missing")?;
    let data = data.ok_or("WAV data chunk is missing")?;
    if channels == 0 || bits != 16 || rate == 0 {
        return Err("only non-empty PCM16 WAV is supported".to_string());
    }

    let bytes_per_frame = channels * 2;
    let frame_count = data.len() / bytes_per_frame;
    if frame_count == 0 {
        return Err("PCM WAV contains no audio samples".to_string());
    }
    let mut mono = Vec::with_capacity(frame_count);
    for frame in 0..frame_count {
        let mut sum = 0.0;
        for channel in 0..channels {
            let offset = frame * bytes_per_frame + channel * 2;
            let value = i16::from_le_bytes([data[offset], data[offset + 1]]) as f64 / 32768.0;
            sum += value;
        }
        mono.push(sum / channels as f64);
    }
    Ok((mono, rate))
}

fn resample(samples: &[f64], source_rate: u32, target_rate: u32) -> Vec<f64> {
    if samples.is_empty() {
        return vec![0.0];
    }
    if source_rate == target_rate {
        return samples.to_vec();
    }
    let filtered = if target_rate < source_rate {
        low_pass_filter(samples, source_rate, target_rate)
    } else {
        samples.to_vec()
    };
    let length = ((filtered.len() as f64 * target_rate as f64) / source_rate as f64)
        .round()
        .max(1.0) as usize;
    (0..length)
        .map(|index| {
            let source = index as f64 * source_rate as f64 / target_rate as f64;
            let left = (source.floor() as usize).min(filtered.len() - 1);
            let right = (left + 1).min(filtered.len() - 1);
            let fraction = source - left as f64;
            filtered[left] * (1.0 - fraction) + filtered[right] * fraction
        })
        .collect()
}

fn low_pass_filter(samples: &[f64], source_rate: u32, target_rate: u32) -> Vec<f64> {
    let taps = 127usize;
    let cutoff = 0.94 * target_rate as f64 / source_rate as f64;
    let center = (taps - 1) as f64 / 2.0;
    let mut kernel = vec![0.0; taps];
    let mut sum = 0.0;
    for (tap, value) in kernel.iter_mut().enumerate() {
        let position = tap as f64 - center;
        let sinc = if position == 0.0 {
            1.0
        } else {
            (std::f64::consts::PI * cutoff * position).sin()
                / (std::f64::consts::PI * cutoff * position)
        };
        *value = cutoff
            * sinc
            * (0.54
                - 0.46
                    * (2.0 * std::f64::consts::PI * tap as f64 / (taps - 1) as f64).cos());
        sum += *value;
    }
    for value in &mut kernel {
        *value /= sum;
    }
    let mut output = vec![0.0; samples.len()];
    for (index, output_value) in output.iter_mut().enumerate() {
        let mut value = 0.0;
        for (tap, coefficient) in kernel.iter().enumerate() {
            let source_index = index as isize + tap as isize - center as isize;
            if source_index >= 0 && (source_index as usize) < samples.len() {
                value += samples[source_index as usize] * coefficient;
            }
        }
        *output_value = value;
    }
    output
}

fn fft_power(frame: &[f64]) -> Vec<f64> {
    let mut real = vec![0.0; FFT_SIZE];
    let mut imaginary = vec![0.0; FFT_SIZE];
    for index in 0..FRAME_SIZE {
        let sample = frame.get(index).copied().unwrap_or(0.0);
        let window =
            0.5 - 0.5 * (2.0 * std::f64::consts::PI * index as f64 / (FRAME_SIZE - 1) as f64).cos();
        real[index] = sample * window;
    }

    let mut reversed = 0usize;
    for index in 1..FFT_SIZE {
        let mut bit = FFT_SIZE >> 1;
        while reversed & bit != 0 {
            reversed ^= bit;
            bit >>= 1;
        }
        reversed ^= bit;
        if index < reversed {
            real.swap(index, reversed);
        }
    }
    let mut length = 2;
    while length <= FFT_SIZE {
        let angle = -2.0 * std::f64::consts::PI / length as f64;
        let step_real = angle.cos();
        let step_imaginary = angle.sin();
        for start in (0..FFT_SIZE).step_by(length) {
            let mut twiddle_real = 1.0;
            let mut twiddle_imaginary = 0.0;
            for offset in 0..length / 2 {
                let even = start + offset;
                let odd = even + length / 2;
                let odd_real = real[odd] * twiddle_real - imaginary[odd] * twiddle_imaginary;
                let odd_imaginary = real[odd] * twiddle_imaginary + imaginary[odd] * twiddle_real;
                real[odd] = real[even] - odd_real;
                imaginary[odd] = imaginary[even] - odd_imaginary;
                real[even] += odd_real;
                imaginary[even] += odd_imaginary;
                let next_real = twiddle_real * step_real - twiddle_imaginary * step_imaginary;
                twiddle_imaginary = twiddle_real * step_imaginary + twiddle_imaginary * step_real;
                twiddle_real = next_real;
            }
        }
        length <<= 1;
    }
    (0..=FFT_SIZE / 2)
        .map(|index| real[index] * real[index] + imaginary[index] * imaginary[index])
        .collect()
}

fn hz_to_mel(frequency: f64) -> f64 {
    2595.0 * (1.0 + frequency / 700.0).log10()
}

fn mel_to_hz(mel: f64) -> f64 {
    700.0 * (10.0_f64.powf(mel / 2595.0) - 1.0)
}

fn mel_filters(sample_rate: u32, mel_bins: usize) -> Vec<Vec<f64>> {
    let minimum_mel = hz_to_mel(60.0);
    let maximum_mel = hz_to_mel(7600.0);
    let edges: Vec<f64> = (0..mel_bins + 2)
        .map(|index| {
            mel_to_hz(
                minimum_mel + (maximum_mel - minimum_mel) * index as f64 / (mel_bins + 1) as f64,
            )
        })
        .collect();
    (0..mel_bins)
        .map(|bin| {
            let mut filter = vec![0.0; FFT_SIZE / 2 + 1];
            let mut sum = 0.0;
            for (index, value) in filter.iter_mut().enumerate() {
                let frequency = index as f64 * sample_rate as f64 / FFT_SIZE as f64;
                let rising = (frequency - edges[bin]) / (edges[bin + 1] - edges[bin]);
                let falling = (edges[bin + 2] - frequency) / (edges[bin + 2] - edges[bin + 1]);
                *value = rising.min(falling).clamp(0.0, 1.0);
                sum += *value;
            }
            for value in &mut filter {
                *value /= sum.max(1e-9);
            }
            filter
        })
        .collect()
}

fn summarize(rows: &[Vec<f64>], mel_bins: usize) -> Vec<f64> {
    let mut means = vec![0.0; mel_bins];
    let mut deviations = vec![0.0; mel_bins];
    if rows.is_empty() {
        return vec![0.0; mel_bins * 2];
    }
    for row in rows {
        for (bin, value) in row.iter().enumerate().take(mel_bins) {
            means[bin] += value / rows.len() as f64;
        }
    }
    for row in rows {
        for (bin, value) in row.iter().enumerate().take(mel_bins) {
            deviations[bin] += (value - means[bin]).powi(2) / rows.len() as f64;
        }
    }
    means.extend(deviations.into_iter().map(f64::sqrt));
    means
}

fn extract_features(input: &[f64], model: &ModelArtifact) -> Vec<f64> {
    let mut samples = input.to_vec();
    if samples.len() < FRAME_SIZE {
        samples.resize(FRAME_SIZE, 0.0);
    }
    let mean = samples.iter().sum::<f64>() / samples.len().max(1) as f64;
    let squared = samples
        .iter_mut()
        .map(|sample| {
            *sample -= mean;
            *sample * *sample
        })
        .sum::<f64>();
    let gain = 0.05
        / (squared / samples.len().max(1) as f64 + 1e-12)
            .sqrt()
            .max(1e-5);
    for sample in &mut samples {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }

    let filters = mel_filters(model.sample_rate, model.mel_bins);
    let mut log_mel = Vec::new();
    for start in (0..=samples.len().saturating_sub(FRAME_SIZE)).step_by(FRAME_HOP) {
        let power = fft_power(&samples[start..start + FRAME_SIZE]);
        let row = filters
            .iter()
            .map(|filter| {
                let energy = power.iter().zip(filter).map(|(p, f)| p * f).sum::<f64>();
                energy.max(1e-10).ln()
            })
            .collect::<Vec<_>>();
        log_mel.push(row);
    }
    if log_mel.is_empty() {
        log_mel.push(vec![0.0; model.mel_bins]);
    }
    let delta = log_mel
        .windows(2)
        .map(|rows| rows[1].iter().zip(&rows[0]).map(|(a, b)| a - b).collect())
        .collect::<Vec<Vec<f64>>>();
    let mut features = summarize(&log_mel, model.mel_bins);
    features.extend(summarize(&delta, model.mel_bins));
    features.truncate(model.feature_size);
    features.resize(model.feature_size, 0.0);
    features
}

fn recording_windows(samples: &[f64], window: usize, hop: usize) -> Vec<Vec<f64>> {
    if samples.len() <= window {
        let mut padded = vec![0.0; window];
        padded[..samples.len()].copy_from_slice(samples);
        return vec![padded];
    }
    let mut starts = Vec::new();
    let mut start = 0;
    while start + window <= samples.len() {
        starts.push(start);
        start += hop;
    }
    let tail = samples.len() - window;
    if starts.last().copied() != Some(tail) {
        starts.push(tail);
    }
    starts
        .into_iter()
        .map(|offset| samples[offset..offset + window].to_vec())
        .collect()
}

fn predict(features: &[f64], model: &LinearModel) -> Vec<f64> {
    let mut logits = Vec::with_capacity(model.bias.len());
    for output in 0..model.bias.len() {
        let mut value = model.bias[output];
        for (feature, row) in model.weights.iter().enumerate() {
            let scale = model
                .feature_scale
                .get(feature)
                .copied()
                .unwrap_or(1.0)
                .max(1e-5);
            let mean = model.feature_mean.get(feature).copied().unwrap_or(0.0);
            value += ((features.get(feature).copied().unwrap_or(0.0) - mean) / scale)
                * row.get(output).copied().unwrap_or(0.0);
        }
        logits.push(value);
    }
    let maximum = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let exponentials: Vec<f64> = logits.iter().map(|value| (value - maximum).exp()).collect();
    let total = exponentials.iter().sum::<f64>().max(1e-12);
    exponentials
        .into_iter()
        .map(|value| value / total)
        .collect()
}

fn averaged_prediction(features: &[Vec<f64>], model: &LinearModel) -> Vec<f64> {
    let mut average = vec![0.0; model.classes.len()];
    for window in features {
        for (index, value) in predict(window, model).into_iter().enumerate() {
            average[index] += value / features.len().max(1) as f64;
        }
    }
    average
}

fn binary_prediction_from_present_probability(present_probability: f64) -> (bool, f64) {
    let presence = present_probability >= 0.5;
    let confidence = if presence {
        present_probability
    } else {
        1.0 - present_probability
    };
    (presence, confidence)
}

pub fn classify_wav_bytes(bytes: &[u8]) -> Result<Prediction, String> {
    let model = artifact()?;
    let (samples, source_rate) = parse_wav(bytes)?;
    let samples = resample(&samples, source_rate, model.sample_rate);
    let windows = recording_windows(&samples, model.window_samples, model.hop_samples);
    let features = windows
        .iter()
        .map(|window| extract_features(window, &model))
        .collect::<Vec<_>>();
    let ice_prediction = optional_ice_model().and_then(|ice_model| {
        let probabilities = averaged_prediction(&features, &ice_model);
        let present_index = ice_model.classes.iter().position(|class| *class == 1)?;
        let present_probability = probabilities.get(present_index).copied()?;
        let (presence, confidence) =
            binary_prediction_from_present_probability(present_probability);
        Some((presence, confidence))
    });
    let water_model = model
        .models
        .get("water_presence")
        .ok_or("water_presence model is missing")?;
    let water_probabilities = averaged_prediction(&features, water_model);
    let water_index = water_model
        .classes
        .iter()
        .position(|class| *class == 1)
        .ok_or("water model has no positive class")?;
    let water_confidence = water_probabilities[water_index];
    let contains_water = water_confidence >= 0.5;
    if !contains_water {
        return Ok(Prediction {
            contains_water,
            water_confidence: 1.0 - water_confidence,
            fill_level: None,
            fill_confidence: None,
            ice_presence: ice_prediction.map(|value| value.0),
            ice_confidence: ice_prediction.map(|value| value.1),
            ice_status: if ice_prediction.is_some() {
                "trained"
            } else {
                "untrained"
            },
            ice_amount: None,
            ice_amount_confidence: None,
            ice_amount_status: None,
            engine: "rust",
            model_version: 1,
            measurement_action: Some("pour"),
            measurement_status: Some("trained"),
        });
    }
    let fill_model = model
        .models
        .get("fill_level_water")
        .ok_or("fill_level_water model is missing")?;
    let fill_probabilities = averaged_prediction(&features, fill_model);
    let best_index = fill_probabilities
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| left.total_cmp(right))
        .map(|(index, _)| index)
        .unwrap_or(0);
    let fill_class = fill_model.classes.get(best_index).copied().unwrap_or(0);
    Ok(Prediction {
        contains_water,
        water_confidence,
        fill_level: Some(if fill_class == 1 { 50 } else { 90 }),
        fill_confidence: fill_probabilities.get(best_index).copied(),
        ice_presence: ice_prediction.map(|value| value.0),
        ice_confidence: ice_prediction.map(|value| value.1),
        ice_status: if ice_prediction.is_some() {
            "trained"
        } else {
            "untrained"
        },
        ice_amount: None,
        ice_amount_confidence: None,
        ice_amount_status: None,
        engine: "rust",
        model_version: 1,
        measurement_action: Some("pour"),
        measurement_status: Some("trained"),
    })
}

pub fn classify_wav_path(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("read WAV: {error}"))?;
    serde_json::to_string(&classify_wav_bytes(&bytes).map_err(|error| error.to_string())?)
        .map_err(|error| format!("serialize prediction: {error}"))
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_anonymous_coldkeep_RustAudioClassifierModule_nativeClassifyWav(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    path: jni::objects::JString,
) -> jni::sys::jstring {
    let path = env
        .get_string(&path)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let result = classify_wav_path(&path)
        .unwrap_or_else(|error| serde_json::json!({"error": error}).to_string());
    env.new_string(result)
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(samples: &[i16], rate: u32) -> Vec<u8> {
        let data_len = samples.len() * 2;
        let mut output = Vec::with_capacity(44 + data_len);
        output.extend_from_slice(b"RIFF");
        output.extend_from_slice(&((36 + data_len) as u32).to_le_bytes());
        output.extend_from_slice(b"WAVEfmt ");
        output.extend_from_slice(&16u32.to_le_bytes());
        output.extend_from_slice(&1u16.to_le_bytes());
        output.extend_from_slice(&1u16.to_le_bytes());
        output.extend_from_slice(&rate.to_le_bytes());
        output.extend_from_slice(&(rate * 2).to_le_bytes());
        output.extend_from_slice(&2u16.to_le_bytes());
        output.extend_from_slice(&16u16.to_le_bytes());
        output.extend_from_slice(b"data");
        output.extend_from_slice(&(data_len as u32).to_le_bytes());
        for sample in samples {
            output.extend_from_slice(&sample.to_le_bytes());
        }
        output
    }

    #[test]
    fn parses_pcm16_wav_and_returns_finite_prediction() {
        let samples = (0..16_000)
            .map(|index| {
                ((index as f64 * 2.0 * std::f64::consts::PI * 700.0 / 16_000.0).sin() * 2_000.0)
                    as i16
            })
            .collect::<Vec<_>>();
        let result = classify_wav_bytes(&wav(&samples, 16_000)).expect("prediction");
        assert!(result.water_confidence.is_finite());
        assert!(result.water_confidence >= 0.0 && result.water_confidence <= 1.0);
        assert_eq!(result.ice_status, "untrained");
    }

    #[test]
    fn rejects_non_wav_input() {
        assert!(parse_wav(b"not wav").is_err());
    }

    #[test]
    fn rejects_empty_pcm_wav() {
        assert!(parse_wav(&wav(&[], 16_000)).is_err());
    }

    #[test]
    fn binary_confidence_is_for_the_predicted_class() {
        assert_eq!(binary_prediction_from_present_probability(0.9), (true, 0.9));
        assert_eq!(
            binary_prediction_from_present_probability(0.2),
            (false, 0.8)
        );
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_anonymous_coldkeep_RustAudioClassifierModule_nativeClassifyShakeWav(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    path: jni::objects::JString,
) -> jni::sys::jstring {
    let path = env
        .get_string(&path)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let result = classify_shake_wav_path(&path)
        .unwrap_or_else(|error| serde_json::json!({"error": error}).to_string());
    env.new_string(result)
        .map(|value| value.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

/// Run the action-specific shake model. The checked-in artifact is deliberately
/// manifest-only, so this returns a safe untrained prediction until the
/// phone/water-bottle training gate has produced a real model.
pub fn classify_shake_wav_bytes(bytes: &[u8]) -> Result<Prediction, String> {
    let shake = shake_artifact()?;
    let status = shake_status(&shake.status);
    let shake_ice = shake_ice_artifact()?;
    let ice_status = shake_ice_status(&shake_ice.status);
    let Some(shake_model) = shake.model.as_ref() else {
        return parse_wav(bytes).map(|_| Prediction {
            contains_water: false,
            water_confidence: 0.0,
            fill_level: None,
            fill_confidence: None,
            ice_presence: None,
            ice_confidence: None,
            ice_status: "untrained",
            ice_amount: None,
            ice_amount_confidence: None,
            ice_amount_status: Some(ice_status),
            engine: "rust",
            model_version: 1,
            measurement_action: Some("shake"),
            measurement_status: Some(status),
        });
    };
    if shake.classes.len() != 3 {
        return Err("shake model must contain empty/half/full classes".to_string());
    }
    let baseline = artifact()?;
    let (samples, source_rate) = parse_wav(bytes)?;
    let samples = resample(&samples, source_rate, baseline.sample_rate);
    let windows = recording_windows(&samples, baseline.window_samples, baseline.hop_samples);
    let features = windows
        .iter()
        .map(|window| extract_features(window, &baseline))
        .collect::<Vec<_>>();
    let probabilities = averaged_prediction(&features, shake_model);
    let best_index = probabilities
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| left.total_cmp(right))
        .map(|(index, _)| index)
        .unwrap_or(0);
    let fill_class = shake_model.classes.get(best_index).copied().unwrap_or(0);
    let fill_level = match fill_class {
        0 => 0,
        1 => 50,
        2 => 100,
        _ => return Err("shake model class must be 0, 1, or 2".to_string()),
    };
    let confidence = probabilities.get(best_index).copied().unwrap_or(0.0);
    let (ice_amount, ice_amount_confidence) =
        if ice_status == "trained" && shake_ice.model.is_some() && shake_ice.classes.len() == 3 {
            let ice_model = shake_ice.model.as_ref().expect("checked above");
            let ice_probabilities = averaged_prediction(&features, ice_model);
            let ice_index = ice_probabilities
                .iter()
                .enumerate()
                .max_by(|(_, left), (_, right)| left.total_cmp(right))
                .map(|(index, _)| index)
                .unwrap_or(0);
            let ice_class = shake_ice
                .classes
                .get(ice_index)
                .and_then(|class| shake_ice_class(class))
                .ok_or("shake ice model class must be none, few, or many")?;
            (Some(ice_class), ice_probabilities.get(ice_index).copied())
        } else {
            (None, None)
        };
    Ok(Prediction {
        contains_water: true,
        water_confidence: confidence,
        fill_level: Some(fill_level),
        fill_confidence: Some(confidence),
        ice_presence: None,
        ice_confidence: None,
        ice_status: if ice_status == "trained" {
            "trained"
        } else {
            "untrained"
        },
        ice_amount,
        ice_amount_confidence,
        ice_amount_status: Some(ice_status),
        engine: "rust",
        model_version: 1,
        measurement_action: Some("shake"),
        measurement_status: Some(status),
    })
}

pub fn classify_shake_wav_path(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("read WAV: {error}"))?;
    serde_json::to_string(&classify_shake_wav_bytes(&bytes).map_err(|error| error.to_string())?)
        .map_err(|error| format!("serialize prediction: {error}"))
}
