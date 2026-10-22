import React from "react";
import { Mic, MicOff, HelpCircle, Sparkles, X, Pause } from "lucide-react";
import type { TranscriptSnippet, MeetingStatus, RecordingState, AiMode } from "../../types";

interface LiveTranscriptProps {
  currentSnippet: TranscriptSnippet | null;
  detectedQuestion: string | null;
  aiMode: AiMode;
  status: MeetingStatus;
  recordingState: RecordingState;
  onTriggerAnswer: () => void;
  onDismissQuestion: () => void;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  currentSnippet,
  detectedQuestion,
  aiMode,
  status,
  recordingState,
  onTriggerAnswer,
  onDismissQuestion,
}) => {
  return (
    <div className="px-3 py-2 border-b border-white/5 bg-slate-950/60 text-[11px] font-mono select-none">
      {detectedQuestion ? (
        <div className="flex items-center justify-between gap-2 text-amber-300 animate-fadeIn bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
            <div className="leading-tight truncate">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-amber-400/90 mr-1.5">
                Question:
              </span>
              <span className="text-white font-sans text-xs">{detectedQuestion}</span>
            </div>
          </div>

          {/* Action buttons depending on status and AI mode */}
          <div className="flex items-center gap-1.5 shrink-0 font-sans">
            {status === "processing" ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/30 text-sky-300 text-[10px]">
                <Sparkles className="w-2.5 h-2.5 animate-spin text-sky-400" />
                <span>Generating...</span>
              </div>
            ) : aiMode === "on-demand" ? (
              <>
                <button
                  onClick={onTriggerAnswer}
                  title="Answer this question with Gemini (consumes tokens)"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/30 hover:bg-purple-500/50 text-purple-200 border border-purple-400/40 text-[10px] font-medium transition-all shadow-sm hover:shadow-[0_0_8px_rgba(168,85,247,0.4)] cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5 text-purple-300" />
                  <span>Answer</span>
                </button>
                <button
                  onClick={onDismissQuestion}
                  title="Dismiss question without spending tokens"
                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                onClick={onDismissQuestion}
                title="Dismiss question"
                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : recordingState === "paused" ? (
        <div className="flex items-center gap-1.5 text-amber-400/90">
          <Pause className="w-3 h-3 shrink-0 text-amber-400" />
          <span className="text-[10px] font-sans">
            Audio loopback paused <span className="text-amber-300/60">• 0 tokens consumed</span>
          </span>
        </div>
      ) : recordingState === "stopped" ? (
        <div className="flex items-center gap-1.5 text-slate-400">
          <MicOff className="w-3 h-3 shrink-0 text-slate-500" />
          <span className="text-[10px] font-sans text-slate-400">
            Audio capture off <span className="text-slate-500">• Click ▶ in header to begin listening</span>
          </span>
        </div>
      ) : currentSnippet ? (
        <div className="flex items-center gap-1.5 text-slate-200">
          <Mic className="w-3 h-3 shrink-0 text-sky-400 animate-pulse" />
          <span className="truncate">{currentSnippet.text}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-slate-500 italic">
          <Mic className="w-3 h-3 shrink-0 text-slate-600" />
          <span>Monitoring loopback audio for speaker questions...</span>
        </div>
      )}
    </div>
  );
};
