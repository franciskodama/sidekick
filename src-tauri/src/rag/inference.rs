//! Ultra-Fast Streaming Inference Engine for Sidekick HUD
//!
//! Streams real-time bulleted talking points (<40 words) directly into the overlay.
//! Supports Google Gemini (Default: 2.5 / 1.5 Flash), Anthropic Claude, and OpenAI.

use super::store::DocumentChunk;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LlmProvider {
    Gemini,
    Claude,
    OpenAi,
}

impl Default for LlmProvider {
    fn default() -> Self {
        LlmProvider::Gemini
    }
}

impl From<&str> for LlmProvider {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "claude" | "anthropic" => LlmProvider::Claude,
            "openai" | "chatgpt" => LlmProvider::OpenAi,
            _ => LlmProvider::Gemini,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunkPayload {
    pub id: String,
    pub delta: String,
    pub full_text: String,
    pub question: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalkingPointPayload {
    pub id: String,
    pub topic: String,
    pub question: String,
    pub bullets: Vec<String>,
    pub word_count: usize,
    pub sources: Vec<String>,
    pub timestamp: u64,
}

pub struct InferenceService;

impl InferenceService {
    /// Generate and stream ultra-dense talking points using the selected LLM provider.
    pub async fn stream_talking_points<R: Runtime>(
        app: &AppHandle<R>,
        provider: LlmProvider,
        api_key: &str,
        question: &str,
        context_chunks: &[DocumentChunk],
    ) -> Result<TalkingPointPayload, String> {
        let point_id = format!("pt-{}", SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or_default().as_millis());
        let sources: Vec<String> = context_chunks
            .iter()
            .map(|c| c.source_path.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        // Assemble grounded context string
        let context_str = if context_chunks.is_empty() {
            "No specific document context found. Provide a concise, general answer.".to_string()
        } else {
            context_chunks
                .iter()
                .take(2)
                .enumerate()
                .map(|(idx, c)| {
                    let snippet = if c.content.len() > 900 {
                        &c.content[..900]
                    } else {
                        &c.content
                    };
                    format!("[Source {}: {}]\n{}", idx + 1, c.title, snippet)
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        };

        let system_prompt = "You are Sidekick, an ultra-dense HUD meeting assistant for a speaker looking directly into a webcam.\n\
        Answer the speaker's question using ONLY the provided knowledge context.\n\n\
        STRICT RULES:\n\
        1. Output format: EXACTLY 2 to 4 bullet points starting with '• '.\n\
        2. Total word count: STRICTLY UNDER 40 WORDS TOTAL across all bullets combined.\n\
        3. ZERO conversational filler (NEVER say 'Certainly', 'Here are the bullets', 'Based on the context', etc.).\n\
        4. Deliver ultra-dense facts, metrics, and actions only.";

        let user_prompt = format!("Context:\n{}\n\nQuestion:\n{}", context_str, question);

        let full_text = match provider {
            LlmProvider::Gemini => {
                Self::stream_gemini(app, api_key, system_prompt, &user_prompt, &point_id, question).await?
            }
            LlmProvider::Claude => {
                Self::stream_claude(app, api_key, system_prompt, &user_prompt, &point_id, question).await?
            }
            LlmProvider::OpenAi => {
                Self::stream_openai(app, api_key, system_prompt, &user_prompt, &point_id, question).await?
            }
        };

        // Parse bullets
        let bullets: Vec<String> = full_text
            .lines()
            .map(|l| l.trim().trim_start_matches(|c| c == '•' || c == '-' || c == '*').trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        let word_count = full_text.split_whitespace().count();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let result = TalkingPointPayload {
            id: point_id.clone(),
            topic: if context_chunks.is_empty() {
                "Meeting Context".to_string()
            } else {
                context_chunks[0].title.clone()
            },
            question: question.to_string(),
            bullets,
            word_count,
            sources,
            timestamp: now,
        };

        // Emit final talking point
        let _ = app.emit("sidekick://talking-point-done", &result);

        Ok(result)
    }

    /// Google Gemini 2.5 / 1.5 Flash Streaming via Server-Sent Events (SSE)
    async fn stream_gemini<R: Runtime>(
        app: &AppHandle<R>,
        api_key: &str,
        system_prompt: &str,
        user_prompt: &str,
        point_id: &str,
        question: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(4500))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        let models = ["gemini-3.6-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite"];
        let mut last_err = String::new();

        for model in models {
            let thinking_budget = if model == "gemini-3.6-flash" { 0 } else { 1 };
            let body = serde_json::json!({
                "contents": [
                    {
                        "role": "user",
                        "parts": [{ "text": user_prompt }]
                    }
                ],
                "systemInstruction": {
                    "parts": [{ "text": system_prompt }]
                },
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 600,
                    "thinkingConfig": {
                        "thinkingBudget": thinking_budget
                    }
                }
            });
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
                model,
                api_key.trim()
            );

            let resp = client
                .post(&url)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await;

            let resp = match resp {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("Failed to connect to Gemini API ({model}): {e}");
                    continue;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                let err_body = resp.text().await.unwrap_or_default();
                last_err = format!("Gemini API error on {model} ({status}): {err_body}");
                continue;
            }

            let mut full_text = String::new();
            let mut stream = resp.bytes_stream();

            while let Some(item) = stream.next().await {
                let chunk = match item {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("Error reading chunk: {e}");
                        break;
                    }
                };
                let text_chunk = String::from_utf8_lossy(&chunk);

                for line in text_chunk.lines() {
                    if let Some(json_str) = line.strip_prefix("data: ") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(candidates) = val.get("candidates").and_then(|c| c.as_array()) {
                                if let Some(first_cand) = candidates.first() {
                                    if let Some(parts) = first_cand.pointer("/content/parts").and_then(|p| p.as_array()) {
                                        for part in parts {
                                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                                full_text.push_str(text);

                                                let _ = app.emit(
                                                    "sidekick://talking-point-stream",
                                                    StreamChunkPayload {
                                                        id: point_id.to_string(),
                                                        delta: text.to_string(),
                                                        full_text: full_text.clone(),
                                                        question: question.to_string(),
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if !full_text.trim().is_empty() {
                return Ok(full_text);
            }
        }

        Err(if last_err.is_empty() {
            "All Gemini models failed to generate content".to_string()
        } else {
            last_err
        })
    }

    /// Anthropic Claude 3.5 Haiku Streaming
    async fn stream_claude<R: Runtime>(
        app: &AppHandle<R>,
        api_key: &str,
        system_prompt: &str,
        user_prompt: &str,
        point_id: &str,
        question: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let url = "https://api.anthropic.com/v1/messages";

        let body = serde_json::json!({
            "model": "claude-3-5-haiku-20241022",
            "max_tokens": 200,
            "temperature": 0.2,
            "system": system_prompt,
            "messages": [
                { "role": "user", "content": user_prompt }
            ],
            "stream": true
        });

        let resp = client
            .post(url)
            .header("x-api-key", api_key.trim())
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Anthropic API: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Claude API error ({status}): {err_body}"));
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| format!("Error in Claude stream: {e}"))?;
            let text_chunk = String::from_utf8_lossy(&chunk);

            for line in text_chunk.lines() {
                if let Some(json_str) = line.strip_prefix("data: ") {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if let Some(delta_text) = val.pointer("/delta/text").and_then(|t| t.as_str()) {
                            full_text.push_str(delta_text);
                            let _ = app.emit(
                                "sidekick://talking-point-stream",
                                StreamChunkPayload {
                                    id: point_id.to_string(),
                                    delta: delta_text.to_string(),
                                    full_text: full_text.clone(),
                                    question: question.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }

        Ok(full_text)
    }

    /// OpenAI GPT-4o-mini Streaming
    async fn stream_openai<R: Runtime>(
        app: &AppHandle<R>,
        api_key: &str,
        system_prompt: &str,
        user_prompt: &str,
        point_id: &str,
        question: &str,
    ) -> Result<String, String> {
        let client = reqwest::Client::new();
        let url = "https://api.openai.com/v1/chat/completions";

        let body = serde_json::json!({
            "model": "gpt-4o-mini",
            "temperature": 0.2,
            "max_tokens": 200,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "stream": true
        });

        let resp = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to OpenAI API: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({status}): {err_body}"));
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|e| format!("Error in OpenAI stream: {e}"))?;
            let text_chunk = String::from_utf8_lossy(&chunk);

            for line in text_chunk.lines() {
                if let Some(json_str) = line.strip_prefix("data: ") {
                    if json_str.trim() == "[DONE]" {
                        break;
                    }
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                            if let Some(first_choice) = choices.first() {
                                if let Some(delta_text) = first_choice.pointer("/delta/content").and_then(|t| t.as_str()) {
                                    full_text.push_str(delta_text);
                                    let _ = app.emit(
                                        "sidekick://talking-point-stream",
                                        StreamChunkPayload {
                                            id: point_id.to_string(),
                                            delta: delta_text.to_string(),
                                            full_text: full_text.clone(),
                                            question: question.to_string(),
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(full_text)
    }
}
