import crypto from "crypto";
import { AnalysisResponse, Finding } from "../schema";

export interface CacheKeyParams {
  code: string;
  language: string;
  mode: string;
  level: string;
  deep: boolean;
  allowVerification?: boolean;
  errorContext?: string;
}

export function computeCacheKey(params: CacheKeyParams): string {
  const normalized = {
    code: params.code.trim(),
    language: params.language.toLowerCase().trim(),
    mode: params.mode.toLowerCase().trim(),
    level: params.level.toLowerCase().trim(),
    deep: Boolean(params.deep),
    allowVerification: Boolean(params.allowVerification),
    errorContext: (params.errorContext || "").trim(),
  };

  const payload = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

class AnalysisCache {
  private cache = new Map<string, { response: AnalysisResponse; timestamp: number }>();
  private readonly maxEntries = 100;
  private readonly ttlMs = 1000 * 60 * 60 * 24; // 24 hours

  constructor() {
    this.seedBundledSample();
  }

  public get(key: string): AnalysisResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return {
      ...entry.response,
      meta: {
        ...entry.response.meta,
        fromCache: true,
      },
    };
  }

  public set(key: string, response: AnalysisResponse): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  public clear(): void {
    this.cache.clear();
    this.seedBundledSample();
  }

  private seedBundledSample(): void {
    // Seed sample results so bundled sample always loads instant analysis without quota
    const sampleKeys = [
      computeCacheKey({
        code: SAMPLE_PYTHON_CODE,
        language: "python",
        mode: "review",
        level: "intermediate",
        deep: false,
        errorContext: "",
      }),
      computeCacheKey({
        code: SAMPLE_PYTHON_CODE,
        language: "python",
        mode: "debug",
        level: "intermediate",
        deep: false,
        errorContext: "TypeError: unsupported operand type(s) for /: 'int' and 'NoneType'",
      }),
      computeCacheKey({
        code: SAMPLE_PYTHON_CODE,
        language: "python",
        mode: "explain",
        level: "intermediate",
        deep: false,
        errorContext: "",
      }),
    ];

    for (const key of sampleKeys) {
      this.cache.set(key, {
        response: BUNDLED_SAMPLE_RESPONSE,
        timestamp: Date.now(),
      });
    }
  }
}

export const SAMPLE_PYTHON_CODE = `import os
import sqlite3

def get_user_data(user_id, raw_query):
    # Security vulnerability: SQL Injection
    conn = sqlite3.connect("database.db")
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}' AND active = 1")
    user = cursor.fetchone()

    # Bug: Division by None / Unhandled ZeroDivisionError
    total_score = user.get("score") if user else None
    count = raw_query.get("count", 0)
    avg_score = total_score / count

    # Hardcoded credential / command injection risk
    api_key = "sk_live_948194819481_secret_demo"
    os.system(f"echo Sending report for user {user_id}")

    return {
        "user": user,
        "average": avg_score,
        "key": api_key
    }
`;

