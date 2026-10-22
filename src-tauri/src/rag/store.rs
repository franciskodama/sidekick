//! In-memory Document Chunking and Keyword/BM25 Retrieval Engine
//!
//! Supports Markdown (.md), Plain Text (.txt), and PDF (.pdf) documents.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub source_path: String,
    pub title: String,
    pub content: String,
    pub score: f32,
}

#[derive(Default)]
pub struct KnowledgeStore {
    chunks: Vec<DocumentChunk>,
}

impl KnowledgeStore {
    pub fn new() -> Self {
        let mut store = Self::default();
        let dir = Self::find_knowledge_dir();
        store.load_from_directory(dir);
        store
    }

    /// Locate the knowledge directory across potential execution contexts
    pub fn find_knowledge_dir() -> std::path::PathBuf {
        if let Ok(dir) = std::env::var("KNOWLEDGE_DOCS_DIR") {
            let p = std::path::PathBuf::from(&dir);
            if p.exists() && p.is_dir() {
                return p;
            }
        }

        for candidate in &["./knowledge", "../knowledge", "knowledge", "../../knowledge"] {
            let p = std::path::PathBuf::from(candidate);
            if p.exists() && p.is_dir() {
                return p;
            }
        }

        std::path::PathBuf::from("./knowledge")
    }

    /// Clear all loaded document chunks before re-indexing
    pub fn clear(&mut self) {
        self.chunks.clear();
    }

    /// Load and chunk all markdown (.md), text (.txt), and PDF (.pdf) files from a directory.
    pub fn load_from_directory<P: AsRef<Path>>(&mut self, path: P) {
        let p = path.as_ref();
        if !p.exists() || !p.is_dir() {
            eprintln!("Warning: Knowledge directory does not exist: {:?}", p);
            return;
        }

        if let Ok(entries) = fs::read_dir(p) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_file() {
                    let file_name = file_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("document")
                        .to_string();

                    // Skip hidden files like .DS_Store
                    if file_name.starts_with('.') {
                        continue;
                    }

                    let ext = file_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if ext == "md" || ext == "txt" {
                        if let Ok(content) = fs::read_to_string(&file_path) {
                            self.ingest_document(&file_name, &content);
                        }
                    } else if ext == "pdf" {
                        match pdf_extract::extract_text(&file_path) {
                            Ok(content) => {
                                self.ingest_document(&file_name, &content);
                            }
                            Err(e) => {
                                eprintln!("Warning: Failed to extract text from PDF {file_name}: {e}");
                            }
                        }
                    }
                }
            }
        }
    }

    /// Ingest and chunk a document:
    /// - Markdown files are chunked by section headers (#, ##, ###).
    /// - PDFs and plain text files are chunked into semantic paragraph blocks (~180-250 words).
    pub fn ingest_document(&mut self, source_name: &str, content: &str) {
        let trimmed_content = content.trim();
        if trimmed_content.is_empty() {
            return;
        }

        let has_headers = trimmed_content.lines().any(|l| l.trim().starts_with('#'));

        if has_headers {
            let mut current_title = source_name.to_string();
            let mut current_lines = Vec::new();

            for line in trimmed_content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') {
                    if !current_lines.is_empty() {
                        let chunk_text = current_lines.join("\n").trim().to_string();
                        if !chunk_text.is_empty() {
                            self.chunks.push(DocumentChunk {
                                id: format!("{}-{}", source_name, self.chunks.len()),
                                source_path: source_name.to_string(),
                                title: current_title.clone(),
                                content: chunk_text,
                                score: 0.0,
                            });
                        }
                        current_lines.clear();
                    }
                    current_title = trimmed.trim_start_matches('#').trim().to_string();
                } else {
                    current_lines.push(line);
                }
            }

            if !current_lines.is_empty() {
                let chunk_text = current_lines.join("\n").trim().to_string();
                if !chunk_text.is_empty() {
                    self.chunks.push(DocumentChunk {
                        id: format!("{}-{}", source_name, self.chunks.len()),
                        source_path: source_name.to_string(),
                        title: current_title,
                        content: chunk_text,
                        score: 0.0,
                    });
                }
            }
        } else {
            // PDF or prose: split by paragraphs, grouping into chunks of ~180-250 words
            let paragraphs: Vec<&str> = trimmed_content
                .split("\n\n")
                .map(|p| p.trim())
                .filter(|p| !p.is_empty())
                .collect();

            let mut current_chunk = Vec::new();
            let mut current_word_count = 0;
            let mut chunk_index = 1;

            for para in paragraphs {
                let words = para.split_whitespace().count();
                current_chunk.push(para);
                current_word_count += words;

                if current_word_count >= 180 {
                    let text = current_chunk.join("\n\n");
                    self.chunks.push(DocumentChunk {
                        id: format!("{}-{}", source_name, self.chunks.len()),
                        source_path: source_name.to_string(),
                        title: format!("{} (Section {})", source_name, chunk_index),
                        content: text,
                        score: 0.0,
                    });
                    current_chunk.clear();
                    current_word_count = 0;
                    chunk_index += 1;
                }
            }

            if !current_chunk.is_empty() {
                let text = current_chunk.join("\n\n");
                self.chunks.push(DocumentChunk {
                    id: format!("{}-{}", source_name, self.chunks.len()),
                    source_path: source_name.to_string(),
                    title: format!("{} (Section {})", source_name, chunk_index),
                    content: text,
                    score: 0.0,
                });
            }
        }
    }

    /// Retrieve the top-K most relevant chunks using BM25-style keyword relevance scoring.
    pub fn search(&self, query: &str, top_k: usize) -> Vec<DocumentChunk> {
        let stop_words: HashSet<&'static str> = [
            "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with",
            "is", "are", "was", "were", "what", "how", "why", "when", "who", "which",
            "can", "could", "would", "do", "does", "did", "this", "that", "these", "those",
        ]
        .iter()
        .copied()
        .collect();

        let query_tokens: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
            .filter(|w| !w.is_empty() && !stop_words.contains(w.as_str()))
            .collect();

        if query_tokens.is_empty() || self.chunks.is_empty() {
            return self.chunks.iter().take(top_k).cloned().collect();
        }

        let mut scored_chunks: Vec<(f32, DocumentChunk)> = self
            .chunks
            .iter()
            .map(|chunk| {
                let content_lower = chunk.content.to_lowercase();
                let title_lower = chunk.title.to_lowercase();
                let mut score = 0.0f32;

                for token in &query_tokens {
                    if title_lower.contains(token) {
                        score += 5.0;
                    }
                    let occurrences = content_lower.matches(token).count();
                    if occurrences > 0 {
                        score += 1.0 + (occurrences as f32).ln_1p();
                    }
                }

                (score, DocumentChunk {
                    score,
                    ..chunk.clone()
                })
            })
            .filter(|(score, _)| *score > 0.0)
            .collect();

        scored_chunks.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        scored_chunks
            .into_iter()
            .take(top_k)
            .map(|(_, chunk)| chunk)
            .collect()
    }

    pub fn total_chunks(&self) -> usize {
        self.chunks.len()
    }

    pub fn list_chunks(&self) -> Vec<DocumentChunk> {
        self.chunks.clone()
    }
}
