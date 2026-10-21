//! Speech-To-Text (STT) and Voice Activity Detection (VAD) module
//!
//! Handles streaming audio packets over WebSockets to Deepgram Nova-2 with local silence gating.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEvent {
    pub text: String,
    pub is_final: bool,
    pub confidence: f64,
    pub speaker: Option<u32>,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VadStatus {
    pub is_speaking: bool,
    pub energy_level: f32,
}
