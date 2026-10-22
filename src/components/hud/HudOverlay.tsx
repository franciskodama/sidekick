import React, { useState } from "react";
import { HeaderBar } from "./HeaderBar";
import { LiveTranscript } from "./LiveTranscript";
import { TalkingPoints } from "./TalkingPoints";
import { SettingsModal } from "../settings/SettingsModal";
import { useTauriWindow } from "../../hooks/useTauriWindow";
import { useMeetingAssistant } from "../../hooks/useMeetingAssistant";
import { Sparkles, HelpCircle } from "lucide-react";

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
    recordingState,
    status,
    aiMode,
    audioLevel,
    currentSnippet,
    detectedQuestion,
    talkingPoints,
    activeStreamingPoint,
    devices,
    selectedDevice,
    setSelectedDevice,
    indexedDocs,
    startCapture,
    pauseCapture,
    resumeCapture,
    stopCapture,
    toggleAiMode,
    dismissQuestion,
    triggerAnswer,
    refreshDocuments,
    reindexDocuments,
    askQuestion,
  } = useMeetingAssistant();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Dynamic sample prompts based on current indexed knowledge documents
  const sampleQuestions = React.useMemo(() => {
    const questions: string[] = [];
    const docNames = indexedDocs.map((d) => d.source_path.toLowerCase());

    if (docNames.some((n) => n.includes("tell_me_about_yourself") || n.includes("yourself"))) {
      questions.push("Can you tell me about yourself and your background?");
    }
    if (docNames.some((n) => n.includes("jobs to be done") || n.includes("ulwick"))) {
      questions.push("How do you apply the Jobs to be Done (JTBD) framework?");
    }
    if (docNames.some((n) => n.includes("inspired") || n.includes("cagan"))) {
      questions.push("What is your approach to product discovery and team leadership?");
    }
    if (docNames.some((n) => n.includes("build trap") || n.includes("perri"))) {
      questions.push("How do you ensure teams escape the Build Trap?");
    }

    // Default fallback questions if no specific match
    if (questions.length === 0) {
      questions.push(
        "Can you tell me about yourself and your background?",
        "What is your approach to product discovery and leadership?",
        "How do you prioritize features and align cross-functional teams?"
      );
    }

    return questions.slice(0, 3);
  }, [indexedDocs]);

  return (
    <div className="relative w-full h-full flex flex-col rounded-xl overflow-hidden glass-panel border border-white/10 shadow-2xl transition-all">
      {/* Top Header & Drag Handle */}
      <HeaderBar
        status={status}
        recordingState={recordingState}
        aiMode={aiMode}
        audioPeak={audioLevel.peak}
        isClickThrough={isClickThrough}
        isProtected={isProtected}
        onStartCapture={startCapture}
        onPauseCapture={pauseCapture}
        onResumeCapture={resumeCapture}
        onStopCapture={stopCapture}
        onToggleAiMode={toggleAiMode}
        onToggleClickThrough={toggleClickThrough}
        onToggleProtection={toggleScreenCaptureProtection}
        onStartDrag={startDragging}
        onMinimize={minimize}
        onClose={close}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Live STT Transcript Sub-bar with On-Demand Controls */}
      <LiveTranscript
        currentSnippet={currentSnippet}
        detectedQuestion={detectedQuestion}
        aiMode={aiMode}
        status={status}
        recordingState={recordingState}
        onTriggerAnswer={triggerAnswer}
        onDismissQuestion={dismissQuestion}
      />

      {/* Ultra-Dense Bullet Points Stream */}
      <TalkingPoints
        points={talkingPoints}
        activeStreamingPoint={activeStreamingPoint}
      />

      {/* Quick Test Prompt Pills Bar */}
      {talkingPoints.length === 0 && !activeStreamingPoint && (
        <div className="p-2 border-t border-white/5 bg-slate-950/40 text-[10px]">
          <div className="flex items-center gap-1 text-slate-400 mb-1.5 font-medium">
            <Sparkles className="w-3 h-3 text-sky-400" />
            <span>Test Knowledge Retrieval with Gemini:</span>
          </div>
          <div className="flex flex-col gap-1">
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => askQuestion(q)}
                className="text-left px-2 py-1 rounded bg-white/5 hover:bg-sky-500/20 hover:text-sky-300 text-slate-300 border border-white/5 transition-colors flex items-center gap-1.5 truncate cursor-pointer"
              >
                <HelpCircle className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                <span className="truncate">{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        devices={devices}
        selectedDevice={selectedDevice}
        onSelectDevice={setSelectedDevice}
        indexedDocs={indexedDocs}
        onRefreshDocs={refreshDocuments}
        onReindexDocs={reindexDocuments}
      />
    </div>
  );
};
