import React from "react";
import { Mic, HelpCircle } from "lucide-react";
import type { TranscriptSnippet } from "../../types";

interface LiveTranscriptProps {
  currentSnippet: TranscriptSnippet | null;
  detectedQuestion: string | null;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  currentSnippet,
  detectedQuestion,
}) => {
  return (
    <div className="px-3 py-2 border-b border-white/5 bg-slate-950/40 text-[11px] font-mono">
      {detectedQuestion ? (
        <div className="flex items-start gap-1.5 text-amber-300 animate-fadeIn">
          <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
          <div className="leading-tight">
            <span className="font-semibold text-[10px] uppercase tracking-wider text-amber-400/80 mr-1.5">
              Detected Question:
            </span>
            <span>{detectedQuestion}</span>
          </div>
        </div>
      ) : currentSnippet ? (
        <div className="flex items-center gap-1.5 text-slate-300">
          <Mic className="w-3 h-3 shrink-0 text-sky-400 animate-pulse" />
          <span className="truncate">{currentSnippet.text}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-slate-500 italic">
          <Mic className="w-3 h-3 shrink-0 text-slate-600" />
          <span>Monitoring loopback audio for speaker prompts...</span>
        </div>
      )}
    </div>
  );
};
