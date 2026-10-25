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

function isQuestionLike(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) {
    return true;
  }

  // Strip leading punctuation and common conversational filler prefixes
  const clean = trimmed
    .toLowerCase()
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/^(so|okay|ok|well|now|and|then|um|uh|great|cool|right)[,\s]+/i, "")
    .trim();

  if (clean.endsWith("?")) {
    return true;
  }

  // Typical interview and meeting prompts (commands that expect talking points)
  const interviewPromptPatterns = [
    /\btell (me|us)\b/i,
    /\bwalk (me|us) through\b/i,
    /\btalk (about|to me about|to us about)\b/i,
    /\bdescribe (a time|your|how|what)\b/i,
    /\bexplain (how|why|what|your)\b/i,
    /\bgive (me |us )?(an? )?example\b/i,
    /\bshare (an? )?(example|time|experience)\b/i,
    /\belaborate on\b/i,
    /\bspeak to\b/i,
    /\bwhat would you\b/i,
    /\bhow would you\b/i,
    /\bwhat is your\b/i,
    /\bwhat are your\b/i,
    /\bwhy did you\b/i,
    /\bwhy do you\b/i,
  ];

  if (interviewPromptPatterns.some((pattern) => pattern.test(clean))) {
    return true;
  }

  const interrogativePrefixes = [
    "what",
    "how",
    "why",
    "who",
    "when",
    "where",
    "which",
    "whose",
    "can you",
    "could you",
    "would you",
    "will you",
    "can we",
    "could we",
    "should we",
    "is there",
    "are there",
    "do you",
    "did you",
    "does this",
    "do we",
    "have you",
    "tell me",
    "tell us",
    "walk me",
    "walk us",
    "explain",
    "describe",
  ];

  return interrogativePrefixes.some((prefix) => clean.startsWith(prefix));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);

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
          ? localStorage.getItem("sidekick_gemini_key") || import.meta.env.VITE_GEMINI_API_KEY
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
        // Direct browser client-side streaming
        const candidateModels = ["gemini-3.6-flash", "gemini-3.1-flash-lite"];
        let success = false;

        if (apiKey && provider === "gemini") {
          const relevantDocs = indexedDocs.filter((d) => !d.content.startsWith("Indexed document ("));
          const relevantContext = relevantDocs
            .map((d) => `[Source: ${d.title}]\n${d.content.slice(0, 2000)}`)
            .join("\n\n");

          const promptText = relevantContext
            ? `Knowledge Context:\n${relevantContext}\n\nQuestion:\n${questionText}`
            : `Question: ${questionText}`;

          for (const model of candidateModels) {
            try {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;

              const resp = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: promptText }] }],
                  systemInstruction: {
                    parts: [
                      {
                        text: "You are Sidekick, an ultra-dense HUD meeting assistant. Answer using the provided knowledge context in exactly 2-3 bullets, under 35 words total. Zero conversational filler.",
                      },
                    ],
                  },
                }),
              });

              if (!resp.ok) {
                const errText = await resp.text();
                console.warn(`Gemini model ${model} failed (${resp.status}):`, errText);
                continue;
              }

              if (resp.body) {
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
                            topic: model === "gemini-3.6-flash" ? "Gemini 3.6 Flash" : "Gemini 3.1 Flash-Lite",
                            question: questionText,
                            bullets,
                            wordCount: fullText.split(/\s+/).filter(Boolean).length,
                            sources: relevantDocs.length > 0 ? relevantDocs.map((d) => d.source_path) : ["Gemini Cloud"],
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

                if (finalBullets.length > 0) {
                  setTalkingPoints((prev) => [
                    {
                      id: `pt-${Date.now()}`,
                      topic: model === "gemini-3.6-flash" ? "Gemini 3.6 Flash" : "Gemini 3.1 Flash-Lite",
                      question: questionText,
                      bullets: finalBullets,
                      wordCount: fullText.split(/\s+/).filter(Boolean).length,
                      sources: relevantDocs.length > 0 ? relevantDocs.map((d) => d.source_path) : ["Gemini Cloud"],
                      timestamp: Date.now(),
                    },
                    ...prev,
                  ]);
                  setStatus("ready");
                  success = true;
                  return;
                }
              }
            } catch (e) {
              console.error(`Browser fetch error on ${model}:`, e);
            }
          }
        }

        if (!success) {
          setActiveStreamingPoint(null);
          const errorPoint: TalkingPoint = {
            id: `pt-${Date.now()}`,
            topic: "Inference Notice",
            question: questionText,
            bullets: [
              apiKey
                ? "Gemini API temporarily experiencing high traffic spikes (503). Click Answer to retry in a moment."
                : "No GEMINI_API_KEY detected. Please check your .env or Settings.",
              "Knowledge base files are ready in ./knowledge.",
            ],
            wordCount: 20,
            sources: ["System"],
            timestamp: Date.now(),
          };
          setTalkingPoints((prev) => [errorPoint, ...prev]);
          setStatus("ready");
        }
      }
    },
    [isTauri, indexedDocs]
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
  const recordingStateRef = useRef<RecordingState>("stopped");
  recordingStateRef.current = recordingState;

  const startCapture = useCallback(async () => {
    if (isTauri) {
      try {
        const savedDg =
          localStorage.getItem("sidekick_dg_key") || import.meta.env.VITE_DEEPGRAM_API_KEY;
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
      // Browser Web Audio + Web Speech API fallback
      try {
        const getUserMediaWithTimeout = async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("getUserMedia not supported");
          }
          const getStream = navigator.mediaDevices.getUserMedia({ audio: true });
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Mic prompt timed out")), 1500)
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
            isSpeaking: peak > 0.08,
          });
          animFrameRef.current = requestAnimationFrame(checkAudio);
        };

        checkAudio();

        // Browser Web Speech API for real-time STT in Chrome / Safari
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onresult = (event: any) => {
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                const text = res[0].transcript.trim();
                const isFinal = res.isFinal;

                setCurrentSnippet({
                  id: String(Date.now()),
                  text,
                  isFinal,
                  timestamp: Date.now(),
                });

                if (isFinal && isQuestionLike(text)) {
                  setDetectedQuestion(text);
                  const currentMode =
                    (localStorage.getItem("sidekick_ai_mode") as AiMode) || "on-demand";
                  if (currentMode === "auto") {
                    executeQuery(text);
                  } else {
                    setStatus("ready");
                  }
                }
              }
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            recognition.onerror = (e: any) => {
              console.warn("Browser SpeechRecognition error:", e);
            };

            recognition.onend = () => {
              // Auto-restart if we are still in recording state
              if (recordingStateRef.current === "recording" && speechRecognitionRef.current) {
                try {
                  recognition.start();
                } catch {}
              }
            };

            recognition.start();
            speechRecognitionRef.current = recognition;
          } catch (recErr) {
            console.warn("Could not start Web SpeechRecognition:", recErr);
          }
        }

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
  }, [isTauri, selectedDevice, executeQuery]);

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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch {}
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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
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
      const q = detectedQuestion;
      setDetectedQuestion(null);
      executeQuery(q);
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
