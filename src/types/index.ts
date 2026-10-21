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

export type MeetingStatus = "idle" | "listening" | "processing" | "ready";

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
