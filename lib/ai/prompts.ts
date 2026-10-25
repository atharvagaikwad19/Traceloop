import { Finding } from "../schema";

export interface PromptInput {
  code: string;
  language: string;
  level: "beginner" | "intermediate" | "expert";
  staticFindings?: Finding[];
  errorContext?: string;
  allowVerification?: boolean;
}

/**
 * Format code with 1-based line numbers.
 */
export function formatCodeWithLineNumbers(code: string): string {
  return code
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(3, " ")} | ${line}`)
    .join("\n");
}

function formatEvidence(staticFindings?: Finding[]): string {
  if (!staticFindings || staticFindings.length === 0) {
    return "No static analyzer findings were detected, or static analyzers were unavailable.";
  }
  return staticFindings
    .map(
      (f) =>
        `- Line ${f.line}: [${f.severity.toUpperCase()}] ${f.title} (${f.source}). Detail: ${f.why}`
    )
    .join("\n");
}

/**
 * REVIEW MODE PROMPT
 * Sections in exact required order:
 * 1. Role + Goal
 * 2. Mode Task
 * 3. Rules
 * 4. Evidence
 * 5. Code
 * 6. Output Contract
 */
export function buildReviewPrompt(input: PromptInput): string {
  const numberedCode = formatCodeWithLineNumbers(input.code);
  const evidenceText = formatEvidence(input.staticFindings);

  return `### 1. Role + Goal
You are a careful code reviewer who explains issues to learners. Your goal is to inspect code for real flaws and provide actionable, verified recommendations.

### 2. Mode Task
Mode: REVIEW
Analyze the supplied code for demonstrable bugs, security vulnerabilities, performance bottlenecks, and style or maintainability violations. Tailor the explanation tone to a "${input.level}" developer.

### 3. Rules
- report only demonstrable issues
- use supplied line numbers
- quote the exact offending line
- do not invent vulnerabilities
- clearly state uncertainty
- return only JSON
- follow the schema exactly

### 4. Evidence
${evidenceText}

### 5. Code
Language: ${input.language}
${numberedCode}

### 6. Output Contract
Return ONLY valid JSON matching this schema with no markdown wrapping, no extra keys, and no commentary:
{
  "summary": "Brief 1-2 sentence overview of code quality and issues found.",
  "findings": [
    {
      "id": "review-1",
      "severity": "critical" | "high" | "medium" | "low",
      "category": "bug" | "security" | "performance" | "style",
      "line": <1-based number>,
      "endLine": <1-based number>,
      "snippet": "<exact line content>",
      "title": "<short descriptive title>",
      "confidence": "high" | "medium" | "low",
      "source": "llm",
      "why": "<detailed explanation of defect>",
      "trigger": "<minimal payload or input condition triggering defect>",
      "triggerVerified": false,
      "trace": [
        { "line": <number>, "state": "<state at step>", "note": "<trace note>" }
      ],
      "impact": "<concrete consequence of bug/vulnerability>",
      "fix": "<replacement code string>",
      "fixExplanation": "<why this fix resolves the issue>",
      "prevention": "<how to prevent similar bugs in future>",
      "test": "<unit test or verification code snippet>",
      "explain": {
        "beginner": "<simple analogy/explanation>",
        "intermediate": "<practical developer explanation>",
        "expert": "<deep architectural or CS explanation>"
      },
      "reference": "<CWE / standard reference or empty string>",
      "reproduced": false
    }
  ]
}`;
}

/**
 * DEBUG MODE PROMPT
 * Sections in exact required order:
 * 1. Role + Goal
 * 2. Mode Task
 * 3. Rules
 * 4. Evidence
 * 5. Code
 * 6. Output Contract
 */
export function buildDebugPrompt(input: PromptInput): string {
  const numberedCode = formatCodeWithLineNumbers(input.code);
  const evidenceText = formatEvidence(input.staticFindings);
  const errorText = input.errorContext?.trim() || "No explicit traceback provided. Analyze code for runtime exceptions.";

  return `### 1. Role + Goal
You are a careful code reviewer who explains issues to learners. Your goal is to pinpoint the exact root cause of runtime crashes and unexpected behaviors.

