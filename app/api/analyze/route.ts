import { NextRequest, NextResponse } from "next/server";
import { APP_CONFIG } from "@/lib/config";
import {
  AnalyzeRequestSchema,
  AnalysisResponse,
  AnalysisResponseSchema,
  Finding,
  FindingSchema,
} from "@/lib/schema";
import { computeCacheKey, globalAnalysisCache } from "@/lib/analysis/cache";
import { runStaticAnalysis } from "@/lib/analysis/static";
import {
  buildReviewPrompt,
  buildDebugPrompt,
  buildExplainPrompt,
} from "@/lib/ai/prompts";
import { callGeminiAnalysis } from "@/lib/ai/gemini";
import { mergeFindings } from "@/lib/analysis/merging";
import { calculateQualityScore } from "@/lib/analysis/scoring";
import { verifyFindingsSafely } from "@/lib/verification/sandbox";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const pipelineLogs: string[] = [];

  try {
    const rawBody = await req.json();

    // 1. Validate request body against schema
    const parsedRequest = AnalyzeRequestSchema.safeParse(rawBody);
    if (!parsedRequest.success) {
      const issue = parsedRequest.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: issue }, { status: 400 });
    }

    const {
      code,
      language,
      mode,
      level,
      deep,
      allowVerification,
      errorContext,
    } = parsedRequest.data;

    // 2. Enforce 300-line input limit
    const lineCount = code.split("\n").length;
    if (lineCount > APP_CONFIG.maxInputLines) {
      return NextResponse.json(
        {
          error: `Code exceeds maximum allowed limit of ${APP_CONFIG.maxInputLines} lines (received ${lineCount} lines).`,
        },
        { status: 400 }
      );
    }

    pipelineLogs.push(`[Input] Validated ${lineCount} lines (${language}, mode: ${mode}, level: ${level})`);

    // 3. Check in-memory cache
    const cacheKey = computeCacheKey({
      code,
      language,
      mode,
      level,
      deep,
      allowVerification,
      errorContext,
    });

    const cachedResult = globalAnalysisCache.get(cacheKey);
    if (cachedResult) {
      pipelineLogs.push("[Cache] In-memory cache hit - returning cached result");
      return NextResponse.json({
        ...cachedResult,
        pipelineLogs: ["[Cache] Result served from memory cache"],
      });
    }

    // 4. Run static analyzers
    pipelineLogs.push(`[Static] Checking for ${language} static analyzers...`);
    const staticResult = await runStaticAnalysis(code, language);
    pipelineLogs.push(...staticResult.logs);

    // 5. Construct AI Prompt
    let prompt = "";
    if (mode === "review") {
      prompt = buildReviewPrompt({
        code,
        language,
        level,
        staticFindings: staticResult.findings,
        allowVerification,
      });
    } else if (mode === "debug") {
      prompt = buildDebugPrompt({
        code,
        language,
        level,
        staticFindings: staticResult.findings,
        errorContext,
        allowVerification,
      });
    } else {
      prompt = buildExplainPrompt({
        code,
        language,
        level,
        staticFindings: staticResult.findings,
      });
    }

    // 6. Call Gemini
    pipelineLogs.push(`[AI] Invoking Gemini model for ${mode} mode...`);
    const aiResult = await callGeminiAnalysis({
      prompt,
      mode,
      level,
      deep,
    });

    if (aiResult.notes?.length) pipelineLogs.push(...aiResult.notes);

    const rawData = aiResult.data;
    let validatedFindings: Finding[] = [];

    if (Array.isArray(rawData?.findings)) {
      for (const item of rawData.findings) {
        const itemParse = FindingSchema.safeParse(item);
        if (itemParse.success) {
          validatedFindings.push(itemParse.data);
        }
      }
    }

    // 7. Verification step in Deep mode (ONLY if allowed by explicit checkbox)
    if (deep && allowVerification && validatedFindings.length > 0) {
      pipelineLogs.push("[Deep Verification] Testing triggers in safe sandbox...");
      const verifyResult = await verifyFindingsSafely(
        code,
        language,
        validatedFindings,
        allowVerification
      );
      validatedFindings = verifyResult.verifiedFindings;
      pipelineLogs.push(...verifyResult.logs);
    } else if (deep && !allowVerification) {
      pipelineLogs.push("[Deep] Code execution verification disabled by user");
    }

    // 8. Merge static findings and LLM findings
    pipelineLogs.push("[Merge] Merging static analysis and AI findings...");
    const mergedFindings = mergeFindings(staticResult.findings, validatedFindings);

    // 9. Calculate Quality Score
    const score = calculateQualityScore(mergedFindings);

    // 10. Assemble structured envelope
    const durationMs = Date.now() - startTime;
    const toolsRan = [...staticResult.toolsRan];
    if (aiResult.modelUsed && !aiResult.modelUsed.includes("missing")) {
      toolsRan.push(aiResult.modelUsed);
    }

    let summary = rawData?.summary || "";
    if (!summary) {
      if (mergedFindings.length === 0) {
        summary = "No issues found in this code snippet. This is not a correctness guarantee.";
      } else {
        summary = `Analysis complete. Identified ${mergedFindings.length} potential issue(s).`;
      }
      if (aiResult.error) {
        summary += ` Note: ${aiResult.error}`;
      }
    }

    const envelope: AnalysisResponse = {
      summary,
      score,
      findings: mergedFindings,
      meta: {
        mode,
        level,
        modelUsed: aiResult.modelUsed,
        durationMs,
        toolsRan,
        deep,
        fromCache: false,
      },
      diagnosis: rawData?.diagnosis,
      explanationDetail: rawData?.explanationDetail,
    };

    // 11. Validate full response contract
    const finalValidation = AnalysisResponseSchema.safeParse(envelope);
    const finalizedResponse: AnalysisResponse = finalValidation.success
      ? finalValidation.data
      : envelope;

    // 12. Cache result if successful
    globalAnalysisCache.set(cacheKey, finalizedResponse);

    pipelineLogs.push(`[Complete] Processed in ${durationMs}ms with score ${score}/100`);

    return NextResponse.json({
      ...finalizedResponse,
      pipelineLogs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      {
        error: errorMsg,
        pipelineLogs: [`[Error] ${errorMsg}`],
      },
      { status: 500 }
    );
  }
}
