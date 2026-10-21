pub mod audio;
pub mod commands;
pub mod rag;
pub mod stt;

use commands::audio::{get_audio_devices, start_audio_capture, stop_audio_capture};
use commands::window::{close_window, minimize_window, set_click_through, set_screen_capture_protection};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            stop_audio_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sidekick Tauri application");
}
