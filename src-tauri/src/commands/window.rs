use tauri::{AppHandle, Manager, Runtime, WebviewWindow, Window};

/// Toggle or set click-through mode for the HUD window.
/// When `ignore` is true, cursor events pass directly through to underlying applications.
#[tauri::command]
pub async fn set_click_through<R: Runtime>(
    window: Window<R>,
    ignore: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| format!("Failed to set ignore cursor events: {e}"))
}

/// Enable or disable screen capture protection.
/// On macOS, this sets NSWindowSharingNone so Zoom, Teams, Google Meet, and screen recorders cannot capture the HUD.
/// On Windows, this sets WDA_EXCLUDEFROMCAPTURE.
#[tauri::command]
pub async fn set_screen_capture_protection<R: Runtime>(
    window: Window<R>,
    protected: bool,
) -> Result<(), String> {
    window
        .set_content_protected(protected)
        .map_err(|e| format!("Failed to set content protection: {e}"))
}

/// Minimize the HUD overlay window.
#[tauri::command]
pub async fn minimize_window<R: Runtime>(window: Window<R>) -> Result<(), String> {
    window
        .minimize()
        .map_err(|e| format!("Failed to minimize window: {e}"))
}

/// Close the HUD application.
#[tauri::command]
pub async fn close_window<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}
