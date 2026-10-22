//! RAG and Generative Talking Points IPC Commands

use crate::rag::{DocumentChunk, InferenceService, KnowledgeStore, LlmProvider, TalkingPointPayload};
use std::sync::Mutex;
use tauri::{AppHandle, Runtime, State};

pub struct RagState {
    pub store: Mutex<KnowledgeStore>,
}

impl Default for RagState {
    fn default() -> Self {
        Self {
            store: Mutex::new(KnowledgeStore::new()),
        }
    }
}

#[tauri::command]
pub async fn get_indexed_documents(state: State<'_, RagState>) -> Result<Vec<DocumentChunk>, String> {
    let store = state.store.lock().map_err(|e| e.to_string())?;
    Ok(store.list_chunks())
}

#[tauri::command]
pub async fn ingest_documents(
    state: State<'_, RagState>,
    dir_path: Option<String>,
) -> Result<usize, String> {
    let mut store = state.store.lock().map_err(|e| e.to_string())?;
    store.clear();
    let path = dir_path
        .map(std::path::PathBuf::from)
        .unwrap_or_else(KnowledgeStore::find_knowledge_dir);
    store.load_from_directory(path);
    Ok(store.total_chunks())
}

#[tauri::command]
pub async fn generate_talking_points<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, RagState>,
    question: String,
    provider: Option<String>,
    api_key: Option<String>,
) -> Result<TalkingPointPayload, String> {
    let llm_provider = match provider.as_deref() {
        Some(p) => LlmProvider::from(p),
        None => LlmProvider::Gemini,
    };

    // Determine the active API key
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| match llm_provider {
            LlmProvider::Gemini => std::env::var("GEMINI_API_KEY").ok(),
            LlmProvider::Claude => std::env::var("ANTHROPIC_API_KEY").ok(),
            LlmProvider::OpenAi => std::env::var("OPENAI_API_KEY").ok(),
        })
        .ok_or_else(|| {
            format!(
                "Missing API key for {:?}. Please set it in Settings or your .env file.",
                llm_provider
            )
        })?;

    // 1. Retrieve top relevant chunks from local KnowledgeStore
    let chunks = {
        let store = state.store.lock().map_err(|e| e.to_string())?;
        store.search(&question, 3)
    };

    // 2. Stream ultra-dense talking points via Server-Sent Events
    InferenceService::stream_talking_points(&app_handle, llm_provider, &key, &question, &chunks).await
}
