export interface TalkingPoint {
  id: string;
  topic: string;
  question: string;
  bullets: string[];
  wordCount: number;
  sources: string[];
  timestamp: number;
}

export interface TranscriptSnippet {
  id: string;
  text: string;
  isFinal: boolean;
  speaker?: string;
  timestamp: number;
}

export type MeetingStatus = "idle" | "listening" | "processing" | "ready" | "paused";
export type RecordingState = "stopped" | "recording" | "paused";
export type AiMode = "auto" | "on-demand";

export interface AudioLevel {
  peak: number; // 0.0 to 1.0
  isSpeaking: boolean;
}

export interface OverlayConfig {
  clickThrough: boolean;
  screenCaptureProtected: boolean;
  alwaysOnTop: boolean;
  opacity: number;
}
