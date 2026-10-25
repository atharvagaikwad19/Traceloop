"use client";

import React from "react";
import { Circle } from "lucide-react";

interface StatusBarProps {
  mode: string;
  language: string;
  cursorLine: number;
  cursorCol: number;
  modelName: string;
  status: string;
  isCached?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  language,
  cursorLine,
  cursorCol,
  modelName,
  status,
  isCached,
}) => {
  return (
    <footer className="h-6 bg-[#121729] border-t border-[#2a3452] px-3 flex items-center justify-between text-[11px] font-mono text-[#8f9bb8] select-none z-30">
      {/* Left: Mode & Language */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle
            className={`w-2 h-2 fill-current ${
              status === "Analyzing..."
                ? "text-[#f5b942] animate-pulse"
                : status === "Error"
                ? "text-[#ff5d73]"
                : "text-[#34d399]"
            }`}
          />
          <span className="text-[#e4e9f7] font-medium uppercase">{mode}</span>
        </div>
        <span>•</span>
        <span className="capitalize">{language}</span>
        {isCached && (
          <>
            <span>•</span>
            <span className="text-[#34d399]">[Cached]</span>
          </>
        )}
      </div>

      {/* Right: Position, Model, Status */}
      <div className="flex items-center gap-3">
        <span>
          Ln {cursorLine}, Col {cursorCol}
        </span>
        <span>•</span>
        <span className="text-[#e4e9f7]">{modelName}</span>
        <span>•</span>
        <span
          className={
            status === "Analyzing..."
              ? "text-[#f5b942]"
              : status === "Error"
              ? "text-[#ff5d73]"
              : "text-[#34d399]"
          }
        >
          {status}
        </span>
      </div>
    </footer>
  );
};
