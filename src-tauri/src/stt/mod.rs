//! Deepgram Nova-2 Streaming Speech-To-Text Client
//!
//! Connects over WebSockets to Deepgram Nova-2 streaming API,
//! streams 16kHz Linear PCM audio in real-time,
//! parses transcripts, and identifies questions for RAG retrieval.

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::handshake::client::generate_key;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::protocol::Message;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptPayload {
    pub text: String,
    pub is_final: bool,
    pub confidence: f64,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionPayload {
    pub question: String,
    pub raw_transcript: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Deserialize)]
struct DeepgramAlternative {
    pub transcript: String,
    pub confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    pub alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, Deserialize)]
struct DeepgramResponse {
    pub is_final: Option<bool>,
    #[allow(dead_code)]
    pub speech_final: Option<bool>,
    pub channel: Option<DeepgramChannel>,
}

pub struct DeepgramStreamingClient {
    is_running: Arc<AtomicBool>,
}

impl DeepgramStreamingClient {
    /// Start streaming audio chunks to Deepgram Nova-2 over WebSockets.
    pub async fn start<R: Runtime>(
        app: AppHandle<R>,
        api_key: String,
        mut pcm_receiver: mpsc::Receiver<Vec<u8>>,
    ) -> Result<Self, String> {
        let ws_url = "wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&endpointing=300&vad_events=true&encoding=linear16&sample_rate=16000&channels=1";

        let request = Request::builder()
            .uri(ws_url)
            .header("Host", "api.deepgram.com")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", generate_key())
            .header("Authorization", format!("Token {}", api_key.trim()))
            .body(())
            .map_err(|e| format!("Invalid WebSocket request: {e}"))?;

        let (ws_stream, _) = connect_async(request)
            .await
            .map_err(|e| format!("Failed to connect to Deepgram WebSocket: {e}"))?;

        let (mut ws_write, mut ws_read) = ws_stream.split();
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_send = Arc::clone(&is_running);
        let is_running_recv = Arc::clone(&is_running);

        // 1. Audio sending task
        tokio::spawn(async move {
            while is_running_send.load(Ordering::Relaxed) {
                match pcm_receiver.recv().await {
                    Some(pcm_chunk) => {
                        if !pcm_chunk.is_empty() {
                            if let Err(e) = ws_write.send(Message::Binary(pcm_chunk.into())).await {
                                eprintln!("Error sending audio to Deepgram: {e}");
                                break;
                            }
                        }
                    }
                    None => break,
                }
            }
            // Send close frame
            let _ = ws_write.send(Message::Close(None)).await;
        });

        // 2. Transcript receiving task
        let app_handle = app.clone();
        tokio::spawn(async move {
            while is_running_recv.load(Ordering::Relaxed) {
                match ws_read.next().await {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(resp) = serde_json::from_str::<DeepgramResponse>(&text) {
                            if let Some(channel) = resp.channel {
                                if let Some(alt) = channel.alternatives.first() {
                                    let transcript = alt.transcript.trim();
                                    if !transcript.is_empty() {
                                        let is_final = resp.is_final.unwrap_or(false);
                                        let confidence = alt.confidence.unwrap_or(0.9);
                                        let now = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_millis() as u64;

                                        // Emit transcript event to HUD
                                        let _ = app_handle.emit(
                                            "sidekick://transcript",
                                            TranscriptPayload {
                                                text: transcript.to_string(),
                                                is_final,
                                                confidence,
                                                timestamp_ms: now,
                                            },
                                        );

                                        // Detect if this is an actionable meeting question
                                        if is_final && is_question_like(transcript) {
                                            let _ = app_handle.emit(
                                                "sidekick://question-detected",
                                                QuestionPayload {
                                                    question: transcript.to_string(),
                                                    raw_transcript: transcript.to_string(),
                                                    timestamp_ms: now,
                                                },
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => break,
                    Some(Err(e)) => {
                        eprintln!("Deepgram WebSocket read error: {e}");
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
        });

        Ok(DeepgramStreamingClient { is_running })
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
    }
}

/// Detects if a transcript string represents an interrogative question.
fn is_question_like(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.ends_with('?') {
        return true;
    }

    let lower = trimmed.to_lowercase();
    let interrogative_prefixes = [
        "what", "how", "why", "who", "when", "where", "which", "whose",
        "can you", "could you", "would you", "can we", "could we", "is there",
        "are there", "do you", "did you", "does this", "do we", "have you",
    ];

    interrogative_prefixes.iter().any(|prefix| lower.starts_with(prefix))
}
