import React, { useState, useEffect } from "react";
import { X, Key, Sliders, Volume2, Save } from "lucide-react";
import type { AudioDevice } from "../../hooks/useMeetingAssistant";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices?: AudioDevice[];
  selectedDevice?: string;
  onSelectDevice?: (id: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  devices = [],
  selectedDevice = "",
  onSelectDevice,
}) => {
  const [deepgramKey, setDeepgramKey] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmProvider, setLlmProvider] = useState<"anthropic" | "openai">("anthropic");
  const [maxWords, setMaxWords] = useState(40);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDg = localStorage.getItem("sidekick_dg_key");
      const savedLlm = localStorage.getItem("sidekick_llm_key");
      const savedProvider = localStorage.getItem("sidekick_llm_provider") as
        | "anthropic"
        | "openai"
        | null;
      if (savedDg) setDeepgramKey(savedDg);
      if (savedLlm) setLlmKey(savedLlm);
      if (savedProvider) setLlmProvider(savedProvider);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (typeof window !== "undefined") {
      if (deepgramKey) localStorage.setItem("sidekick_dg_key", deepgramKey);
      if (llmKey) localStorage.setItem("sidekick_llm_key", llmKey);
      localStorage.setItem("sidekick_llm_provider", llmProvider);
    }
    setStatusMsg("Settings saved!");
    setTimeout(() => {
      setStatusMsg("");
      onClose();
    }, 600);
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col p-4 animate-fadeIn select-text">
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
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
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

        {/* STT Configuration */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-medium text-slate-300">
            <Key className="w-3.5 h-3.5 text-sky-400" />
            <span>Deepgram API Key (Nova-2 STT)</span>
          </label>
          <input
            type="password"
            placeholder="dg_live_..."
            value={deepgramKey}
            onChange={(e) => setDeepgramKey(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* LLM Configuration */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-medium text-slate-300">
            <Key className="w-3.5 h-3.5 text-sky-400" />
            <span>Inference API Key</span>
          </label>
          <div className="flex gap-2 mb-1.5">
            <button
              type="button"
              onClick={() => setLlmProvider("anthropic")}
              className={`flex-1 py-1 rounded text-[11px] font-medium border ${
                llmProvider === "anthropic"
                  ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                  : "bg-slate-900 border-white/10 text-slate-400"
              }`}
            >
              Claude 3.5 Haiku
            </button>
            <button
              type="button"
              onClick={() => setLlmProvider("openai")}
              className={`flex-1 py-1 rounded text-[11px] font-medium border ${
                llmProvider === "openai"
                  ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                  : "bg-slate-900 border-white/10 text-slate-400"
              }`}
            >
              GPT-4o-mini
            </button>
          </div>
          <input
            type="password"
            placeholder={
              llmProvider === "anthropic" ? "sk-ant-..." : "sk-proj-..."
            }
            value={llmKey}
            onChange={(e) => setLlmKey(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-white/10 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Dense Bullets Limit */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-medium">Max Word Count Per Point</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Changes</span>
        </button>
      </div>
    </div>
  );
};
