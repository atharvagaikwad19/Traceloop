import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { Finding, Severity } from "../schema";

const execFileAsync = promisify(execFile);

export interface StaticAnalysisResult {
  findings: Finding[];
  toolsRan: string[];
  isLlmOnly: boolean;
  logs: string[];
}

/**
 * Run available static analyzers safely.
 * Never executes submitted code.
 * Fails gracefully if tools are missing.
 */
export async function runStaticAnalysis(
  code: string,
  language: string
): Promise<StaticAnalysisResult> {
  const findings: Finding[] = [];
  const toolsRan: string[] = [];
  const logs: string[] = [];

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cra-static-"));
  const ext = language === "python" ? ".py" : language === "javascript" ? ".js" : ".txt";
  const tempFile = path.join(tempDir, `input${ext}`);

  try {
    await fs.writeFile(tempFile, code, "utf-8");

    if (language === "python") {
      // 1. Try Ruff
      try {
        const { stdout } = await execFileAsync("ruff", ["check", "--output-format=json", tempFile], {
          timeout: 4000,
        });
        toolsRan.push("ruff");
        logs.push("[Ruff] Analysis completed");
        const ruffItems = parseRuffOutput(stdout);
        findings.push(...ruffItems);
      } catch (err: unknown) {
        // Ruff returns exit code 1 if issues are found, which also contains stdout JSON!
        const execErr = err as { stdout?: string; code?: number };
        if (execErr.stdout) {
          try {
            const ruffItems = parseRuffOutput(execErr.stdout);
            toolsRan.push("ruff");
            logs.push(`[Ruff] Found ${ruffItems.length} issue(s)`);
            findings.push(...ruffItems);
          } catch {
            logs.push("[Ruff] Analyzer output unparseable");
          }
        } else {
          logs.push("[Ruff] Tool unavailable or not found on host");
        }
      }

      // 2. Try Bandit
      try {
        const { stdout } = await execFileAsync("bandit", ["-f", "json", tempFile], {
          timeout: 4000,
        });
        toolsRan.push("bandit");
        logs.push("[Bandit] Security scan completed");
        const banditItems = parseBanditOutput(stdout);
        findings.push(...banditItems);
      } catch (err: unknown) {
        // Bandit returns exit code 1 if issues are found
        const execErr = err as { stdout?: string };
        if (execErr.stdout) {
          try {
            const banditItems = parseBanditOutput(execErr.stdout);
            toolsRan.push("bandit");
            logs.push(`[Bandit] Found ${banditItems.length} issue(s)`);
            findings.push(...banditItems);
          } catch {
            logs.push("[Bandit] Tool output unparseable");
          }
        } else {
          logs.push("[Bandit] Tool unavailable on host");
        }
      }
    } else if (language === "javascript" || language === "typescript") {
      // 3. Try ESLint
      try {
        const { stdout } = await execFileAsync(
          process.platform === "win32" ? "npx.cmd" : "npx",
          ["eslint", "-f", "json", tempFile],
          { timeout: 5000 }
        );
        toolsRan.push("eslint");
        logs.push("[ESLint] Linting completed");
        const eslintItems = parseEslintOutput(stdout);
        findings.push(...eslintItems);
      } catch (err: unknown) {
        const execErr = err as { stdout?: string };
        if (execErr.stdout) {
          try {
            const eslintItems = parseEslintOutput(execErr.stdout);
            toolsRan.push("eslint");
            logs.push(`[ESLint] Found ${eslintItems.length} issue(s)`);
            findings.push(...eslintItems);
          } catch {
            logs.push("[ESLint] Failed parsing JSON");
          }
        } else {
          logs.push("[ESLint] Tool unavailable");
        }
      }
    }
  } catch (err) {
    logs.push(`Static analysis exception: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  const isLlmOnly = toolsRan.length === 0;
  if (isLlmOnly) {
    logs.push("Static analyzers unavailable on system: continuing in LLM-only mode");
  }

  return {
    findings,
    toolsRan,
    isLlmOnly,
    logs,
  };
}

function parseRuffOutput(output: string): Finding[] {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, idx) => {
    const line = item.location?.row ?? 1;
    const endLine = item.end_location?.row ?? line;
    const code = item.code ?? "RUFF";
    const message = item.message ?? "Code quality issue detected by Ruff";
    const isSecurity = code.startsWith("S");

    return {
      id: `static-ruff-${idx}-${line}`,
      severity: isSecurity ? "high" : "medium",
      category: isSecurity ? "security" : "style",
      line,
      endLine,
      snippet: "",
      title: `[${code}] ${message}`,
      confidence: "high",
      source: "static",
      why: message,
      trigger: "",
      triggerVerified: false,
      trace: [],
      impact: "Code style violation or potential runtime bug detected by linter.",
      // Ruff's fix.message is a description, not replacement code, so it must
      // never go in `fix` (Apply Fix would paste English text over the code).
      fix: "",
      fixExplanation: item.fix?.message
        ? `Ruff suggests: ${item.fix.message}`
        : "Review this line against the Ruff rule.",
      prevention: "Adhere to Python standard PEP8 and linter guidelines.",
      test: "",
      explain: {
        beginner: message,
        intermediate: `Ruff rule ${code}: ${message}`,
        expert: `Violation of Ruff rule ${code} at line ${line}.`,
      },
      reference: code,
      reproduced: false,
    };
  });
}

function parseBanditOutput(output: string): Finding[] {
  const parsed = JSON.parse(output);
  const results = parsed.results || [];
  if (!Array.isArray(results)) return [];

  return results.map((item, idx) => {
    const line = item.line_number ?? 1;
    const endLine = item.line_range?.[item.line_range.length - 1] ?? line;
    const severityMap: Record<string, Severity> = {
      HIGH: "critical",
      MEDIUM: "high",
      LOW: "medium",
    };
    const severity: Severity = severityMap[item.issue_severity] || "high";

    return {
      id: `static-bandit-${idx}-${line}`,
      severity,
      category: "security",
      line,
      endLine,
      snippet: item.code ?? "",
      title: `[${item.test_id}] ${item.issue_text}`,
      confidence: "high",
      source: "static",
      why: `${item.issue_text} (${item.test_name})`,
      trigger: "Detected by Bandit AST static security analysis",
      triggerVerified: false,
      trace: [{ line, state: "Security check triggered", note: item.issue_text }],
      impact: `Security vulnerability: ${item.issue_text}`,
      fix: "",
      fixExplanation: item.more_info
        ? `Address the security risk found by Bandit. See documentation: ${item.more_info}`
        : "Address the security risk identified by Bandit AST analyzer.",
      prevention: "Follow secure coding practices and eliminate unsafe function calls.",
      test: "",
      explain: {
        beginner: item.issue_text,
        intermediate: `Bandit detected security flaw: ${item.issue_text} (Test ${item.test_id})`,
        expert: `CWE / Bandit Issue ${item.test_id} (${item.test_name}) at line ${line}.`,
      },
      reference: item.test_id ?? "Bandit",
      reproduced: false,
    };
  });
}

function parseEslintOutput(output: string): Finding[] {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || !parsed[0]?.messages) return [];

  const findings: Finding[] = [];
  parsed[0].messages.forEach((msg: { ruleId?: string; line?: number; endLine?: number; message?: string; severity?: number }, idx: number) => {
    const line = msg.line ?? 1;
    const endLine = msg.endLine ?? line;
    const rule = msg.ruleId ?? "eslint-rule";
    const text = msg.message ?? "ESLint issue";
    const severity: Severity = msg.severity === 2 ? "high" : "low";

    findings.push({
      id: `static-eslint-${idx}-${line}`,
      severity,
      category: rule.includes("security") ? "security" : "style",
      line,
      endLine,
      snippet: "",
      title: `[${rule}] ${text}`,
      confidence: "high",
      source: "static",
      why: text,
      trigger: "",
      triggerVerified: false,
      trace: [],
      impact: "Linter error or warning.",
      fix: "",
      fixExplanation: "Fix the syntax or style violation according to ESLint rules.",
      prevention: "Follow ECMAScript best practices and project conventions.",
      test: "",
      explain: {
        beginner: text,
        intermediate: `ESLint rule ${rule}: ${text}`,
        expert: `ESLint violation for rule ${rule} at line ${line}.`,
      },
      reference: rule,
      reproduced: false,
    });
  });

  return findings;
}
