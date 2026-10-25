"use client";

import React from "react";
import { History as HistoryIcon, RotateCcw, FileDiff, Trash2, Wrench } from "lucide-react";
import { HistoryEntry, formatRelativeTime, severityCounts } from "@/lib/history";

interface HistoryPanelProps {
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onOpenFixed: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const scoreColor = (score: number) =>
  score >= 85 ? "text-[#34d399]" : score >= 65 ? "text-[#f5b942]" : "text-[#ff5d73]";

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  onRestore,
  onOpenFixed,
  onDelete,
  onClear,
}) => {
  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#8f9bb8] gap-1.5 px-6 text-center">
        <HistoryIcon className="w-6 h-6 text-[#2a3452]" />
        <p className="text-xs">No analysis history yet.</p>
        <p className="text-[11px]">Every analysis you run is saved here so you can come back to the results and fixes.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a3452] text-[11px] text-[#8f9bb8]">
        <span>
          {entries.length} saved {entries.length === 1 ? "analysis" : "analyses"} · stored only in this browser
        </span>
        <button
          onClick={onClear}
          className="flex items-center gap-1 hover:text-[#ff5d73] transition-colors"
          title="Delete all history from this browser"
        >
          <Trash2 className="w-3 h-3" />
          Clear all
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {entries.map((entry) => {
          const counts = severityCounts(entry.findings);
          return (
            <div
              key={entry.id}
              className="bg-[#121729] border border-[#2a3452] rounded p-2 hover:border-[#7c6cff]/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-[#e4e9f7] truncate">{entry.fileName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b2238] text-[#8f9bb8] uppercase">
                    {entry.mode}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b2238] text-[#8f9bb8]">
                    {entry.deep ? "Deep" : "Quick"}
                  </span>
                  <span className="text-[10px] text-[#8f9bb8] hidden md:inline">{entry.modelUsed}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#8f9bb8]">{formatRelativeTime(entry.createdAt)}</span>
                  <span className={`text-sm font-bold ${scoreColor(entry.score)}`}>
                    {entry.score}
                    <span className="text-[10px] text-[#8f9bb8] font-normal">/100</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#ff5d73]">{counts.critical} crit</span>
                  <span className="text-[#ff9a52]">{counts.high} high</span>
                  <span className="text-[#f5b942]">{counts.medium} med</span>
                  <span className="text-[#5cc8ff]">{counts.low} low</span>
                  {entry.appliedFixes.length > 0 && (
                    <span className="flex items-center gap-1 text-[#34d399]">
                      <Wrench className="w-3 h-3" />
                      {entry.appliedFixes.length} {entry.appliedFixes.length === 1 ? "fix" : "fixes"} applied
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onRestore(entry)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-[#1b2238] hover:bg-[#2a3452] text-[#e4e9f7]"
                    title="Reopen this code with its original findings in a new tab"
                  >
                    <RotateCcw className="w-3 h-3 text-[#5cc8ff]" />
                    Restore results
                  </button>
                  {entry.fixedCode && (
                    <button
                      onClick={() => onOpenFixed(entry)}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-[#1b2238] hover:bg-[#2a3452] text-[#e4e9f7]"
                      title="Open the code as it was after your applied fixes"
                    >
                      <FileDiff className="w-3 h-3 text-[#34d399]" />
                      Open fixed code
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="p-1 text-[#8f9bb8] hover:text-[#ff5d73] rounded hover:bg-[#1b2238]"
                    title="Delete this entry"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {entry.appliedFixes.length > 0 && (
                <ul className="mt-1.5 text-[11px] text-[#8f9bb8] space-y-0.5">
                  {entry.appliedFixes.map((f, i) => (
                    <li key={i} className="truncate">
                      Applied: {f.title} (line {f.line})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
