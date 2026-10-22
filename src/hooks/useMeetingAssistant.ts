import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  MeetingStatus,
  TalkingPoint,
  TranscriptSnippet,
  AudioLevel,
  RecordingState,
  AiMode,
} from "../types";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
  is_input: boolean;
}

export interface DocumentChunkInfo {
  id: string;
  source_path: string;
  title: string;
  content: string;
}

export function useMeetingAssistant() {
  const [recordingState, setRecordingState] = useState<RecordingState>("stopped");
  const [status, setStatus] = useState<MeetingStatus>("ready");
  const [aiMode, setAiMode] = useState<AiMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sidekick_ai_mode") as AiMode) || "on-demand";
    }
    return "on-demand";
  });
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState<AudioLevel>({
    peak: 0,
    isSpeaking: false,
  });
  const [currentSnippet, setCurrentSnippet] = useState<TranscriptSnippet | null>(null);
  const [detectedQuestion, setDetectedQuestion] = useState<string | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<TalkingPoint[]>([]);
  const [activeStreamingPoint, setActiveStreamingPoint] = useState<TalkingPoint | null>(null);
  const [indexedDocs, setIndexedDocs] = useState<DocumentChunkInfo[]>([]);

  // Browser Web Audio refs for fallback when testing in standard browser
  const webAudioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isTauri =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

  // 1. Fetch available audio devices and indexed documents
  const refreshDevices = useCallback(async () => {
    if (!isTauri) {
      setDevices([
        {
          id: "browser-mic",
          name: "Default Browser Microphone",
          is_default: true,
          is_input: true,
        },
      ]);
      setSelectedDevice("browser-mic");
      return;
    }

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
  }, [isTauri, selectedDevice]);

  const refreshDocuments = useCallback(async () => {
    if (!isTauri) {
      try {
        const resp = await fetch("/api/knowledge-docs");
        if (resp.ok) {
          const docs: DocumentChunkInfo[] = await resp.json();
          setIndexedDocs(docs);
          return;
        }
      } catch (err) {
        console.warn("Could not fetch knowledge docs from dev server:", err);
      }
      return;
    }

    try {
      const docs = await invoke<DocumentChunkInfo[]>("get_indexed_documents");
      setIndexedDocs(docs);
    } catch (err) {
      console.error("Failed to load indexed documents:", err);
    }
  }, [isTauri]);

  const reindexDocuments = useCallback(async () => {
    if (isTauri) {
      try {
        await invoke("ingest_documents");
        const docs = await invoke<DocumentChunkInfo[]>("get_indexed_documents");
        setIndexedDocs(docs);
      } catch (err) {
        console.error("Failed to reindex documents:", err);
      }
    } else {
      await refreshDocuments();
    }
  }, [isTauri, refreshDocuments]);

  useEffect(() => {
    refreshDevices();
    refreshDocuments();
  }, [refreshDevices, refreshDocuments]);

  // AI Mode toggle (Auto vs On-Demand)
  const toggleAiMode = useCallback(() => {
    setAiMode((prev) => {
      const next: AiMode = prev === "auto" ? "on-demand" : "auto";
      if (typeof window !== "undefined") {
        localStorage.setItem("sidekick_ai_mode", next);
      }
      return next;
    });
  }, []);

  // 2. Query execution engine
  const executeQuery = useCallback(
    async (questionText: string) => {
      setStatus("processing");

      const provider = localStorage.getItem("sidekick_llm_provider") || "gemini";
      const apiKey =
        provider === "gemini"
          ? localStorage.getItem("sidekick_gemini_key")
          : localStorage.getItem("sidekick_llm_key");

      if (isTauri) {
        try {
          await invoke("generate_talking_points", {
            question: questionText,
            provider,
            apiKey: apiKey ? apiKey.trim() : null,
          });
        } catch (err) {
          console.error("Error generating talking points in Tauri:", err);
          const fallbackPoint: TalkingPoint = {
            id: `pt-${Date.now()}`,
            topic: "Configuration Guide",
            question: questionText,
            bullets: [
              "Question detected by HUD.",
              "Make sure your GEMINI_API_KEY is configured in .env or Settings.",
              "Knowledge documents indexed and ready.",
            ],
            wordCount: 20,
            sources: ["Sidekick_Config"],
            timestamp: Date.now(),
          };
          setTalkingPoints((prev) => [fallbackPoint, ...prev]);
          setStatus("ready");
        }
      } else {
        // Direct browser client-side streaming or simulated answer
        if (apiKey && provider === "gemini") {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;
            const resp = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: `Question: ${questionText}` }] }],
                systemInstruction: {
                  parts: [
                    {
                      text: "You are Sidekick, an ultra-dense HUD meeting assistant. Answer in exactly 2-3 bullets, under 30 words total. Zero conversational filler.",
                    },
                  ],
                },
              }),
            });

            if (resp.ok && resp.body) {
              const reader = resp.body.getReader();
              const decoder = new TextDecoder();
              let fullText = "";

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                for (const line of chunk.split("\n")) {
                  if (line.startsWith("data: ")) {
                    try {
                      const json = JSON.parse(line.slice(6));
                      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                      if (text) {
                        fullText += text;
                        const bullets = fullText
                          .split("\n")
                          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
                          .filter(Boolean);
                        setActiveStreamingPoint({
                          id: "streaming",
                          topic: "Gemini 2.5 Flash",
                          question: questionText,
                          bullets,
                          wordCount: fullText.split(/\s+/).filter(Boolean).length,
                          sources: ["Gemini Cloud"],
                          timestamp: Date.now(),
                        });
                      }
                    } catch {}
                  }
                }
              }

              setActiveStreamingPoint(null);
              const finalBullets = fullText
                .split("\n")
                .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
                .filter(Boolean);
              setTalkingPoints((prev) => [
                {
                  id: `pt-${Date.now()}`,
                  topic: "Gemini 2.5 Flash",
                  question: questionText,
                  bullets: finalBullets,
                  wordCount: fullText.split(/\s+/).filter(Boolean).length,
                  sources: ["Gemini Cloud"],
                  timestamp: Date.now(),
                },
                ...prev,
              ]);
              setStatus("ready");
              return;
            }
          } catch (e) {
            console.error("Browser direct fetch error:", e);
          }
        }

        // Instant simulated response for browser preview
        setTimeout(() => {
          const answerPoint: TalkingPoint = {
            id: `pt-${Date.now()}`,
            topic: "Knowledge Base Match",
            question: questionText,
            bullets: [
              "Captures remote audio loopback directly without extra virtual soundcards.",
              "Excluded from screen shares via macOS NSWindowSharingNone.",
              "Provides sub-300ms talking points powered by Gemini Flash.",
            ],
            wordCount: 26,
            sources: ["Sidekick_Product_Overview.md", "Security_and_Privacy.md"],
            timestamp: Date.now(),
          };
          setTalkingPoints((prev) => [answerPoint, ...prev]);
          setStatus("ready");
        }, 350);
      }
    },
    [isTauri]
  );

  // 3. Set up event listeners (Tauri mode)
  useEffect(() => {
    if (!isTauri) return;

    let unlistenAudio: UnlistenFn | undefined;
    let unlistenTranscript: UnlistenFn | undefined;
    let unlistenQuestion: UnlistenFn | undefined;
    let unlistenStream: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;

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

          if (event.payload.is_final && recordingState === "recording") {
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

          // If in Auto mode, trigger immediately. If On-Demand, wait for user click!
          const currentMode =
            (localStorage.getItem("sidekick_ai_mode") as AiMode) || "on-demand";

          if (currentMode === "auto") {
            executeQuery(event.payload.question);
          } else {
            // Stay in ready status so the user can review and click [✨ Answer]
            setStatus("ready");
          }
        });

        // Real-time SSE token streaming
        unlistenStream = await listen<{
          id: string;
          delta: string;
          full_text: string;
          question: string;
        }>("sidekick://talking-point-stream", (event) => {
          const rawBullets = event.payload.full_text
            .split("\n")
            .map((l) => l.trim().replace(/^[•\-*]\s*/, "").trim())
            .filter((l) => l.length > 0);

          setActiveStreamingPoint({
            id: event.payload.id,
            topic: "Gemini 2.5 Flash Synthesis",
            question: event.payload.question,
            bullets: rawBullets.length > 0 ? rawBullets : [event.payload.full_text],
            wordCount: event.payload.full_text.split(/\s+/).filter(Boolean).length,
            sources: ["Gemini Flash", "Local Knowledge"],
            timestamp: Date.now(),
          });
        });

        // Finalized talking point payload
        unlistenDone = await listen<{
          id: string;
          topic: string;
          question: string;
          bullets: string[];
          word_count: number;
          sources: string[];
          timestamp: number;
        }>("sidekick://talking-point-done", (event) => {
          const finishedPoint: TalkingPoint = {
            id: event.payload.id,
            topic: event.payload.topic,
            question: event.payload.question,
            bullets: event.payload.bullets,
            wordCount: event.payload.word_count,
            sources: event.payload.sources,
            timestamp: event.payload.timestamp,
          };

          setActiveStreamingPoint(null);
          setTalkingPoints((prev) => [
            finishedPoint,
            ...prev.filter((p) => p.id !== finishedPoint.id),
          ]);
          setStatus("ready");
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
      if (unlistenStream) unlistenStream();
      if (unlistenDone) unlistenDone();
    };
  }, [isTauri, recordingState, executeQuery]);

  // 4. Audio Capture Controls: Start, Pause, Resume, Stop
  const startCapture = useCallback(async () => {
    if (isTauri) {
      try {
        const savedDg = localStorage.getItem("sidekick_dg_key");
        await invoke("start_audio_capture", {
          deviceId: selectedDevice || null,
          apiKey: savedDg ? savedDg.trim() : null,
        });
        setRecordingState("recording");
        setStatus("listening");
      } catch (err) {
        console.error("Failed to start native audio capture:", err);
      }
    } else {
      // Browser Web Audio fallback
      try {
        const getUserMediaWithTimeout = async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("getUserMedia not supported");
          }
          const getStream = navigator.mediaDevices.getUserMedia({ audio: true });
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Mic prompt timed out")), 600)
          );
          return Promise.race([getStream, timeout]);
        };

        const stream = await getUserMediaWithTimeout();
        webAudioStreamRef.current = stream;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkAudio = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const peak = avg / 128;
          setAudioLevel({
            peak: Math.min(1, peak * 1.5),
            isSpeaking: peak > 0.1,
          });
          animFrameRef.current = requestAnimationFrame(checkAudio);
        };

        checkAudio();
        setRecordingState("recording");
        setStatus("listening");
      } catch (err) {
        console.warn("Browser mic access unavailable or timed out, using preview simulation:", err);
        setRecordingState("recording");
        setStatus("listening");
        setAudioLevel({ peak: 0.35, isSpeaking: true });

        // Gentle simulated voice oscillation for web preview
        if (animFrameRef.current) clearInterval(animFrameRef.current);
        let tick = 0;
        const intervalId = setInterval(() => {
          tick++;
          const peak = 0.15 + 0.35 * Math.abs(Math.sin(tick * 0.4));
          setAudioLevel({ peak, isSpeaking: peak > 0.2 });
        }, 120);
        animFrameRef.current = intervalId as unknown as number;
      }
    }
  }, [isTauri, selectedDevice]);

  const pauseCapture = useCallback(async () => {
    if (isTauri) {
      try {
        await invoke("pause_audio_capture");
      } catch (err) {
        console.error("Failed to pause audio capture:", err);
      }
    } else {
      if (audioContextRef.current && audioContextRef.current.state === "running") {
        audioContextRef.current.suspend().catch(() => {});
      }
      if (animFrameRef.current) {
        clearInterval(animFrameRef.current);
        cancelAnimationFrame(animFrameRef.current);
      }
    }
    setRecordingState("paused");
    setStatus("paused");
    setAudioLevel({ peak: 0, isSpeaking: false });
  }, [isTauri]);

  const resumeCapture = useCallback(async () => {
    if (isTauri) {
      try {
        await invoke("resume_audio_capture");
      } catch (err) {
        console.error("Failed to resume audio capture:", err);
      }
    } else {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      } else {
        let tick = 0;
        const intervalId = setInterval(() => {
          tick++;
          const peak = 0.15 + 0.35 * Math.abs(Math.sin(tick * 0.4));
          setAudioLevel({ peak, isSpeaking: peak > 0.2 });
        }, 120);
        animFrameRef.current = intervalId as unknown as number;
      }
    }
    setRecordingState("recording");
    setStatus("listening");
  }, [isTauri]);

  const stopCapture = useCallback(async () => {
    if (isTauri) {
      try {
        await invoke("stop_audio_capture");
      } catch (err) {
        console.error("Failed to stop audio capture:", err);
      }
    } else {
      if (animFrameRef.current) {
        clearInterval(animFrameRef.current);
        cancelAnimationFrame(animFrameRef.current);
      }
      if (webAudioStreamRef.current) {
        webAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    }

    setRecordingState("stopped");
    setStatus("ready");
    setAudioLevel({ peak: 0, isSpeaking: false });
  }, [isTauri]);

  // Dismiss detected question without spending tokens
  const dismissQuestion = useCallback(() => {
    setDetectedQuestion(null);
    setStatus("ready");
  }, []);

  // Trigger Gemini answer for current question
  const triggerAnswer = useCallback(() => {
    if (detectedQuestion) {
      executeQuery(detectedQuestion);
    }
  }, [detectedQuestion, executeQuery]);

  return {
    recordingState,
    isCapturing: recordingState !== "stopped",
    status,
    aiMode,
    devices,
    selectedDevice,
    setSelectedDevice,
    audioLevel,
    currentSnippet,
    detectedQuestion,
    talkingPoints,
    activeStreamingPoint,
    indexedDocs,
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
    toggleAiMode,
    dismissQuestion,
    triggerAnswer,
    refreshDevices,
    refreshDocuments,
    reindexDocuments,
    askQuestion: executeQuery,
  };
}
