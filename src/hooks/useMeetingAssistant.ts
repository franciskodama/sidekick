import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  MeetingStatus,
  TalkingPoint,
  TranscriptSnippet,
  AudioLevel,
} from "../types";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
  is_input: boolean;
}

export function useMeetingAssistant() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState<MeetingStatus>("ready");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState<AudioLevel>({
    peak: 0,
    isSpeaking: false,
  });
  const [currentSnippet, setCurrentSnippet] = useState<TranscriptSnippet | null>(null);
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<TalkingPoint[]>([]);

  // 1. Fetch available audio devices
  const refreshDevices = useCallback(async () => {
    try {
      const devList = await invoke<AudioDevice[]>("get_audio_devices");
      setDevices(devList);
      const def = devList.find((d) => d.is_default);
      if (def && !selectedDevice) {
        setSelectedDevice(def.id);
      }
    } catch (err) {
      console.error("Failed to load audio devices:", err);
    }
  }, [selectedDevice]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // 2. Set up event listeners for live audio & speech events
  useEffect(() => {
    let unlistenAudio: UnlistenFn | undefined;
    let unlistenTranscript: UnlistenFn | undefined;
    let unlistenQuestion: UnlistenFn | undefined;

    async function setupListeners() {
      try {
        // Real-time audio level & VAD
        unlistenAudio = await listen<{
          rms: number;
          peak: number;
          is_speaking: boolean;
        }>("sidekick://audio-level", (event) => {
          setAudioLevel({
            peak: Math.min(1, event.payload.peak * 2),
            isSpeaking: event.payload.is_speaking,
          });
        });

        // Live transcription ticker
        unlistenTranscript = await listen<{
          text: string;
          is_final: boolean;
          confidence: number;
          timestamp_ms: number;
        }>("sidekick://transcript", (event) => {
          setCurrentSnippet({
            id: String(event.payload.timestamp_ms),
            text: event.payload.text,
            isFinal: event.payload.is_final,
            timestamp: event.payload.timestamp_ms,
          });

          if (event.payload.is_final) {
            setStatus("listening");
          }
        });

        // Question recognized by Nova-2
        unlistenQuestion = await listen<{
          question: string;
          raw_transcript: string;
          timestamp_ms: number;
        }>("sidekick://question-detected", (event) => {
          setDetectedQuestion(event.payload.question);
          setStatus("processing");

          // Demo RAG placeholder response when live question triggers (Phase 3 connects full vector RAG)
          setTimeout(() => {
            const newPoint: TalkingPoint = {
              id: `pt-${Date.now()}`,
              topic: "Live Meeting Context",
              question: event.payload.question,
              bullets: [
                "Direct answer synthesized from indexed knowledge documents.",
                "Real-time low-latency retrieval under 300ms.",
                "Glanceable talking point designed for camera line-of-sight.",
              ],
              wordCount: 28,
              sources: ["Knowledge_Base.md"],
              timestamp: Date.now(),
            };
            setTalkingPoints((prev) => [newPoint, ...prev]);
            setStatus("ready");
          }, 600);
        });
      } catch (err) {
        console.error("Error setting up Tauri event listeners:", err);
      }
    }

    setupListeners();

    return () => {
      if (unlistenAudio) unlistenAudio();
      if (unlistenTranscript) unlistenTranscript();
      if (unlistenQuestion) unlistenQuestion();
    };
  }, []);

  // 3. Audio Capture Controls
  const startCapture = useCallback(
    async (apiKey?: string) => {
      try {
        await invoke("start_audio_capture", {
          deviceId: selectedDevice || null,
          apiKey: apiKey || null,
        });
        setIsCapturing(true);
        setStatus("listening");
      } catch (err) {
        console.error("Failed to start audio capture:", err);
      }
    },
    [selectedDevice]
  );

  const stopCapture = useCallback(async () => {
    try {
      await invoke("stop_audio_capture");
      setIsCapturing(false);
      setStatus("ready");
      setAudioLevel({ peak: 0, isSpeaking: false });
    } catch (err) {
      console.error("Failed to stop audio capture:", err);
    }
  }, []);

  const toggleCapture = useCallback(
    (apiKey?: string) => {
      if (isCapturing) {
        stopCapture();
      } else {
        startCapture(apiKey);
      }
    },
    [isCapturing, startCapture, stopCapture]
  );

  return {
    isCapturing,
    status,
    devices,
    selectedDevice,
    setSelectedDevice,
    audioLevel,
    currentSnippet,
    detectedQuestion,
    talkingPoints,
    toggleCapture,
    refreshDevices,
  };
}