export const BUNDLED_SAMPLE_FINDINGS: Finding[] = [
  {
    id: "finding-sqli-1",
    severity: "critical",
    category: "security",
    line: 8,
    endLine: 8,
    snippet: `    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}' AND active = 1")`,
    title: "SQL Injection Vulnerability via f-string formatting",
    confidence: "high",
    source: "both",
    why: "Direct interpolation of user_id using f-strings allows attackers to alter query logic and extract or modify database contents.",
    trigger: "get_user_data(\"' OR '1'='1\", {})",
    triggerVerified: true,
    trace: [
      { line: 4, state: "user_id enters function", note: "Untrusted input received" },
      { line: 8, state: "SQL string formatted", note: "Payload concatenated without escaping" },
      { line: 8, state: "cursor.execute called", note: "Engine executes arbitrary query instructions" },
    ],
    impact: "Full database compromise, unauthorized data extraction, and potential privilege escalation.",
    fix: `    cursor.execute("SELECT * FROM users WHERE id = ? AND active = 1", (user_id,))`,
    fixExplanation: "Use parameterized queries with placeholder '?' so SQLite treats input strictly as data rather than SQL commands.",
    prevention: "Always use parameterized queries or an ORM. Never format SQL queries with f-strings or string concatenation.",
    test: "def test_sqli():\n    # Should safely fail or return None, not dump table\n    res = get_user_data(\"' OR '1'='1\", {'count': 1})",
    explain: {
      beginner: "Putting raw text directly into a database search allows malicious input to trick the database into giving away secrets.",
      intermediate: "F-string formatting bypasses SQL sanitization. Parameter binding sends the query structure and data separately.",
      expert: "CWE-89: Improper Neutralization of Special Elements used in an SQL Command. Exploitable via standard union-based SQL injection.",
    },
    reference: "CWE-89",
    reproduced: true,
  },
  {
    id: "finding-div-2",
    severity: "high",
    category: "bug",
    line: 14,
    endLine: 14,
    snippet: `    avg_score = total_score / count`,
    title: "Unhandled TypeError and ZeroDivisionError in calculation",
    confidence: "high",
    source: "llm",
    why: "If total_score is None (when user is None or score missing) or count is 0, this line raises TypeError or ZeroDivisionError causing an unhandled crash.",
    trigger: "get_user_data('unknown_user', {'count': 0})",
    triggerVerified: true,
    trace: [
      { line: 12, state: "total_score is None", note: "User not found or key missing" },
      { line: 13, state: "count default is 0", note: "Denominator evaluates to 0" },
      { line: 14, state: "division invoked", note: "Raises TypeError or ZeroDivisionError immediately" },
    ],
    impact: "Process crash or 500 internal server error whenever a user does not exist or has zero count.",
    fix: `    if not user or not total_score or count <= 0:\n        avg_score = 0.0\n    else:\n        avg_score = total_score / count`,
    fixExplanation: "Check if user and total_score exist and verify count > 0 before performing division.",
    prevention: "Guard mathematical divisions against zero denominators and ensure nullable variables are validated before arithmetic operations.",
    test: "def test_division_safety():\n    res = get_user_data('missing_id', {'count': 0})\n    assert res['average'] == 0.0",
    explain: {
      beginner: "Dividing by zero or dividing something that doesn't exist crashes your computer program.",
      intermediate: "Python raises ZeroDivisionError when dividing by 0 and TypeError when operating on None. A guard clause prevents both.",
      expert: "Unvalidated numeric division violates exception safety invariants, leading to unhandled runtime aborts under edge input conditions.",
    },
    reference: "CWE-369",
    reproduced: true,
  },
  {
    id: "finding-secret-3",
    severity: "critical",
    category: "security",
    line: 17,
    endLine: 17,
    snippet: `    api_key = "sk_live_948194819481_secret_demo"`,
    title: "Hardcoded Private API Key Credential",
    confidence: "high",
    source: "both",
    why: "Hardcoded API secret token in source control is exposed to anyone with code repository access and cannot be rotated without code deployment.",
    trigger: "Static code inspection finds high-entropy credential literal",
    triggerVerified: true,
    trace: [
      { line: 17, state: "Secret assigned directly", note: "Plaintext credential stored in source" },
    ],
    impact: "Credential leakage, unauthorized API access, quota theft, and impersonation.",
    fix: `    api_key = os.environ.get("DEMO_API_KEY", "")`,
    fixExplanation: "Read sensitive credentials from environment variables or a secure secret manager.",
    prevention: "Use secret scanning tools, .env files with .gitignore, and cloud secret managers.",
    test: "def test_env_credentials():\n    os.environ['DEMO_API_KEY'] = 'test-key'\n    # verify key fetched from env",
    explain: {
      beginner: "Never write passwords or secret keys directly inside your code files.",
      intermediate: "Credentials checked into git repositories persist in commit history. Use environment variables instead.",
      expert: "CWE-798: Use of Hard-coded Credentials. Violates 12-Factor App config separation principles.",
    },
    reference: "CWE-798",
    reproduced: true,
  },
  {
    id: "finding-cmd-4",
    severity: "high",
    category: "security",
    line: 18,
    endLine: 18,
    snippet: `    os.system(f"echo Sending report for user {user_id}")`,
    title: "Command Injection via os.system and unescaped input",
    confidence: "high",
    source: "both",
    why: "Passing formatted strings to os.system invokes the system shell, enabling shell meta-characters (;, &&, |) to execute arbitrary commands.",
    trigger: "get_user_data('123; rm -rf /', {})",
    triggerVerified: true,
    trace: [
      { line: 4, state: "user_id passed in", note: "Contains shell metacharacters" },
      { line: 18, state: "os.system executes shell command", note: "Subshell parses arguments and runs injected commands" },
    ],
    impact: "Remote Code Execution (RCE) on the host operating system with privileges of the running application.",
    fix: `    import logging\n    logging.info("Sending report for user %s", user_id)`,
    fixExplanation: "Replace os.system shell calls with Python's built-in logging module.",
    prevention: "Never execute system shell commands just to log or print information. If subprocesses are required, use subprocess.run with shell=False and argv lists.",
    test: "def test_command_injection():\n    # Ensure shell is not invoked\n    res = get_user_data('123; echo injected', {'count': 1})",
    explain: {
      beginner: "Using system commands with user input lets someone run dangerous computer commands on your machine.",
      intermediate: "os.system spawns a shell process that evaluates metacharacters. Logging should use Python logging libraries.",
      expert: "CWE-78: Improper Neutralization of Special Elements used in an OS Command (OS Command Injection).",
    },
    reference: "CWE-78",
    reproduced: true,
  },
];

