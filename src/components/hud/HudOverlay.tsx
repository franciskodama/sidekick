import React, { useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { LiveTranscript } from "./LiveTranscript";
import { TalkingPoints } from "./TalkingPoints";
import { SettingsModal } from "../settings/SettingsModal";
import { useTauriWindow } from "../../hooks/useTauriWindow";
import { useMeetingAssistant } from "../../hooks/useMeetingAssistant";

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

  const {
    isCapturing,
    status,
    audioLevel,
    currentSnippet,
    detectedQuestion,
    talkingPoints,
    toggleCapture,
    devices,
    selectedDevice,
    setSelectedDevice,
  } = useMeetingAssistant();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="relative w-full h-full flex flex-col rounded-xl overflow-hidden glass-panel border border-white/10 shadow-2xl transition-all">
      {/* Top Header & Drag Handle */}
      <HeaderBar
        status={status}
        isCapturing={isCapturing}
        audioPeak={audioLevel.peak}
        isClickThrough={isClickThrough}
        isProtected={isProtected}
        onToggleCapture={toggleCapture}
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
      <TalkingPoints points={talkingPoints} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        devices={devices}
        selectedDevice={selectedDevice}
        onSelectDevice={setSelectedDevice}
      />
    </div>
  );
};
