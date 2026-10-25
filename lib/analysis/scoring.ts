import { Finding } from "../schema";

export const SEVERITY_WEIGHTS = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
} as const;

/**
 * Pure function to calculate code quality score.
 * Starts at 100, subtracts severity deductions, floor at 0.
 */
export function calculateQualityScore(findings: Finding[]): number {
  let score = 100;

  for (const finding of findings) {
    const deduction = SEVERITY_WEIGHTS[finding.severity] ?? 0;
    score -= deduction;
  }

  return Math.max(0, score);
}
