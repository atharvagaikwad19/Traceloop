import { describe, it, expect } from "vitest";
import { calculateQualityScore, SEVERITY_WEIGHTS } from "../lib/analysis/scoring";
import { mergeFindings, determineConfidence } from "../lib/analysis/merging";
import { applyFixToCode, isCodeStale } from "../lib/analysis/patching";
import { computeCacheKey } from "../lib/analysis/cache";
import { AnalyzeRequestSchema, Finding } from "../lib/schema";

describe("Quality Score Calculation", () => {
  it("should return 100 for zero findings", () => {
    expect(calculateQualityScore([])).toBe(100);
  });

  it("should subtract weighted penalties correctly", () => {
    const mockFindings: Partial<Finding>[] = [
      { severity: "critical" }, // -25
      { severity: "high" },     // -15
      { severity: "medium" },   // -8
      { severity: "low" },      // -3
    ];
    // 100 - 25 - 15 - 8 - 3 = 49
    expect(calculateQualityScore(mockFindings as Finding[])).toBe(49);
  });

  it("should enforce a minimum floor of 0", () => {
    const criticals: Partial<Finding>[] = [
      { severity: "critical" },
      { severity: "critical" },
      { severity: "critical" },
      { severity: "critical" },
      { severity: "critical" }, // 5 * 25 = 125 deduction
    ];
    expect(calculateQualityScore(criticals as Finding[])).toBe(0);
  });
});

describe("Confidence Assignment", () => {
  it("should assign HIGH confidence when reproduced or found by both", () => {
    expect(determineConfidence({ reproduced: true })).toBe("high");
    expect(determineConfidence({ isBoth: true })).toBe("high");
    expect(determineConfidence({ reproduced: true, isBoth: true })).toBe("high");
  });

  it("should assign MEDIUM confidence when triggerVerified is true without reproduction", () => {
    expect(determineConfidence({ triggerVerified: true })).toBe("medium");
  });

  it("should assign LOW confidence otherwise", () => {
    expect(determineConfidence({})).toBe("low");
    expect(determineConfidence({ triggerVerified: false, reproduced: false })).toBe("low");
  });
});

describe("Finding Merge Pure Function", () => {
  const baseFinding: Finding = {
    id: "f-1",
    severity: "critical",
    category: "security",
    line: 10,
    endLine: 10,
    snippet: "raw_sql",
    title: "SQL Injection",
    confidence: "low",
    source: "llm",
    why: "Unescaped SQL query",
    trigger: "' OR 1=1",
    triggerVerified: false,
    trace: [],
    impact: "Data compromise",
    fix: "db.execute(sql, [id])",
    fixExplanation: "Use params",
    prevention: "Use ORM",
    test: "test()",
    explain: { beginner: "b", intermediate: "i", expert: "e" },
    reference: "CWE-89",
    reproduced: false,
  };

  it("should merge static and LLM findings within 1 line", () => {
    const staticFinding: Finding = {
      ...baseFinding,
      id: "stat-1",
      line: 11, // within 1 line of 10
      source: "static",
      title: "Bandit SQL Injection Warning",
    };

    const merged = mergeFindings([staticFinding], [baseFinding]);

    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe("both");
    expect(merged[0].confidence).toBe("high");
    expect(merged[0].why).toContain("[Static Analyzer: Bandit SQL Injection Warning]");
  });

  it("should not merge findings separated by more than 1 line", () => {
    const staticFinding: Finding = {
      ...baseFinding,
      id: "stat-far",
      line: 20, // separated by 10 lines
      source: "static",
      title: "Hardcoded secret",
    };

    const merged = mergeFindings([staticFinding], [baseFinding]);

    expect(merged.length).toBe(2);
    expect(merged.map((f) => f.id)).toContain("stat-far");
    expect(merged.map((f) => f.id)).toContain("f-1");
  });
});

describe("Line Relocation & Patch Helpers", () => {
  const original = "line1\nline2\nline3\nline4";

  it("should apply single-line fix accurately", () => {
    const result = applyFixToCode(original, 2, 2, "line2_fixed");
    expect(result.success).toBe(true);
    expect(result.newCode).toBe("line1\nline2_fixed\nline3\nline4");
    expect(result.lineCountChanged).toBe(false);
    expect(result.linesDelta).toBe(0);
  });

  it("should apply multi-line replacement and calculate lineCountChanged", () => {
    const result = applyFixToCode(original, 2, 2, "line2_a\nline2_b\nline2_c");
    expect(result.success).toBe(true);
    expect(result.lineCountChanged).toBe(true);
    expect(result.linesDelta).toBe(2); // grew by 2 lines
    expect(result.newCode.split("\n").length).toBe(6);
  });

  it("should reject out-of-bounds line targets", () => {
    const result = applyFixToCode(original, 99, 99, "invalid");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should identify stale code status correctly", () => {
    expect(isCodeStale("print(1)", "print(1)")).toBe(false);
    expect(isCodeStale("print(1)", "print(2)")).toBe(true);
  });
});

describe("Cache Key Calculation", () => {
  it("should generate deterministic sha256 hash including all parameters", () => {
    const key1 = computeCacheKey({
      code: "def test(): pass",
      language: "python",
      mode: "review",
      level: "intermediate",
      deep: false,
      errorContext: "",
    });

    const key2 = computeCacheKey({
      code: "def test(): pass",
      language: "python",
      mode: "review",
      level: "intermediate",
      deep: false,
      errorContext: "",
    });

    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // sha256 hex length
  });

  it("should generate different hashes when any parameter differs", () => {
    const keyReview = computeCacheKey({
      code: "def test(): pass",
      language: "python",
      mode: "review",
      level: "intermediate",
      deep: false,
    });

    const keyDebug = computeCacheKey({
      code: "def test(): pass",
      language: "python",
      mode: "debug",
      level: "intermediate",
      deep: false,
    });

    expect(keyReview).not.toBe(keyDebug);
  });
});

describe("Input Validation Schema", () => {
  it("should accept valid input payloads", () => {
    const result = AnalyzeRequestSchema.safeParse({
      code: "console.log('test');",
      language: "javascript",
      mode: "review",
      level: "intermediate",
      deep: false,
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty code strings", () => {
    const result = AnalyzeRequestSchema.safeParse({
      code: "",
      language: "javascript",
    });
    expect(result.success).toBe(false);
  });

  it("should reject unsupported languages", () => {
    const result = AnalyzeRequestSchema.safeParse({
      code: "x = 1",
      language: "unsupported_lang",
    });
    expect(result.success).toBe(false);
  });
});
