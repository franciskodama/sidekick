use crate::audio::{AudioCaptureService, AudioDeviceInfo, AudioLevelMetric};
use crate::stt::DeepgramStreamingClient;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::mpsc;

#[derive(Default)]
pub struct AudioSessionState {
    pub capture: Mutex<Option<AudioCaptureService>>,
    pub stt: Mutex<Option<DeepgramStreamingClient>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCaptureStatus {
    pub is_recording: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub device_name: Option<String>,
    pub stt_connected: bool,
}

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    AudioCaptureService::list_devices()
}

#[tauri::command]
pub async fn start_audio_capture<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, AudioSessionState>,
    device_id: Option<String>,
    api_key: Option<String>,
) -> Result<AudioCaptureStatus, String> {
    // Stop any existing session
    stop_audio_capture_internal(&state);

    // Channels for PCM audio (16kHz linear16) and VAD metrics
    let (pcm_tx, pcm_rx) = mpsc::channel::<Vec<u8>>(128);
    let (vad_tx, mut vad_rx) = mpsc::channel::<AudioLevelMetric>(64);

    // 1. Start Audio Capture
    let capture_service = AudioCaptureService::start(device_id.clone(), pcm_tx, vad_tx)?;

    // 2. Spawn VAD forwarder to frontend HUD
    let app_for_vad = app_handle.clone();
    tokio::spawn(async move {
        while let Some(metric) = vad_rx.recv().await {
            let _ = app_for_vad.emit("sidekick://audio-level", metric);
        }
    });

    // 3. Connect to Deepgram Nova-2 STT if API key is supplied
    let effective_key = api_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| std::env::var("DEEPGRAM_API_KEY").ok());

    let mut stt_connected = false;
    if let Some(key) = effective_key {
        match DeepgramStreamingClient::start(app_handle.clone(), key, pcm_rx).await {
            Ok(stt_client) => {
                let mut stt_guard = state.stt.lock().unwrap();
                *stt_guard = Some(stt_client);
                stt_connected = true;
            }
            Err(e) => {
                eprintln!("Warning: Failed to connect to Deepgram STT: {e}");
            }
        }
    }

    let mut cap_guard = state.capture.lock().unwrap();
    *cap_guard = Some(capture_service);

    Ok(AudioCaptureStatus {
        is_recording: true,
        sample_rate: 16000,
        channels: 1,
        device_name: device_id,
        stt_connected,
    })
}

#[tauri::command]
pub async fn stop_audio_capture(
    state: State<'_, AudioSessionState>,
) -> Result<AudioCaptureStatus, String> {
    stop_audio_capture_internal(&state);

    Ok(AudioCaptureStatus {
        is_recording: false,
        sample_rate: 16000,
        channels: 1,
        device_name: None,
        stt_connected: false,
    })
}

fn stop_audio_capture_internal(state: &AudioSessionState) {
    if let Ok(mut cap_guard) = state.capture.lock() {
        if let Some(service) = cap_guard.take() {
            service.stop();
        }
    }
    if let Ok(mut stt_guard) = state.stt.lock() {
        if let Some(client) = stt_guard.take() {
            client.stop();
        }
    }
}
