"use client";

import React from "react";
import { APP_CONFIG } from "@/lib/config";
import { LANGUAGES } from "@/lib/files";
import { Logo } from "@/components/Logo";
import { Play, Loader2, ShieldCheck, Zap } from "lucide-react";

interface TopToolbarProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  deep: boolean;
  onDeepChange: (deep: boolean) => void;
  allowVerification: boolean;
  onAllowVerificationChange: (allow: boolean) => void;
  onAnalyze: () => void;
  isLoading: boolean;
}


export const TopToolbar: React.FC<TopToolbarProps> = ({
  language,
  onLanguageChange,
  deep,
  onDeepChange,
  allowVerification,
  onAllowVerificationChange,
  onAnalyze,
  isLoading,
}) => {
  return (
    <header className="h-11 bg-[#121729] border-b border-[#2a3452] px-3 flex items-center justify-between select-none">
      {/* Left: Brand */}
      <div className="flex items-center gap-2">
        <Logo />
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#1b2238] border border-[#2a3452] text-[#8f9bb8] font-mono">
          v{APP_CONFIG.version}
        </span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Language selector */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-[#8f9bb8]">Language:</label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="bg-[#0b0e1a] border border-[#2a3452] rounded px-2 py-1 text-xs text-[#e4e9f7] focus:outline-none focus:border-[#7c6cff] font-mono"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quick / Deep toggle */}
        <div className="flex items-center bg-[#0b0e1a] border border-[#2a3452] rounded p-0.5 text-xs">
          <button
            onClick={() => onDeepChange(false)}
            className={`px-2.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
              !deep
                ? "bg-[#1b2238] text-[#e4e9f7] font-medium"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
            title="Quick static and AI review without verification execution"
          >
            <Zap className="w-3 h-3 text-[#5cc8ff]" />
            Quick
          </button>
          <button
            onClick={() => onDeepChange(true)}
            className={`px-2.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
              deep
                ? "bg-[#1b2238] text-[#e4e9f7] font-medium"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
            title="Deep review with optional sandbox reproduction"
          >
            <ShieldCheck className="w-3 h-3 text-[#7c6cff]" />
            Deep
          </button>
        </div>

        {/* Deep Verification Checkbox */}
        {deep && (
          <label className="flex items-center gap-1.5 text-xs text-[#8f9bb8] cursor-pointer hover:text-[#e4e9f7] select-none bg-[#0b0e1a] border border-[#2a3452] px-2 py-1 rounded">
            <input
              type="checkbox"
              checked={allowVerification}
              onChange={(e) => onAllowVerificationChange(e.target.checked)}
              className="rounded bg-[#121729] border-[#2a3452] text-[#7c6cff] focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-[#7c6cff]"
            />
            <span className="text-[11px]">Allow running code to verify findings</span>
          </label>
        )}

        {/* Analyze Button */}
        <button
          onClick={onAnalyze}
          disabled={isLoading}
          className="flex items-center gap-1.5 bg-[#0d9488] hover:bg-[#14b8a6] disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
          title="Shortcut: Ctrl+Enter (or Cmd+Enter)"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>Analyze</span>
          <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded bg-[rgba(0,0,0,0.25)] text-[10px] text-white/80 font-mono">
            Ctrl+↵
          </kbd>
        </button>
      </div>
    </header>
  );
};
