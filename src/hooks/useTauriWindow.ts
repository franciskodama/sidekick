import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useTauriWindow() {
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [isProtected, setIsProtected] = useState(true);
  const [isTauriEnvironment, setIsTauriEnvironment] = useState(false);

  useEffect(() => {
    // Check if running inside Tauri runtime
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    setIsTauriEnvironment(isTauri);
  }, []);

  const toggleClickThrough = useCallback(async () => {
    const nextState = !isClickThrough;
    setIsClickThrough(nextState);

    if (isTauriEnvironment) {
      try {
        await invoke("set_click_through", { ignore: nextState });
      } catch (err) {
        console.error("Failed to toggle click-through:", err);
      }
    }
  }, [isClickThrough, isTauriEnvironment]);

  const toggleScreenCaptureProtection = useCallback(async () => {
    const nextState = !isProtected;
    setIsProtected(nextState);

    if (isTauriEnvironment) {
      try {
        await invoke("set_screen_capture_protection", { protected: nextState });
      } catch (err) {
        console.error("Failed to toggle screen capture protection:", err);
      }
    }
  }, [isProtected, isTauriEnvironment]);

  const startDragging = useCallback(async () => {
    if (isTauriEnvironment) {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.startDragging();
      } catch (err) {
        console.error("Failed to start dragging window:", err);
      }
    }
  }, [isTauriEnvironment]);

  const minimize = useCallback(async () => {
    if (isTauriEnvironment) {
      try {
        await invoke("minimize_window");
      } catch (err) {
        console.error("Failed to minimize window:", err);
      }
    }
  }, [isTauriEnvironment]);

  const close = useCallback(async () => {
    if (isTauriEnvironment) {
      try {
        await invoke("close_window");
      } catch (err) {
        console.error("Failed to close window:", err);
      }
    }
  }, [isTauriEnvironment]);

  return {
    isClickThrough,
    isProtected,
    isAlwaysOnTop: true,
    isTauriEnvironment,
    toggleClickThrough,
    toggleScreenCaptureProtection,
    startDragging,
    minimize,
    close,
  };
}
