//! Native Audio Capture & Processing Pipeline
//!
//! Captures system output loopback or microphone input via CPAL on a dedicated thread,
//! normalizes audio to 16,000 Hz 16-bit Mono Linear PCM,
//! and provides real-time RMS Voice Activity Detection (VAD).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_input: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevelMetric {
    pub rms: f32,
    pub peak: f32,
    pub is_speaking: bool,
}

pub struct AudioCaptureService {
    shutdown_tx: std_mpsc::Sender<()>,
    is_running: Arc<AtomicBool>,
}

impl AudioCaptureService {
    /// Enumerate all audio input and output devices available on the host OS.
    pub fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
        let host = cpal::default_host();
        let mut devices = Vec::new();

        let default_in = host.default_input_device().and_then(|d| d.name().ok());
        let default_out = host.default_output_device().and_then(|d| d.name().ok());

        // Enumerate input devices (Microphones / Aggregate devices)
        if let Ok(input_devices) = host.input_devices() {
            for device in input_devices {
                if let Ok(name) = device.name() {
                    let is_def = default_in.as_ref().map(|d| d == &name).unwrap_or(false);
                    devices.push(AudioDeviceInfo {
                        id: format!("input:{}", name),
                        name: format!("{} (Microphone)", name),
                        is_default: is_def,
                        is_input: true,
                    });
                }
            }
        }

        // Enumerate output devices (System sound)
        if let Ok(output_devices) = host.output_devices() {
            for device in output_devices {
                if let Ok(name) = device.name() {
                    let is_def = default_out.as_ref().map(|d| d == &name).unwrap_or(false);
                    devices.push(AudioDeviceInfo {
                        id: format!("output:{}", name),
                        name: format!("{} (System Output)", name),
                        is_default: is_def,
                        is_input: false,
                    });
                }
            }
        }

