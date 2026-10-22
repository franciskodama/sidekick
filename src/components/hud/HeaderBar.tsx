import React from "react";
import {
  GripHorizontal,
  Eye,
  EyeOff,
  Shield,
  ShieldAlert,
  Minus,
  X,
  Settings,
  Play,
  Pause,
  Square,
  Sparkles,
  Bot,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { MeetingStatus, RecordingState, AiMode } from "../../types";

interface HeaderBarProps {
  status: MeetingStatus;
  recordingState: RecordingState;
  aiMode: AiMode;
  audioPeak?: number;
  isClickThrough: boolean;
  isProtected: boolean;
  onStartCapture: () => void;
  onPauseCapture: () => void;
  onResumeCapture: () => void;
  onStopCapture: () => void;
  onToggleAiMode: () => void;
  onToggleClickThrough: () => void;
  onToggleProtection: () => void;
  onStartDrag: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  status,
  recordingState,
  aiMode,
  audioPeak = 0,
  isClickThrough,
  isProtected,
  onStartCapture,
  onPauseCapture,
  onResumeCapture,
  onStopCapture,
  onToggleAiMode,
  onToggleClickThrough,
  onToggleProtection,
  onStartDrag,
  onMinimize,
  onClose,
  onOpenSettings,
}) => {
  const getStatusBadge = () => {
    if (status === "processing") {
      return {
        label: "Gemini",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
        dot: "bg-amber-400 animate-ping",
      };
    }

    switch (recordingState) {
      case "recording":
        return {
          label: "Listening",
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
          dot: "bg-emerald-400 animate-pulse",
        };
      case "paused":
        return {
          label: "Paused",
          color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
          dot: "bg-amber-400",
        };
      default:
        return {
          label: "Standby",
          color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
          dot: "bg-slate-400",
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <header
      className="flex items-center justify-between px-3 py-2 border-b border-white/10 select-none cursor-move"
      onMouseDown={onStartDrag}
    >
      {/* Drag handle, branding, status badge & AI Mode */}
      <div className="flex items-center gap-2">
        <GripHorizontal className="w-3.5 h-3.5 text-slate-400 hover:text-white transition-colors" />
        <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]">
          Sidekick
        </span>

        {/* State Badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border",
            badge.color
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot)} />
          <span>{badge.label}</span>
        </div>

        {/* Audio Activity Meter (Visible when active) */}
        {recordingState === "recording" && (
          <div className="flex items-center gap-0.5 h-3.5 px-1 bg-black/40 rounded border border-white/5">
            <div
              className="w-1 bg-sky-400 rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(20, Math.min(100, audioPeak * 100))}%`,
                opacity: audioPeak > 0.05 ? 1 : 0.4,
              }}
            />
            <div
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(15, Math.min(100, audioPeak * 80))}%`,
                opacity: audioPeak > 0.1 ? 1 : 0.3,
              }}
            />
          </div>
        )}

        {/* AI Mode Toggle (Auto vs On-Demand) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleAiMode();
          }}
          title={
            aiMode === "on-demand"
              ? "On-Demand Mode: Gemini only triggers when requested (Saves tokens). Click to switch to Auto."
              : "Auto Mode: Answers all detected questions automatically. Click to switch to On-Demand."
          }
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border transition-colors cursor-pointer",
            aiMode === "on-demand"
              ? "bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
              : "bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
          )}
        >
          {aiMode === "on-demand" ? (
            <>
              <Bot className="w-2.5 h-2.5 text-purple-400" />
              <span>On-Demand</span>
            </>
          ) : (
            <>
              <Sparkles className="w-2.5 h-2.5 text-sky-400" />
              <span>Auto AI</span>
            </>
          )}
        </button>
      </div>

      {/* Control buttons */}
      <div
        className="flex items-center gap-1 cursor-default"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Recording Controls: Start / Pause / Resume / Stop */}
        {recordingState === "stopped" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartCapture();
            }}
            title="Start Audio Loopback (Begin Listening)"
            className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-emerald-400/40" />
          </button>
        )}

        {recordingState === "recording" && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPauseCapture();
              }}
              title="Pause Audio Loopback (0 tokens burned)"
              className="p-1 rounded-md text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5 fill-amber-400/40" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStopCapture();
              }}
              title="Stop Audio Capture"
              className="p-1 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3 fill-rose-400/40" />
            </button>
          </div>
        )}

        {recordingState === "paused" && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResumeCapture();
              }}
              title="Resume Audio Loopback (Instant 0ms restart)"
              className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-emerald-400/40 animate-pulse" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStopCapture();
              }}
              title="Stop Audio Capture"
              className="p-1 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Square className="w-3 h-3 fill-rose-400/40" />
            </button>
          </div>
        )}

        {/* Screen capture protection indicator */}
        <button
          onClick={onToggleProtection}
          title={
            isProtected
              ? "Screen Protection Active (Hidden from Zoom/Meet/Teams)"
              : "Screen Protection Disabled"
          }
          className={cn(
            "p-1 rounded-md transition-colors",
            isProtected
              ? "text-emerald-400 hover:bg-emerald-500/20"
              : "text-amber-400 hover:bg-amber-500/20"
          )}
        >
          {isProtected ? (
            <Shield className="w-3.5 h-3.5" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Click-through toggle */}
        <button
          onClick={onToggleClickThrough}
          title={
            isClickThrough
              ? "Click-Through Enabled (Ghost Mode)"
              : "Interactive Mode"
          }
          className={cn(
            "p-1 rounded-md transition-colors",
            isClickThrough
              ? "text-sky-400 hover:bg-sky-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
        >
          {isClickThrough ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Settings & Knowledge Base"
          className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Minimize */}
        <button
          onClick={onMinimize}
          title="Minimize HUD"
          className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          title="Quit Sidekick"
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded-md transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
