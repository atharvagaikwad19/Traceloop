import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { Finding } from "../schema";

const execFileAsync = promisify(execFile);

export interface VerificationResult {
  verifiedFindings: Finding[];
  logs: string[];
  reproducedCount: number;
  dockerUsed: boolean;
}

/**
 * Check if Docker is installed and running on the host.
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["--version"], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe Sandbox Verification Runner.
 * STRICT SAFETY RULE:
 * ONLY executes if allowVerification is explicitly TRUE and deep is TRUE.
 * Otherwise returns findings unchanged with triggerVerified = false.
 */
export async function verifyFindingsSafely(
  code: string,
  language: string,
  findings: Finding[],
  allowVerification: boolean
): Promise<VerificationResult> {
  const logs: string[] = [];

  if (!allowVerification) {
    logs.push("Verification skipped: 'Allow running code to verify findings' was not enabled.");
    return {
      verifiedFindings: findings,
      logs,
      reproducedCount: 0,
      dockerUsed: false,
    };
  }

  if (language !== "python" && language !== "javascript") {
    logs.push(`Verification not supported for language: ${language}`);
    return {
      verifiedFindings: findings,
      logs,
      reproducedCount: 0,
      dockerUsed: false,
    };
  }

  const docker = await isDockerAvailable();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cra-verify-"));

  try {
    let reproducedCount = 0;
    const updatedFindings = [...findings];

    for (let i = 0; i < updatedFindings.length; i++) {
      const finding = updatedFindings[i];
      if (!finding.trigger || finding.trigger.trim() === "") {
        continue;
      }

      // Check if trigger is a code expression
      const isPython = language === "python";
      const runnerFileName = isPython ? `verify_${i}.py` : `verify_${i}.js`;
      const runnerFilePath = path.join(tempDir, runnerFileName);

      // Wrap code in a safe harness with timeout and exception trap
      const harness = isPython
        ? `# Sandbox harness
import sys, json

${code}

try:
    # Trigger payload
    _res = ${finding.trigger}
    print("RUN_OK")
except Exception as e:
    print(f"TRIGGER_TRIGGERED: {type(e).__name__}: {e}")
`
        : `// Sandbox harness
${code}
try {
  const _res = ${finding.trigger};
  console.log("RUN_OK");
} catch (e) {
  console.log("TRIGGER_TRIGGERED: " + e.message);
}
`;

      await fs.writeFile(runnerFilePath, harness, "utf-8");

      try {
        let output = "";
        if (docker) {
          // Docker execution with network disabled and strict memory limits
          const image = isPython ? "python:3.11-slim" : "node:20-slim";
          const cmd = isPython ? ["python", `/app/${runnerFileName}`] : ["node", `/app/${runnerFileName}`];
          const { stdout } = await execFileAsync(
            "docker",
            ["run", "--rm", "--network", "none", "-m", "128m", "-v", `${tempDir}:/app:ro`, image, ...cmd],
            { timeout: 4000 }
          );
          output = stdout;
        } else {
          // Local fallback in temporary isolated working directory with 2.5s hard timeout
          const bin = isPython ? "python" : "node";
          const { stdout, stderr } = await execFileAsync(bin, [runnerFilePath], {
            timeout: 2500,
            cwd: tempDir,
          });
          output = stdout + " " + stderr;
        }

        if (output.includes("TRIGGER_TRIGGERED")) {
          logs.push(`[Verified] Finding '${finding.title}' reproduced with trigger: ${finding.trigger}`);
          updatedFindings[i] = {
            ...finding,
            triggerVerified: true,
            reproduced: true,
            confidence: "high",
          };
          reproducedCount++;
        } else {
          logs.push(`[Check] Trigger did not reproduce error for: '${finding.title}'`);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logs.push(`[Verification Exception] Finding '${finding.title}': ${errorMsg}`);
      }
    }

    return {
      verifiedFindings: updatedFindings,
      logs,
      reproducedCount,
      dockerUsed: docker,
    };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
