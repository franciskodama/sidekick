import React, { useState, useEffect } from "react";
import { X, Key, Sliders, Volume2, Save, FileText, Sparkles, RefreshCw } from "lucide-react";
import type { AudioDevice, DocumentChunkInfo } from "../../hooks/useMeetingAssistant";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices?: AudioDevice[];
  selectedDevice?: string;
  onSelectDevice?: (id: string) => void;
  indexedDocs?: DocumentChunkInfo[];
  onRefreshDocs?: () => void;
  onReindexDocs?: () => Promise<void> | void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  devices = [],
  selectedDevice = "",
  onSelectDevice,
  indexedDocs = [],
  onRefreshDocs,
  onReindexDocs,
}) => {
  const [deepgramKey, setDeepgramKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmProvider, setLlmProvider] = useState<"gemini" | "anthropic" | "openai">("gemini");
  const [maxWords, setMaxWords] = useState(40);
  const [statusMsg, setStatusMsg] = useState("");
  const [isReindexing, setIsReindexing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      onRefreshDocs?.();
      if (typeof window !== "undefined") {
        const savedDg = localStorage.getItem("sidekick_dg_key");
        const savedGemini = localStorage.getItem("sidekick_gemini_key");
        const savedLlm = localStorage.getItem("sidekick_llm_key");
        const savedProvider = localStorage.getItem("sidekick_llm_provider") as
          | "gemini"
          | "anthropic"
          | "openai"
          | null;

        const envDg = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
        const envGemini = import.meta.env.VITE_GEMINI_API_KEY || "";

        if (savedDg) {
          setDeepgramKey(savedDg);
        } else if (envDg) {
          setDeepgramKey(envDg);
        }

        if (savedGemini) {
          setGeminiKey(savedGemini);
        } else if (envGemini) {
          setGeminiKey(envGemini);
        }

        if (savedLlm) setLlmKey(savedLlm);
        if (savedProvider) setLlmProvider(savedProvider);
      }
    }
  }, [isOpen, onRefreshDocs]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      if (deepgramKey) localStorage.setItem("sidekick_dg_key", deepgramKey);
      if (geminiKey) localStorage.setItem("sidekick_gemini_key", geminiKey);
      if (llmKey) localStorage.setItem("sidekick_llm_key", llmKey);
      localStorage.setItem("sidekick_llm_provider", llmProvider);
    }
    setStatusMsg("Settings saved!");
    setTimeout(() => {
      setStatusMsg("");
      onClose();
    }, 600);
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    setStatusMsg("Re-indexing knowledge directory...");
    try {
      if (onReindexDocs) {
        await onReindexDocs();
      } else {
        onRefreshDocs?.();
      }
      setStatusMsg("Knowledge base refreshed!");
    } catch {
      setStatusMsg("Failed to re-index documents.");
    } finally {
      setIsReindexing(false);
      setTimeout(() => setStatusMsg(""), 2000);
    }
  };

  // Group chunks by unique source path
  const uniqueDocs = Array.from(new Set(indexedDocs.map((d) => d.source_path)));

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col p-4 animate-fadeIn select-text">
      {/* Modal Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Sidekick Settings
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal Body */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4 text-xs">
        {/* Audio Device Selection */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-medium text-slate-300">
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Audio Loopback / Input Device</span>
          </label>
          <select
            value={selectedDevice}
            onChange={(e) => onSelectDevice?.(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {devices.length === 0 ? (
              <option value="">Default System Device</option>
            ) : (
              devices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} {dev.is_default ? "(Default)" : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {/* LLM Inference Provider Selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 font-medium text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Inference Engine (Fast Streaming RAG)</span>
          </label>

          <div className="grid grid-cols-3 gap-1.5">
            {/* Gemini (Primary) */}
            <button
              type="button"
              onClick={() => setLlmProvider("gemini")}
              className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                llmProvider === "gemini"
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                  : "bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="font-semibold">Gemini Flash</div>
              <div className="text-[9px] opacity-75">Sub-300ms</div>
            </button>

            {/* Claude */}
            <button
              type="button"
              onClick={() => setLlmProvider("anthropic")}
              className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                llmProvider === "anthropic"
                  ? "bg-sky-500/20 border-sky-500/50 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                  : "bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="font-semibold">Claude Haiku</div>
              <div className="text-[9px] opacity-75">3.5 Haiku</div>
            </button>

            {/* OpenAI */}
            <button
              type="button"
              onClick={() => setLlmProvider("openai")}
              className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all cursor-pointer ${
                llmProvider === "openai"
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="font-semibold">GPT-4o-mini</div>
              <div className="text-[9px] opacity-75">OpenAI</div>
            </button>
          </div>

          {/* Key Input for Selected Provider */}
          {llmProvider === "gemini" ? (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">
                Google Gemini API Key (AI Studio / Cloud):
              </label>
              <input
                type="password"
                placeholder="AQ.Ab8... (or read automatically from .env)"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400">
                {llmProvider === "anthropic" ? "Anthropic API Key (sk-ant-...)" : "OpenAI API Key (sk-proj-...)"}:
              </label>
              <input
                type="password"
                placeholder={llmProvider === "anthropic" ? "sk-ant-..." : "sk-..."}
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>
          )}
        </div>

        {/* STT Configuration */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-medium text-slate-300">
            <Key className="w-3.5 h-3.5 text-sky-400" />
            <span>Deepgram API Key (Nova-2 Speech-To-Text)</span>
          </label>
          <input
            type="password"
            placeholder="2eb6... (or read automatically from .env)"
            value={deepgramKey}
            onChange={(e) => setDeepgramKey(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Local Knowledge Base Documents */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Knowledge Base (./knowledge)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-sky-400 font-mono">
                {indexedDocs.length} chunks
              </span>
              <button
                type="button"
                onClick={handleReindex}
                disabled={isReindexing}
                title="Rescan and re-index ./knowledge folder"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[10px] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isReindexing ? "animate-spin" : ""}`} />
                <span>{isReindexing ? "Indexing..." : "Re-index"}</span>
              </button>
            </div>
          </div>

          <div className="p-2 rounded bg-slate-900/60 border border-white/5 space-y-1.5 max-h-36 overflow-y-auto">
            {uniqueDocs.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic">
                Scanning ./knowledge directory for documents...
              </p>
            ) : (
              uniqueDocs.map((doc, idx) => {
                const ext = doc.split(".").pop()?.toUpperCase() || "DOC";
                const count = indexedDocs.filter((d) => d.source_path === doc).length;
                return (
                  <div key={idx} className="flex items-center justify-between gap-1.5 text-[11px] text-slate-300">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="truncate">{doc}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 font-mono text-[9px]">
                      <span className="px-1 py-0.2 bg-white/10 text-slate-300 rounded">{ext}</span>
                      {count > 1 && (
                        <span className="text-slate-400">({count} chunks)</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dense Bullets Limit */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-medium">Max Word Count Per Talking Point</span>
            <span className="text-sky-400 font-mono">{maxWords} words</span>
          </div>
          <input
            type="range"
            min="20"
            max="60"
            step="5"
            value={maxWords}
            onChange={(e) => setMaxWords(Number(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>
      </div>

      {/* Modal Footer */}
      <div className="pt-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-[11px] text-emerald-400 font-medium">
          {statusMsg}
        </span>
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  );
};
