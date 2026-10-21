//! Retrieval-Augmented Generation (RAG) module
//!
//! Indexes local documents (PDFs, Markdown) and runs hybrid search (dense embeddings + BM25)
//! to feed high-signal context to LLM inference for generating concise talking points.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub source_path: String,
    pub title: String,
    pub content: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalkingPointResult {
    pub query: String,
    pub bullets: Vec<String>,
    pub word_count: usize,
    pub references: Vec<String>,
}
