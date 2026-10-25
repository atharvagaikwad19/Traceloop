"use client";

import React, { useState, useRef, useEffect } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  Terminal,
  GitCompare,
  AlertCircle,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  Check,
  History as HistoryIcon,
} from "lucide-react";
import { HistoryPanel } from "@/components/HistoryPanel";
import { HistoryEntry } from "@/lib/history";
import { TRACELOOP_THEME, defineTraceLoopTheme } from "@/lib/monacoTheme";

export type BottomTab = "output" | "diff" | "error" | "history";

interface BottomPanelProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  logs: string[];
  onClearLogs: () => void;
  originalCode: string;
  diffCode: string;
  language: string;
  errorContext: string;
  onErrorContextChange: (err: string) => void;
  mode: "review" | "debug" | "explain";
  onApplyDiffFix?: () => void;
  canApplyFix?: boolean;
  history: HistoryEntry[];
  onRestoreHistory: (entry: HistoryEntry) => void;
  onOpenFixedHistory: (entry: HistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  activeTab,
  onTabChange,
  logs,
  onClearLogs,
  originalCode,
  diffCode,
  language,
  errorContext,
  onErrorContextChange,
  mode,
  onApplyDiffFix,
  canApplyFix,
  history,
  onRestoreHistory,
  onOpenFixedHistory,
  onDeleteHistory,
  onClearHistory,
}) => {
  const [panelHeight, setPanelHeight] = useState<number>(180);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(180);

  // Resize handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = panelHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - ev.clientY;
      const newHeight = Math.min(Math.max(startHeightRef.current + deltaY, 90), 650);
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleCopyDiff = () => {
    if (!diffCode) return;
    navigator.clipboard.writeText(diffCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayHeight = isMaximized ? "calc(100vh - 120px)" : `${panelHeight}px`;

  return (
    <div
      style={{ height: displayHeight }}
      className="bg-[#121729] border-t border-[#2a3452] flex flex-col z-20 transition-all duration-75 relative select-none"
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1.5 w-full bg-[#121729] hover:bg-[#7c6cff] cursor-row-resize flex items-center justify-center transition-colors"
        title="Drag to resize panel"
      >
        <div className="w-8 h-0.5 bg-[#2a3452] rounded-full" />
      </div>

      {/* Panel Tab Header */}
      <div className="h-8 bg-[#121729] border-b border-[#2a3452] flex items-center justify-between px-2 select-none">
        <div className="flex items-center gap-1">
          {/* Output Tab */}
          <button
            onClick={() => onTabChange("output")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-t transition-colors ${
              activeTab === "output"
                ? "bg-[#0b0e1a] text-[#e4e9f7] border-t-2 border-[#7c6cff]"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-[#5cc8ff]" />
            <span>Output</span>
            {logs.length > 0 && (
              <span className="text-[10px] px-1 bg-[#1b2238] rounded-full text-[#8f9bb8]">
                {logs.length}
              </span>
            )}
          </button>

          {/* Fix Diff Tab */}
          <button
            onClick={() => onTabChange("diff")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-t transition-colors ${
              activeTab === "diff"
                ? "bg-[#0b0e1a] text-[#e4e9f7] border-t-2 border-[#7c6cff]"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5 text-[#34d399]" />
            <span>Fix Diff</span>
            {diffCode && diffCode !== originalCode && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
            )}
          </button>

          {/* Error Input Tab (highlighted in Debug mode) */}
          <button
            onClick={() => onTabChange("error")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-t transition-colors ${
              activeTab === "error"
                ? "bg-[#0b0e1a] text-[#e4e9f7] border-t-2 border-[#7c6cff]"
                : mode === "debug"
                ? "text-[#ff9a52] hover:text-[#ff9a52]/80"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Error Input</span>
            {mode === "debug" && (
              <span className="text-[10px] px-1 bg-[#ff9a52]/20 text-[#ff9a52] rounded">
                Debug
              </span>
            )}
          </button>

          {/* History Tab */}
          <button
            onClick={() => onTabChange("history")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-t transition-colors ${
              activeTab === "history"
                ? "bg-[#0b0e1a] text-[#e4e9f7] border-t-2 border-[#7c6cff]"
                : "text-[#8f9bb8] hover:text-[#e4e9f7]"
            }`}
          >
            <HistoryIcon className="w-3.5 h-3.5 text-[#5cc8ff]" />
            <span>History</span>
            {history.length > 0 && (
              <span className="text-[10px] px-1 bg-[#1b2238] rounded-full text-[#8f9bb8]">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* Panel Controls (Maximize, Clear) */}
        <div className="flex items-center gap-2">
          {activeTab === "output" && logs.length > 0 && (
            <button
              onClick={onClearLogs}
              title="Clear output logs"
              className="p-1 text-[#8f9bb8] hover:text-[#e4e9f7] hover:bg-[#1b2238] rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {activeTab === "diff" && diffCode && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={handleCopyDiff}
                className="flex items-center gap-1 text-[11px] text-[#8f9bb8] hover:text-[#e4e9f7] px-2 py-0.5 rounded bg-[#1b2238] border border-[#2a3452]"
              >
                {copied ? <Check className="w-3 h-3 text-[#34d399]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy Fix"}</span>
              </button>
              {onApplyDiffFix && (
                <button
                  onClick={onApplyDiffFix}
                  disabled={!canApplyFix}
                  className="flex items-center gap-1 text-[11px] text-white bg-[#0d9488] hover:bg-[#14b8a6] disabled:opacity-40 px-2 py-0.5 rounded"
                  title={canApplyFix ? "Apply this fix to editor" : "Results out of date. Re-analyze to apply"}
                >
                  Apply Fix
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "Restore size" : "Maximize panel"}
            className="p-1 text-[#8f9bb8] hover:text-[#e4e9f7] hover:bg-[#1b2238] rounded"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 bg-[#0b0e1a] overflow-hidden select-text font-mono text-xs">
        {/* Output Log Tab */}
        {activeTab === "output" && (
          <div className="h-full overflow-y-auto p-3 space-y-1">
            {logs.length === 0 ? (
              <p className="text-[#8f9bb8] italic text-xs">
                Pipeline messages and tool logs will appear here during analysis.
              </p>
            ) : (
              logs.map((entry, idx) => {
                const tab = entry.indexOf("\t");
                const time = tab >= 0 ? entry.slice(0, tab) : "";
                const log = tab >= 0 ? entry.slice(tab + 1) : entry;
                return (
                <div key={idx} className="leading-relaxed flex items-start gap-2">
                  <span className="text-[#8f9bb8] shrink-0 select-none">
                    [{time}]
                  </span>
                  <span
                    className={
                      log.startsWith("[Error]")
                        ? "text-[#ff5d73]"
                        : log.startsWith("[Verified]")
                        ? "text-[#34d399]"
                        : log.startsWith("[AI]")
                        ? "text-[#5cc8ff]"
                        : log.startsWith("[Static]")
                        ? "text-[#f5b942]"
                        : "text-[#e4e9f7]"
                    }
                  >
                    {log}
                  </span>
                </div>
                );
              })
            )}
          </div>
        )}

        {/* Fix Diff Tab */}
        {activeTab === "diff" && (
          <div className="h-full w-full">
            {diffCode ? (
              <DiffEditor
                height="100%"
                original={originalCode}
                modified={diffCode}
                language={language}
                theme={TRACELOOP_THEME}
                beforeMount={defineTraceLoopTheme}
                options={{
                  fontSize: 12,
                  fontFamily: "JetBrains Mono, monospace",
                  readOnly: true,
                  renderSideBySide: true,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[#8f9bb8] italic">
                Select &quot;View Fix&quot; on any finding to preview the code diff here.
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <HistoryPanel
            entries={history}
            onRestore={onRestoreHistory}
            onOpenFixed={onOpenFixedHistory}
            onDelete={onDeleteHistory}
            onClear={onClearHistory}
          />
        )}

        {/* Error Input Tab */}
        {activeTab === "error" && (
          <div className="h-full p-2 flex flex-col">
            <div className="text-[11px] text-[#8f9bb8] mb-1">
              Paste runtime error message, exception, or traceback to diagnose in Debug mode:
            </div>
            <textarea
              value={errorContext}
              onChange={(e) => onErrorContextChange(e.target.value)}
              placeholder="e.g. TypeError: unsupported operand type(s) for /: 'int' and 'NoneType'&#10;  File 'main.py', line 14, in get_user_data"
              className="flex-1 w-full bg-[#121729] border border-[#2a3452] rounded p-2 text-xs text-[#e4e9f7] focus:outline-none focus:border-[#7c6cff] resize-none font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
};