### 2. Mode Task
Mode: DEBUG
Analyze the supplied code against this runtime error/traceback:
"""
${errorText}
"""
Provide ranked root cause hypotheses, a clear diagnosis card, and structured findings pointing directly to the offending line(s).

### 3. Rules
- report only demonstrable issues
- use supplied line numbers
- quote the exact offending line
- do not invent vulnerabilities
- clearly state uncertainty
- return only JSON
- follow the schema exactly

### 4. Evidence
Static Analysis:
${evidenceText}
Runtime Error / Traceback:
${errorText}

### 5. Code
Language: ${input.language}
${numberedCode}

### 6. Output Contract
Return ONLY valid JSON with no markdown wrapping and no commentary:
{
  "summary": "Brief 1-2 sentence diagnosis overview.",
  "diagnosis": {
    "hypotheses": [
      {
        "title": "<hypothesis title>",
        "likelihood": "high" | "medium" | "low",
        "explanation": "<why this may cause the observed error>"
      }
    ],
    "rootCause": "<direct explanation of root cause>",
    "suggestedFix": "<plain-text summary of the fix>"
  },
  "findings": [
    {
      "id": "debug-1",
      "severity": "critical" | "high" | "medium" | "low",
      "category": "bug" | "security" | "performance" | "style",
      "line": <1-based number>,
      "endLine": <1-based number>,
      "snippet": "<exact line content>",
      "title": "<short descriptive title>",
      "confidence": "high" | "medium" | "low",
      "source": "llm",
      "why": "<detailed explanation of defect>",
      "trigger": "<minimal input that reproduces traceback>",
      "triggerVerified": false,
      "trace": [
        { "line": <number>, "state": "<state at step>", "note": "<trace note>" }
      ],
      "impact": "<impact on runtime stability>",
      "fix": "<replacement code string>",
      "fixExplanation": "<why this fix resolves the crash>",
      "prevention": "<how to guard against this error>",
      "test": "<unit test or verification code snippet>",
      "explain": {
        "beginner": "<simple explanation>",
        "intermediate": "<practical developer explanation>",
        "expert": "<deep architectural explanation>"
      },
      "reference": "<Error or CWE type>",
      "reproduced": false
    }
  ]
}`;
}

/**
 * EXPLAIN MODE PROMPT
 * Sections in exact required order:
 * 1. Role + Goal
 * 2. Mode Task
 * 3. Rules
 * 4. Evidence
 * 5. Code
 * 6. Output Contract
 */
export function buildExplainPrompt(input: PromptInput): string {
  const numberedCode = formatCodeWithLineNumbers(input.code);
  const evidenceText = formatEvidence(input.staticFindings);

  return `### 1. Role + Goal
You are a careful code reviewer who explains issues to learners. Your goal is to clearly teach the learner how this code works, its architectural flow, algorithmic complexity, and key concepts.

### 2. Mode Task
Mode: EXPLAIN
Break down the code into an educational walkthrough, identify algorithms, time and space complexity, and highlight concepts. Return an explanation object and optionally note any subtle logic traps as findings.

### 3. Rules
- report only demonstrable issues
- use supplied line numbers
- quote the exact offending line
- do not invent vulnerabilities
- clearly state uncertainty
- return only JSON
- follow the schema exactly

### 4. Evidence
${evidenceText}

### 5. Code
Language: ${input.language}
${numberedCode}

### 6. Output Contract
Return ONLY valid JSON matching this schema with no markdown wrapping:
{
  "summary": "High-level summary of what the code does.",
  "explanationDetail": {
    "overview": "<detailed overview of code purpose>",
    "walkthrough": [
      {
        "lineRange": "Lines X-Y",
        "explanation": "<step by step explanation of this block>",
        "purpose": "<short purpose tag>"
      }
    ],
    "concepts": ["<Concept 1>", "<Concept 2>"],
    "complexity": {
      "time": "<Big O time complexity with brief explanation>",
      "space": "<Big O auxiliary space complexity>"
    }
  },
  "findings": []
}`;
}
