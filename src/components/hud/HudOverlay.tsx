import React, { useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { LiveTranscript } from "./LiveTranscript";
import { TalkingPoints } from "./TalkingPoints";
import { SettingsModal } from "../settings/SettingsModal";
import { useTauriWindow } from "../../hooks/useTauriWindow";
import type { MeetingStatus, TalkingPoint, TranscriptSnippet } from "../../types";

const INITIAL_TALKING_POINTS: TalkingPoint[] = [
  {
    id: "sample-1",
    topic: "System Architecture & Security",
    question: "How does Sidekick capture audio without interrupting the call?",
    bullets: [
      "OS Loopback (ScreenCaptureKit/WASAPI) captures remote caller audio passively without virtual drivers.",
      "Processes audio stream in-memory with zero local disk audio persistence.",
      "Hardware-accelerated VAD triggers Deepgram Nova-2 streaming WebSocket.",
    ],
    wordCount: 31,
    sources: ["Architecture_Spec.md", "Security_Overview.pdf"],
    timestamp: Date.now(),
  },
];

export const HudOverlay: React.FC = () => {
  const {
    isClickThrough,
    isProtected,
    toggleClickThrough,
    toggleScreenCaptureProtection,
    startDragging,
    minimize,
    close,
  } = useTauriWindow();

  const [status] = useState<MeetingStatus>("ready");
  const [points] = useState<TalkingPoint[]>(INITIAL_TALKING_POINTS);
  const [currentSnippet] = useState<TranscriptSnippet | null>(null);
  const [detectedQuestion] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="relative w-full h-full flex flex-col rounded-xl overflow-hidden glass-panel border border-white/10 shadow-2xl transition-all">
      {/* Top Header & Drag Handle */}
      <HeaderBar
        status={status}
        isClickThrough={isClickThrough}
        isProtected={isProtected}
        onToggleClickThrough={toggleClickThrough}
        onToggleProtection={toggleScreenCaptureProtection}
        onStartDrag={startDragging}
        onMinimize={minimize}
        onClose={close}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Live STT Transcript Sub-bar */}
      <LiveTranscript
        currentSnippet={currentSnippet}
        detectedQuestion={detectedQuestion}
      />

      {/* Ultra-Dense Bullet Points Stream */}
      <TalkingPoints points={points} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
