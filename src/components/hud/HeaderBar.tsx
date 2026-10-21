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
  Mic,
  MicOff,
} from "lucide-react";
import { cn } from "../../utils/cn";
import type { MeetingStatus } from "../../types";

interface HeaderBarProps {
  status: MeetingStatus;
  isCapturing: boolean;
  audioPeak?: number;
  isClickThrough: boolean;
  isProtected: boolean;
  onToggleCapture: () => void;
  onToggleClickThrough: () => void;
  onToggleProtection: () => void;
  onStartDrag: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  status,
  isCapturing,
  audioPeak = 0,
  isClickThrough,
  isProtected,
  onToggleCapture,
  onToggleClickThrough,
  onToggleProtection,
  onStartDrag,
  onMinimize,
  onClose,
  onOpenSettings,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case "listening":
        return {
          label: isCapturing ? "Capturing" : "Listening",
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
          dot: "bg-emerald-400 animate-pulse",
        };
      case "processing":
        return {
          label: "Generating",
          color: "text-amber-400 bg-amber-500/10 border-amber-500/30",
          dot: "bg-amber-400 animate-ping",
        };
      case "ready":
        return {
          label: "Ready",
          color: "text-sky-400 bg-sky-500/10 border-sky-500/30",
          dot: "bg-sky-400",
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
      {/* Drag handle & branding */}
      <div className="flex items-center gap-2">
        <GripHorizontal className="w-3.5 h-3.5 text-slate-400 hover:text-white transition-colors" />
        <span className="text-xs font-semibold tracking-wider uppercase text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)]">
          Sidekick
        </span>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border",
            badge.color
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", badge.dot)} />
          <span>{badge.label}</span>
        </div>

        {/* Audio Activity Meter */}
        {isCapturing && (
          <div className="flex items-center gap-0.5 ml-1 h-3.5 px-1 bg-black/40 rounded border border-white/5">
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
      </div>

      {/* Control buttons */}
      <div
        className="flex items-center gap-1 cursor-default"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Audio Capture Toggle */}
        <button
          onClick={onToggleCapture}
          title={isCapturing ? "Stop Audio Capture" : "Start Audio Capture"}
          className={cn(
            "p-1 rounded-md transition-colors relative",
            isCapturing
              ? "text-rose-400 bg-rose-500/20 hover:bg-rose-500/30"
              : "text-slate-400 hover:text-white hover:bg-white/10"
          )}
        >
          {isCapturing ? (
            <Mic className="w-3.5 h-3.5 animate-pulse" />
          ) : (
            <MicOff className="w-3.5 h-3.5" />
          )}
        </button>
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