        Ok(devices)
    }

    /// Start capturing audio on a dedicated OS thread to prevent blocking async tasks.
    pub fn start(
        device_id: Option<String>,
        pcm_sender: mpsc::Sender<Vec<u8>>,
        vad_sender: mpsc::Sender<AudioLevelMetric>,
    ) -> Result<Self, String> {
        let (shutdown_tx, shutdown_rx) = std_mpsc::channel::<()>();
        let (init_tx, init_rx) = std_mpsc::channel::<Result<(), String>>();

        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = Arc::clone(&is_running);

        std::thread::Builder::new()
            .name("sidekick-audio-capture".into())
            .spawn(move || {
                let host = cpal::default_host();

                let device_res = match device_id {
                    Some(ref id) if id.starts_with("output:") => {
                        let target_name = id.trim_start_matches("output:");
                        host.output_devices()
                            .map_err(|e| e.to_string())
                            .and_then(|mut devs| {
                                devs.find(|d| d.name().map(|n| n == target_name).unwrap_or(false))
                                    .or_else(|| host.default_output_device())
                                    .ok_or_else(|| "Target output device not found".to_string())
                            })
                    }
                    Some(ref id) if id.starts_with("input:") => {
                        let target_name = id.trim_start_matches("input:");
                        host.input_devices()
                            .map_err(|e| e.to_string())
                            .and_then(|mut devs| {
                                devs.find(|d| d.name().map(|n| n == target_name).unwrap_or(false))
                                    .or_else(|| host.default_input_device())
                                    .ok_or_else(|| "Target input device not found".to_string())
                            })
                    }
                    _ => host
                        .default_input_device()
                        .ok_or_else(|| "No default audio input device found".to_string()),
                };

                let device = match device_res {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = init_tx.send(Err(e));
                        return;
                    }
                };

                let default_config = match device.default_input_config() {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = init_tx.send(Err(format!("Failed to get default config: {e}")));
                        return;
                    }
                };

                let sample_rate = default_config.sample_rate().0;
                let channels = default_config.channels() as usize;
                let sample_format = default_config.sample_format();
                let config: StreamConfig = default_config.into();

                let stream_res = match sample_format {
                    SampleFormat::F32 => Self::build_stream_f32(
                        &device,
                        &config,
                        channels,
                        sample_rate,
                        pcm_sender,
                        vad_sender,
                        Arc::clone(&is_running_clone),
                    ),
                    SampleFormat::I16 => Self::build_stream_i16(
                        &device,
                        &config,
                        channels,
                        sample_rate,
                        pcm_sender,
                        vad_sender,
                        Arc::clone(&is_running_clone),
                    ),
                    _ => Err(format!("Unsupported audio sample format: {sample_format:?}")),
                };

                let stream = match stream_res {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = init_tx.send(Err(e));
                        return;
                    }
                };

                if let Err(e) = stream.play() {
                    let _ = init_tx.send(Err(format!("Failed to play audio stream: {e}")));
                    return;
                }

                // Notify caller that stream started successfully
                let _ = init_tx.send(Ok(()));

                // Keep thread alive until shutdown signal received
                let _ = shutdown_rx.recv();
                drop(stream);
            })
            .map_err(|e| format!("Failed to spawn audio capture thread: {e}"))?;

        // Wait for initialization result from capture thread
        init_rx
            .recv()
            .map_err(|e| format!("Audio thread initialization failed: {e}"))??;

        Ok(AudioCaptureService {
            shutdown_tx,
            is_running,
        })
    }

    fn build_stream_f32(
        device: &Device,
        config: &StreamConfig,
        channels: usize,
        src_sample_rate: u32,
        pcm_sender: mpsc::Sender<Vec<u8>>,
        vad_sender: mpsc::Sender<AudioLevelMetric>,
        is_running: Arc<AtomicBool>,
    ) -> Result<cpal::Stream, String> {
        let err_fn = |err| eprintln!("Audio stream error: {err}");

        let stream = device
            .build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_running.load(Ordering::Relaxed) {
                        return;
                    }

                    // 1. Voice Activity Detection (RMS & Peak)
                    let mut sum_sq = 0.0f32;
                    let mut peak = 0.0f32;
                    for &sample in data {
                        let abs = sample.abs();
                        if abs > peak {
                            peak = abs;
                        }
                        sum_sq += sample * sample;
                    }
                    let rms = (sum_sq / data.len().max(1) as f32).sqrt();
                    let is_speaking = rms > 0.015;

                    let _ = vad_sender.try_send(AudioLevelMetric {
                        rms,
                        peak,
                        is_speaking,
                    });

                    // 2. Downmix multi-channel to mono
                    let mono_samples: Vec<f32> = if channels > 1 {
                        data.chunks_exact(channels)
                            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                            .collect()
                    } else {
                        data.to_vec()
                    };

                    // 3. Resample to 16,000 Hz for Deepgram
                    let resampled = resample_linear(&mono_samples, src_sample_rate, 16000);

                    // 4. Convert to 16-bit signed PCM (Little Endian bytes)
                    let mut pcm_bytes = Vec::with_capacity(resampled.len() * 2);
                    for sample in resampled {
                        let clamped = sample.clamp(-1.0, 1.0);
                        let i16_val = (clamped * 32767.0) as i16;
                        pcm_bytes.extend_from_slice(&i16_val.to_le_bytes());
                    }

                    let _ = pcm_sender.try_send(pcm_bytes);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build F32 audio stream: {e}"))?;

        Ok(stream)
    }

    fn build_stream_i16(
        device: &Device,
        config: &StreamConfig,
        channels: usize,
        src_sample_rate: u32,
        pcm_sender: mpsc::Sender<Vec<u8>>,
        vad_sender: mpsc::Sender<AudioLevelMetric>,
        is_running: Arc<AtomicBool>,
    ) -> Result<cpal::Stream, String> {
        let err_fn = |err| eprintln!("Audio stream error: {err}");

        let stream = device
            .build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if !is_running.load(Ordering::Relaxed) {
                        return;
                    }

                    let f32_samples: Vec<f32> = data
                        .iter()
                        .map(|&s| s as f32 / 32768.0)
                        .collect();

                    let mut sum_sq = 0.0f32;
                    let mut peak = 0.0f32;
                    for &sample in &f32_samples {
                        let abs = sample.abs();
                        if abs > peak {
                            peak = abs;
                        }
                        sum_sq += sample * sample;
                    }
                    let rms = (sum_sq / f32_samples.len().max(1) as f32).sqrt();
                    let is_speaking = rms > 0.015;

                    let _ = vad_sender.try_send(AudioLevelMetric {
                        rms,
                        peak,
                        is_speaking,
                    });

                    let mono_samples: Vec<f32> = if channels > 1 {
                        f32_samples
                            .chunks_exact(channels)
                            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                            .collect()
                    } else {
                        f32_samples
                    };

                    let resampled = resample_linear(&mono_samples, src_sample_rate, 16000);

                    let mut pcm_bytes = Vec::with_capacity(resampled.len() * 2);
                    for sample in resampled {
                        let clamped = sample.clamp(-1.0, 1.0);
                        let i16_val = (clamped * 32767.0) as i16;
                        pcm_bytes.extend_from_slice(&i16_val.to_le_bytes());
                    }

                    let _ = pcm_sender.try_send(pcm_bytes);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build I16 audio stream: {e}"))?;

        Ok(stream)
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
        let _ = self.shutdown_tx.send(());
    }
}

/// Linear interpolation resampler from `src_rate` to `dst_rate`.
fn resample_linear(input: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src_rate == dst_rate || input.is_empty() {
        return input.to_vec();
    }

    let ratio = src_rate as f64 / dst_rate as f64;
    let dst_len = (input.len() as f64 / ratio).floor() as usize;
    let mut output = Vec::with_capacity(dst_len);

    for i in 0..dst_len {
        let src_idx = i as f64 * ratio;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(input.len() - 1);
        let frac = (src_idx - idx0 as f64) as f32;

        let s0 = input[idx0];
        let s1 = input[idx1];
        let interpolated = s0 + frac * (s1 - s0);
        output.push(interpolated);
    }

    output
}
