pub mod audio;
pub mod commands;
pub mod rag;
pub mod stt;

use commands::audio::{get_audio_devices, pause_audio_capture, resume_audio_capture, start_audio_capture, stop_audio_capture};
use commands::rag::{generate_talking_points, get_indexed_documents, ingest_documents};
use commands::window::{close_window, minimize_window, set_click_through, set_screen_capture_protection};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file (checking root and current dir)
    dotenvy::dotenv().ok();
    dotenvy::from_filename("../.env").ok();

    tauri::Builder::default()
        .manage(commands::audio::AudioSessionState::default())
        .manage(commands::rag::RagState::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Configure window properties on startup
            if let Some(main_window) = app.get_webview_window("main") {
                // Apply screen capture protection (NSWindowSharingNone on macOS, WDA_EXCLUDEFROMCAPTURE on Windows)
                // This ensures the HUD remains invisible to remote meeting attendees (Zoom, Teams, Meet).
                if let Err(e) = main_window.set_content_protected(true) {
                    eprintln!("Warning: Failed to set initial screen capture protection: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window & Overlay Controls
            set_click_through,
            set_screen_capture_protection,
            minimize_window,
            close_window,
            // Native Audio Controls
            get_audio_devices,
            start_audio_capture,
            pause_audio_capture,
            resume_audio_capture,
            stop_audio_capture,
            // RAG & Gemini Inference
            get_indexed_documents,
            ingest_documents,
            generate_talking_points
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sidekick Tauri application");
}
