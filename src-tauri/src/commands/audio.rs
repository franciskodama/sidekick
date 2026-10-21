use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioCaptureStatus {
    pub is_recording: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub device_name: Option<String>,
}

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    // Skeleton implementation: Will enumerate CoreAudio / ScreenCaptureKit on macOS and WASAPI on Windows in Phase 2
    Ok(vec![
        AudioDeviceInfo {
            id: "system-loopback".to_string(),
            name: "Default System Audio Loopback".to_string(),
            is_default: true,
        },
    ])
}

#[tauri::command]
pub async fn start_audio_capture(device_id: Option<String>) -> Result<AudioCaptureStatus, String> {
    // Skeleton implementation: Initiates native OS audio loopback streaming
    Ok(AudioCaptureStatus {
        is_recording: true,
        sample_rate: 16000,
        channels: 1,
        device_name: device_id.or_else(|| Some("System Audio Loopback".to_string())),
    })
}

#[tauri::command]
pub async fn stop_audio_capture() -> Result<AudioCaptureStatus, String> {
    Ok(AudioCaptureStatus {
        is_recording: false,
        sample_rate: 16000,
        channels: 1,
        device_name: None,
    })
}
