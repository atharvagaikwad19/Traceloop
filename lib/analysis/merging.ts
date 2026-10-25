import { Finding, Confidence, Source } from "../schema";

export function determineConfidence(params: {
  reproduced?: boolean;
  isBoth?: boolean;
  triggerVerified?: boolean;
}): Confidence {
  if (params.reproduced || params.isBoth) {
    return "high";
  }
  if (params.triggerVerified) {
    return "medium";
  }
  return "low";
}

/**
 * Pure function to merge static analyzer findings and AI/LLM findings.
 * If finding lines are within 1 line of each other (Math.abs(static.line - llm.line) <= 1),
 * they are merged. Category does NOT need to match.
 *
 * Merged findings get source = "both", and confidence is recalculated:
 * HIGH if reproduced or both, MEDIUM if triggerVerified, LOW otherwise.
 */
export function mergeFindings(
  staticFindings: Finding[],
  llmFindings: Finding[]
): Finding[] {
  const merged: Finding[] = [];
  const usedStaticIds = new Set<string>();

  for (const llmFinding of llmFindings) {
    // Find closest matching static finding within 1 line
    const staticMatch = staticFindings.find(
      (sf) => !usedStaticIds.has(sf.id) && Math.abs(sf.line - llmFinding.line) <= 1
    );

    if (staticMatch) {
      usedStaticIds.add(staticMatch.id);
      const isBoth = true;
      const confidence = determineConfidence({
        reproduced: llmFinding.reproduced || staticMatch.reproduced,
        isBoth,
        triggerVerified: llmFinding.triggerVerified,
      });

      merged.push({
        ...llmFinding,
        source: "both" as Source,
        confidence,
        why: `${llmFinding.why}\n\n[Static Analyzer: ${staticMatch.title}]`,
        fix: llmFinding.fix || staticMatch.fix,
      });
    } else {
      const confidence = determineConfidence({
        reproduced: llmFinding.reproduced,
        isBoth: llmFinding.source === "both",
        triggerVerified: llmFinding.triggerVerified,
      });

      merged.push({
        ...llmFinding,
        confidence,
      });
    }
  }

  // Add any unmatched static findings
  for (const staticFinding of staticFindings) {
    if (!usedStaticIds.has(staticFinding.id)) {
      const confidence = determineConfidence({
        reproduced: staticFinding.reproduced,
        isBoth: false,
        triggerVerified: staticFinding.triggerVerified,
      });

      merged.push({
        ...staticFinding,
        confidence,
      });
    }
  }

  // Sort findings deterministically by line number, then severity
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return merged.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return severityRank[a.severity] - severityRank[b.severity];
  });
}
