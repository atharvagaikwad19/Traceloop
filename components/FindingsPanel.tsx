"use client";

import React, { useState } from "react";
import { hasApplicableFix } from "@/lib/analysis/patching";
import {
  Finding,
  Severity,
  Category,
  DebugDiagnosis,
  ExplainDetail,
} from "@/lib/schema";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  GitCompare,
  Wrench,
  Shield,
  Zap,
  HelpCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface FindingsPanelProps {
  mode: "review" | "debug" | "explain";
  score: number | null;
  findings: Finding[];
  diagnosis?: DebugDiagnosis;
  explanationDetail?: ExplainDetail;
  level: "beginner" | "intermediate" | "expert";
  onLevelChange: (lvl: "beginner" | "intermediate" | "expert") => void;
  isLoading: boolean;
  isEmpty: boolean;
  error?: string;
  onRetry: () => void;
  isOutOfDate: boolean;
  isLlmOnly: boolean;
  isQuickMode: boolean;
  onSelectLine: (line: number) => void;
  onViewFix: (finding: Finding) => void;
  onApplyFix: (finding: Finding) => void;
  canApplyFix: boolean;
}

export const FindingsPanel: React.FC<FindingsPanelProps> = ({
  mode,
  score,
  findings,
  diagnosis,
  explanationDetail,
  level,
  onLevelChange,
  isLoading,
  isEmpty,
  error,
  onRetry,
  isOutOfDate,
  isLlmOnly,
  isQuickMode,
  onSelectLine,
  onViewFix,
  onApplyFix,
  canApplyFix,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyFix = (finding: Finding) => {
    navigator.clipboard.writeText(finding.fix);
    setCopiedId(finding.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Severity counts
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  // Filtered findings
  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
    return true;
  });

  // Grouped by severity
  const groupedBySeverity: Record<Severity, Finding[]> = {
    critical: filteredFindings.filter((f) => f.severity === "critical"),
    high: filteredFindings.filter((f) => f.severity === "high"),
    medium: filteredFindings.filter((f) => f.severity === "medium"),
    low: filteredFindings.filter((f) => f.severity === "low"),
  };

  const getSeverityBadgeClass = (sev: Severity) => {
    switch (sev) {
      case "critical":
        return "bg-[#ff5d73]/15 text-[#ff5d73] border-[#ff5d73]/30";
      case "high":
        return "bg-[#ff9a52]/15 text-[#ff9a52] border-[#ff9a52]/30";
      case "medium":
        return "bg-[#f5b942]/15 text-[#f5b942] border-[#f5b942]/30";
      case "low":
        return "bg-[#5cc8ff]/15 text-[#5cc8ff] border-[#5cc8ff]/30";
    }
  };

  const getSeverityIcon = (sev: Severity) => {
    switch (sev) {
      case "critical":
        return <AlertOctagon className="w-3.5 h-3.5 text-[#ff5d73] shrink-0" />;
      case "high":
        return <AlertTriangle className="w-3.5 h-3.5 text-[#ff9a52] shrink-0" />;
      case "medium":
        return <AlertTriangle className="w-3.5 h-3.5 text-[#f5b942] shrink-0" />;
      case "low":
        return <Info className="w-3.5 h-3.5 text-[#5cc8ff] shrink-0" />;
    }
  };

  const hasResult = score !== null;

  const getScoreColor = (sc: number | null) => {
    if (sc === null) return "text-[#8f9bb8]";
    if (sc >= 85) return "text-[#34d399]";
    if (sc >= 65) return "text-[#f5b942]";
    return "text-[#ff5d73]";
  };

  return (
    <div className="w-[420px] bg-[#121729] border-l border-[#2a3452] flex flex-col h-full overflow-hidden select-none">
      {/* Top Header */}
      <div className="p-3 border-b border-[#2a3452] space-y-2.5 bg-[#121729]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#e4e9f7] font-mono">
              {mode} MODE
            </span>
            {isLlmOnly && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b2238] border border-[#2a3452] text-[#8f9bb8]">
                LLM only
              </span>
            )}
            {isQuickMode && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1b2238] border border-[#2a3452] text-[#8f9bb8]">
                Not verified
              </span>
            )}
          </div>

          {/* Quality Score */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#8f9bb8]">Score:</span>
            <span
              className={`text-sm font-bold font-mono ${getScoreColor(
                score
              )}`}
            >
              {score ?? "–"}
              {hasResult && <span className="text-[10px] text-[#8f9bb8] font-normal">/100</span>}
            </span>
          </div>
        </div>

        {/* Severity Count Badges */}
        <div className="grid grid-cols-4 gap-1.5 font-mono text-center">
          <div className="bg-[#0b0e1a] border border-[#ff5d73]/30 rounded py-1 px-1">
            <div className="text-[10px] text-[#8f9bb8]">CRIT</div>
            <div className="text-xs font-bold text-[#ff5d73]">{hasResult ? counts.critical : "–"}</div>
          </div>
          <div className="bg-[#0b0e1a] border border-[#ff9a52]/30 rounded py-1 px-1">
            <div className="text-[10px] text-[#8f9bb8]">HIGH</div>
            <div className="text-xs font-bold text-[#ff9a52]">{hasResult ? counts.high : "–"}</div>
          </div>
          <div className="bg-[#0b0e1a] border border-[#f5b942]/30 rounded py-1 px-1">
            <div className="text-[10px] text-[#8f9bb8]">MED</div>
            <div className="text-xs font-bold text-[#f5b942]">{hasResult ? counts.medium : "–"}</div>
          </div>
          <div className="bg-[#0b0e1a] border border-[#5cc8ff]/30 rounded py-1 px-1">
            <div className="text-[10px] text-[#8f9bb8]">LOW</div>
            <div className="text-xs font-bold text-[#5cc8ff]">{hasResult ? counts.low : "–"}</div>
          </div>
        </div>

        {/* Filters and Level Selectors */}
        <div className="flex items-center justify-between gap-1.5 pt-1 text-xs">
          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-[#0b0e1a] border border-[#2a3452] rounded px-1.5 py-0.5 text-[11px] text-[#e4e9f7] focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0b0e1a] border border-[#2a3452] rounded px-1.5 py-0.5 text-[11px] text-[#e4e9f7] focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="bug">Bug</option>
            <option value="security">Security</option>
            <option value="performance">Performance</option>
            <option value="style">Style</option>
          </select>

          {/* Level selector */}
          <select
            value={level}
            onChange={(e) =>
              onLevelChange(e.target.value as "beginner" | "intermediate" | "expert")
            }
            className="bg-[#0b0e1a] border border-[#2a3452] rounded px-1.5 py-0.5 text-[11px] text-[#e4e9f7] focus:outline-none font-mono"
            title="Adjust explanation complexity"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="expert">Expert</option>
          </select>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans select-text">
        {/* Out of Date Warning */}
        {isOutOfDate && (
          <div className="p-2.5 rounded bg-[#f5b942]/10 border border-[#f5b942]/40 text-xs text-[#f5b942] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Results out of date. Re-analyze before applying fixes.</span>
            </span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 rounded bg-[#ff5d73]/10 border border-[#ff5d73]/40 text-xs text-[#ff5d73] space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4" />
              <span>Analysis Failed</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#e4e9f7]">{error}</p>
            <button
              onClick={onRetry}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1b2238] hover:bg-[#2a3452] text-white text-[11px] font-mono"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-[#0b0e1a] border border-[#2a3452] rounded p-3 animate-pulse space-y-2"
              >
                <div className="h-3.5 bg-[#1b2238] rounded w-3/4" />
                <div className="h-2.5 bg-[#1b2238] rounded w-1/2" />
                <div className="h-2 bg-[#1b2238] rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && isEmpty && !error && (
          <div className="text-center py-16 text-[#8f9bb8] space-y-2">
            <HelpCircle className="w-8 h-8 mx-auto text-[#2a3452]" />
            <p className="text-xs">Paste code and press <kbd className="px-1 py-0.5 bg-[#1b2238] border border-[#2a3452] rounded font-mono text-[#e4e9f7]">Ctrl+Enter</kbd></p>
            <p className="text-[11px] text-[#8f9bb8]">or click &quot;Load Sample&quot; to explore</p>
          </div>
        )}

        {/* No Findings State */}
        {!isLoading && !isEmpty && !error && findings.length === 0 && (
          <div className="text-center py-12 p-4 bg-[#0b0e1a] border border-[#2a3452] rounded text-xs space-y-2">
            <CheckCircle className="w-8 h-8 mx-auto text-[#34d399]" />
            <div className="font-semibold text-[#e4e9f7]">No issues found</div>
            <p className="text-[11px] text-[#8f9bb8]">
              This is not a correctness guarantee. Continue testing edge cases and verifying inputs.
            </p>
          </div>
        )}

        {/* Debug Diagnosis Card */}
        {mode === "debug" && diagnosis && (
          <div className="bg-[#0b0e1a] border border-[#ff9a52]/40 rounded p-3 space-y-2 text-xs">
            <div className="font-semibold text-[#ff9a52] flex items-center gap-1.5 font-mono">
              <Zap className="w-3.5 h-3.5" />
              <span>DIAGNOSIS CARD</span>
            </div>
            <div>
              <div className="text-[11px] text-[#8f9bb8] font-mono">Root Cause:</div>
              <p className="text-[#e4e9f7] mt-0.5">{diagnosis.rootCause}</p>
            </div>
            {diagnosis.hypotheses.length > 0 && (
              <div>
                <div className="text-[11px] text-[#8f9bb8] font-mono mb-1">
                  Ranked Hypotheses:
                </div>
                <div className="space-y-1.5">
                  {diagnosis.hypotheses.map((h, i) => (
                    <div
                      key={i}
                      className="p-1.5 rounded bg-[#121729] border border-[#2a3452] text-[11px]"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-medium text-[#e4e9f7]">{h.title}</span>
                        <span
                          className={`text-[10px] px-1 rounded ${
                            h.likelihood === "high"
                              ? "text-[#ff5d73] bg-[#ff5d73]/10"
                              : "text-[#f5b942] bg-[#f5b942]/10"
                          }`}
                        >
                          {h.likelihood}
                        </span>
                      </div>
                      <p className="text-[#8f9bb8] mt-0.5">{h.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-[11px] text-[#8f9bb8] font-mono">Suggested Fix:</div>
              <p className="text-[#34d399] mt-0.5">{diagnosis.suggestedFix}</p>
            </div>
          </div>
        )}

        {/* Explain Mode Detail Card */}
        {mode === "explain" && explanationDetail && (
          <div className="bg-[#0b0e1a] border border-[#7c6cff]/40 rounded p-3 space-y-2.5 text-xs">
            <div className="font-semibold text-[#5cc8ff] flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>CODE EXPLANATION</span>
            </div>
            <div>
              <div className="text-[11px] text-[#8f9bb8] font-mono">Overview:</div>
              <p className="text-[#e4e9f7] mt-0.5">{explanationDetail.overview}</p>
            </div>
            {/* Complexity */}
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-[#121729] border border-[#2a3452] p-1.5 rounded">
                <span className="text-[#8f9bb8] block">Time Complexity:</span>
                <span className="text-[#5cc8ff] font-medium">{explanationDetail.complexity.time}</span>
              </div>
              <div className="bg-[#121729] border border-[#2a3452] p-1.5 rounded">
                <span className="text-[#8f9bb8] block">Space Complexity:</span>
                <span className="text-[#5cc8ff] font-medium">{explanationDetail.complexity.space}</span>
              </div>
            </div>
            {/* Walkthrough */}
            <div>
              <div className="text-[11px] text-[#8f9bb8] font-mono mb-1">Walkthrough:</div>
              <div className="space-y-1.5">
                {explanationDetail.walkthrough.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-[#121729] border border-[#2a3452] text-[11px]"
                  >
                    <div className="flex items-center justify-between font-mono text-[#5cc8ff]">
                      <span>{w.lineRange}</span>
                      <span className="text-[10px] text-[#8f9bb8]">{w.purpose}</span>
                    </div>
                    <p className="text-[#e4e9f7] mt-0.5">{w.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Key Concepts */}
            {explanationDetail.concepts.length > 0 && (
              <div>
                <div className="text-[11px] text-[#8f9bb8] font-mono mb-1">Key Concepts:</div>
                <div className="flex flex-wrap gap-1">
                  {explanationDetail.concepts.map((c, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded bg-[#1b2238] border border-[#2a3452] text-[10px] text-[#e4e9f7]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grouped Findings by Severity */}
        {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
          const group = groupedBySeverity[sev];
          if (!group || group.length === 0) return null;

          return (
            <div key={sev} className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-mono uppercase font-semibold text-[#8f9bb8] pt-1">
                {getSeverityIcon(sev)}
                <span>
                  {sev} ({group.length})
                </span>
              </div>

              {group.map((finding) => {
                const isExpanded = expandedIds.has(finding.id);

                return (
                  <div
                    key={finding.id}
                    className="bg-[#0b0e1a] border border-[#2a3452] hover:border-[#3d4a6f] rounded transition-colors"
                  >
                    {/* Collapsed Header */}
                    <div
                      onClick={() => {
                        toggleExpand(finding.id);
                        onSelectLine(finding.line);
                      }}
                      className="p-2.5 cursor-pointer flex items-start justify-between gap-2 select-none"
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <button className="mt-0.5 text-[#8f9bb8] hover:text-[#e4e9f7]">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#e4e9f7] leading-snug truncate">
                            {finding.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-[#8f9bb8]">
                            <span
                              className={`px-1 py-0.2 rounded border text-[10px] uppercase ${getSeverityBadgeClass(
                                finding.severity
                              )}`}
                            >
                              {finding.category}
                            </span>
                            <span>Line {finding.line}</span>
                            <span>•</span>
                            <span
                              className={
                                finding.confidence === "high"
                                  ? "text-[#34d399]"
                                  : "text-[#f5b942]"
                              }
                            >
                              {finding.confidence} conf
                            </span>
                            {finding.reproduced && (
                              <span className="text-[10px] px-1 rounded bg-[#34d399]/15 text-[#34d399]">
                                verified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-[#1b2238] space-y-2.5 text-xs text-[#e4e9f7]">
                        {/* Explanation by Level */}
                        <div>
                          <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider">
                            Explanation ({level}):
                          </div>
                          <p className="mt-0.5 leading-relaxed text-[#e4e9f7]">
                            {finding.explain[level] || finding.why}
                          </p>
                        </div>

                        {/* Why / Impact */}
                        <div>
                          <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider">
                            Impact:
                          </div>
                          <p className="mt-0.5 text-[#ff5d73]/90 leading-relaxed">
                            {finding.impact}
                          </p>
                        </div>

                        {/* Trigger / Reproduce */}
                        {finding.trigger && (
                          <div>
                            <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider flex items-center justify-between">
                              <span>Minimal Trigger:</span>
                              {finding.triggerVerified && (
                                <span className="text-[#34d399] text-[10px]">
                                  [Trigger Verified]
                                </span>
                              )}
                            </div>
                            <pre className="mt-0.5 p-1.5 rounded bg-[#121729] border border-[#2a3452] font-mono text-[11px] overflow-x-auto text-[#5cc8ff]">
                              {finding.trigger}
                            </pre>
                          </div>
                        )}

                        {/* Trace */}
                        {finding.trace && finding.trace.length > 0 && (
                          <div>
                            <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider mb-1">
                              Execution Trace:
                            </div>
                            <div className="space-y-1">
                              {finding.trace.map((step, sIdx) => (
                                <div
                                  key={sIdx}
                                  className="text-[11px] font-mono bg-[#121729] p-1 rounded border border-[#1b2238] flex items-center justify-between"
                                >
                                  <span className="text-[#5cc8ff]">Line {step.line}: {step.state}</span>
                                  <span className="text-[#8f9bb8] text-[10px]">{step.note}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Fix Snippet */}
                        {finding.fix && (
                          <div>
                            <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider">
                              Suggested Fix:
                            </div>
                            <pre className="mt-0.5 p-1.5 rounded bg-[#121729] border border-[#2a3452] font-mono text-[11px] overflow-x-auto text-[#34d399]">
                              {finding.fix}
                            </pre>
                            {finding.fixExplanation && (
                              <p className="text-[11px] text-[#8f9bb8] mt-1">
                                {finding.fixExplanation}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Prevention */}
                        {finding.prevention && (
                          <div>
                            <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider">
                              Prevention:
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#8f9bb8]">
                              {finding.prevention}
                            </p>
                          </div>
                        )}

                        {/* Unit Test */}
                        {finding.test && (
                          <div>
                            <div className="text-[10px] text-[#8f9bb8] uppercase font-mono tracking-wider">
                              Regression Test:
                            </div>
                            <pre className="mt-0.5 p-1.5 rounded bg-[#121729] border border-[#2a3452] font-mono text-[11px] overflow-x-auto text-[#f5b942]">
                              {finding.test}
                            </pre>
                          </div>
                        )}

                        {/* Action Buttons: View Fix, Copy Fix, Apply Fix */}
                        <div className="flex items-center gap-1.5 pt-2 border-t border-[#1b2238]">
                          <button
                            onClick={() => onViewFix(finding)}
                            disabled={!hasApplicableFix(finding.fix)}
                            className="disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 px-2.5 py-1 text-[11px] rounded bg-[#1b2238] hover:bg-[#2a3452] text-[#e4e9f7] font-mono transition-colors"
                            title="Preview diff in bottom panel"
                          >
                            <GitCompare className="w-3 h-3 text-[#5cc8ff]" />
                            <span>View Fix</span>
                          </button>

                          <button
                            onClick={() => handleCopyFix(finding)}
                            disabled={!hasApplicableFix(finding.fix)}
                            className="disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 px-2.5 py-1 text-[11px] rounded bg-[#1b2238] hover:bg-[#2a3452] text-[#e4e9f7] font-mono transition-colors"
                          >
                            {copiedId === finding.id ? (
                              <Check className="w-3 h-3 text-[#34d399]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedId === finding.id ? "Copied" : "Copy Fix"}</span>
                          </button>

                          <button
                            onClick={() => onApplyFix(finding)}
                            disabled={!canApplyFix || !hasApplicableFix(finding.fix)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded bg-[#0d9488] hover:bg-[#14b8a6] disabled:opacity-30 disabled:hover:bg-[#0d9488] disabled:cursor-not-allowed text-white font-mono transition-colors"
                            title={
                              !hasApplicableFix(finding.fix)
                                ? "No automatic fix is available for this finding"
                                : canApplyFix
                                ? "Apply patch directly to the editor"
                                : "Code changed since analysis. Re-analyze before applying this fix."
                            }
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Apply Fix</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
