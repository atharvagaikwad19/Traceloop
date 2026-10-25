/**
 * Analysis history, kept in the browser's localStorage only. Nothing here is
 * sent to the server. All array helpers are pure so they can be unit tested.
 */
import type { Finding, DebugDiagnosis, ExplainDetail } from "./schema";
import type { AnalysisMode, ExplainLevel } from "./files";

export interface AppliedFix {
  title: string;
  line: number;
  at: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  fileName: string;
  language: string;
  mode: AnalysisMode;
  level: ExplainLevel;
  deep: boolean;
  /** The code that was analysed (so markers still match the findings). */
  code: string;
  score: number;
  findings: Finding[];
  diagnosis?: DebugDiagnosis;
  explanationDetail?: ExplainDetail;
  modelUsed: string;
  appliedFixes: AppliedFix[];
  /** Code after the most recent applied fix. */
  fixedCode?: string;
}

export const HISTORY_KEY = "traceloop.history.v1";
export const MAX_HISTORY = 30;

export function addHistoryEntry(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  max: number = MAX_HISTORY
): HistoryEntry[] {
  return [entry, ...entries.filter((e) => e.id !== entry.id)].slice(0, max);
}

export function recordAppliedFix(
  entries: HistoryEntry[],
  id: string | undefined,
  fix: AppliedFix,
  fixedCode: string
): HistoryEntry[] {
  if (!id) return entries;
  return entries.map((e) =>
    e.id === id
      ? { ...e, appliedFixes: [...e.appliedFixes, fix], fixedCode }
      : e
  );
}

export function removeHistoryEntry(entries: HistoryEntry[], id: string): HistoryEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function severityCounts(findings: Finding[]) {
  return findings.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        e && typeof e.id === "string" && typeof e.code === "string" && Array.isArray(e.findings)
    );
  } catch {
    return [];
  }
}

/** Save, dropping the oldest entries if the browser storage quota is hit. */
export function saveHistory(entries: HistoryEntry[]): HistoryEntry[] {
  if (typeof window === "undefined") return entries;
  let toSave = entries;
  while (true) {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
      return toSave;
    } catch {
      if (toSave.length <= 1) return toSave;
      toSave = toSave.slice(0, toSave.length - 1);
    }
  }
}

export function clearStoredHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
