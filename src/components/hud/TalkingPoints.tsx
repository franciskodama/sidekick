import React, { useState } from "react";
import { Check, Copy, FileText, Sparkles } from "lucide-react";
import type { TalkingPoint } from "../../types";

interface TalkingPointsProps {
  points: TalkingPoint[];
  activeStreamingPoint?: TalkingPoint | null;
}

export const TalkingPoints: React.FC<TalkingPointsProps> = ({
  points,
  activeStreamingPoint,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) {
      console.error("Failed to copy talking point:", err);
    }
  };

  const allPoints = activeStreamingPoint
    ? [activeStreamingPoint, ...points.filter((p) => p.id !== activeStreamingPoint.id)]
    : points;

  if (allPoints.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
        <Sparkles className="w-8 h-8 mb-2 text-slate-600 opacity-60" />
        <p className="text-xs font-medium text-slate-400">HUD Ready</p>
        <p className="text-[11px] max-w-[240px] mt-1 text-slate-500">
          When meeting attendees ask questions, relevant knowledge will be retrieved and summarized into ultra-dense talking points here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {allPoints.map((point) => {
        const fullContent = point.bullets.join("\n");
        const isStreaming = activeStreamingPoint?.id === point.id;

        return (
          <article
            key={point.id}
            className={`p-3 rounded-lg border border-white/10 bg-slate-900/80 shadow-md backdrop-blur-sm transition-all ${
              isStreaming ? "ring-1 ring-sky-400/40 animate-pulse" : ""
            }`}
          >
            {/* Question title & actions */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold text-sky-300 leading-snug flex-1">
                {point.question}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-mono">
                  {point.wordCount}w
                </span>
                <button
                  onClick={() => handleCopy(point.id, fullContent)}
                  title="Copy bullet points"
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {copiedId === point.id ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Ultra-dense bullets */}
            <ul className="space-y-1.5 text-xs text-slate-200">
              {point.bullets.map((bullet, idx) => (
                <li key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(56,189,248,0.8)]" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>

            {/* Source citations */}
            {point.sources && point.sources.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/5 flex flex-wrap items-center gap-1.5">
                <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                {point.sources.map((src, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 hover:text-slate-300 transition-colors truncate max-w-[150px]"
                  >
                    {src}
                  </span>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