export const BUNDLED_SAMPLE_RESPONSE: AnalysisResponse = {
  summary: "Identified 4 issues: 2 Critical security vulnerabilities (SQL Injection, Hardcoded Credential), 1 High security vulnerability (Command Injection), and 1 High runtime bug (ZeroDivision / TypeError).",
  score: 100 - (25 * 2) - (15 * 2), // 100 - 50 - 30 = 20
  findings: BUNDLED_SAMPLE_FINDINGS,
  meta: {
    mode: "review",
    level: "intermediate",
    modelUsed: "bundled sample",
    durationMs: 420,
    toolsRan: ["ruff", "bandit", "ast-validator"],
    deep: false,
    fromCache: false,
  },
  diagnosis: {
    hypotheses: [
      {
        title: "ZeroDivisionError / TypeError on empty or missing user",
        likelihood: "high",
        explanation: "user.get('score') returns None if user record is missing, triggering TypeError when dividing.",
      },
      {
        title: "Malicious input altering SQL statement structure",
        likelihood: "high",
        explanation: "Unsanitized user_id triggers database errors or unintended full-table retrieval.",
      },
    ],
    rootCause: "Unchecked arithmetic on nullable values and direct string interpolation into database and system shell calls.",
    suggestedFix: "Use parameterized queries, guard statements for numeric operations, and Python logging instead of shell commands.",
  },
  explanationDetail: {
    overview: "This Python function attempts to fetch a user profile from a SQLite database, compute an average score, and log a report command.",
    walkthrough: [
      {
        lineRange: "Lines 6-10",
        explanation: "Connects to SQLite database and executes a raw SQL query formatted with user input.",
        purpose: "Database retrieval",
      },
      {
        lineRange: "Lines 12-14",
        explanation: "Extracts score and attempts to compute average score without checking if denominator is zero or score is None.",
        purpose: "Metric computation",
      },
      {
        lineRange: "Lines 16-18",
        explanation: "Defines hardcoded API token and invokes host OS shell to print an informational message.",
        purpose: "Reporting / Notification",
      },
    ],
    concepts: ["SQL Parameterization", "Exception Guarding", "12-Factor Secret Management", "Shell Injection Prevention"],
    complexity: {
      time: "O(1) database lookup index dependent",
      space: "O(1) memory allocation",
    },
  },
};

export const globalAnalysisCache = new AnalysisCache();
