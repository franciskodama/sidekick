//! Native Audio Loopback Module
//!
//! Captures system output audio (what remote meeting participants say) directly from the OS.
//! - macOS: ScreenCaptureKit audio stream or CoreAudio Aggregate loopback
//! - Windows: WASAPI loopback capture (IAudioCaptureClient)

pub trait AudioLoopbackStream: Send + Sync {
    fn start(&mut self) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
}

#[derive(Default)]
pub struct AudioPipelineConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub frame_size_ms: u32,
}
