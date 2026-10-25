"use client";

import React from "react";
import { CheckCircle2, Bug, BookOpen } from "lucide-react";

export type Mode = "review" | "debug" | "explain";

interface ActivityRailProps {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const MODES: Array<{ id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "review", label: "Review", icon: CheckCircle2 },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "explain", label: "Explain", icon: BookOpen },
];

export const ActivityRail: React.FC<ActivityRailProps> = ({
  activeMode,
  onModeChange,
}) => {
  return (
    <aside className="w-12 bg-[#121729] border-r border-[#2a3452] flex flex-col items-center py-2 select-none z-10">
      <div className="flex flex-col gap-1 w-full">
        {MODES.map((mode) => {
          const isActive = activeMode === mode.id;
          const Icon = mode.icon;

          return (
            <button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              title={`${mode.label} Mode`}
              className={`relative flex flex-col items-center justify-center py-3 text-xs w-full transition-colors ${
                isActive
                  ? "text-[#e4e9f7] bg-[#0b0e1a]/50"
                  : "text-[#8f9bb8] hover:text-[#e4e9f7] hover:bg-[#1b2238]/40"
              }`}
            >
              {/* 2px accent bar beside active mode */}
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#7c6cff]" />
              )}
              <Icon className={`w-5 h-5 ${isActive ? "text-[#7c6cff]" : ""}`} />
              <span className="text-[10px] mt-1 font-mono tracking-tight">{mode.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
