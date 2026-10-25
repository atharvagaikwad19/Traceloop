import { GoogleGenerativeAI } from "@google/generative-ai";
import { APP_CONFIG } from "../config";
import {
  AnalysisResponse,
  AnalysisResponseSchema,
  Finding,
  ResponseMeta,
} from "../schema";

export interface GeminiCallParams {
  prompt: string;
  mode: "review" | "debug" | "explain";
  level: "beginner" | "intermediate" | "expert";
  deep: boolean;
}

export interface GeminiCallResult {
  data: Partial<AnalysisResponse>;
  modelUsed: string;
  error?: string;
  rawText?: string;
  /** Human-readable pipeline notes (fallback used, model failures). */
  notes?: string[];
}

/**
 * Strips markdown code fences from JSON strings if present.
 */
function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }
  return cleaned.trim();
}

/**
 * Pick the primary and fallback model for a request.
 * GEMINI_MODEL forces a single model; otherwise Quick prefers the light model
 * and Deep prefers the stronger one, each falling back to the other.
 */
export function resolveModels(deep: boolean): string[] {
  const forced = process.env.GEMINI_MODEL?.trim();
  if (forced) return [forced];

  const quick = process.env.GEMINI_MODEL_QUICK?.trim() || APP_CONFIG.quickModel;
  const strong = process.env.GEMINI_MODEL_DEEP?.trim() || APP_CONFIG.deepModel;
  const ordered = deep ? [strong, quick] : [quick, strong];
  return ordered.filter((m, i) => ordered.indexOf(m) === i);
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

function baseUrl(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** True when an API error means "this model name does not exist / is retired". */
export function isModelNotFound(message: string): boolean {
  return /\b404\b|not found|is not supported|no longer available|has been (retired|shut down)/i.test(message);
}

/**
 * Pick usable text models from a ListModels response, best first.
 * Quick prefers a Flash-Lite model, Deep prefers a full Flash model; newer
 * versions and stable (non-preview) releases rank higher.
 */
export function rankDiscoveredModels(
  models: { name: string; supportedGenerationMethods?: string[] }[],
  deep: boolean
): string[] {
  const unwanted = /(tts|live|image|audio|embed|vision|native|robotics|computer|exp|aqa|imagen|veo|nano|omni|gemma|customtools)/i;
  const scored = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini-/.test(n) && /flash/.test(n) && !unwanted.test(n))
    .map((n) => {
      const version = parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? "0");
      const isLite = /lite/.test(n);
      const stable = /preview/.test(n) ? 0 : 1;
      const wantLite = deep ? 0 : 1;
      return { n, score: (isLite === Boolean(wantLite) ? 1000 : 0) + version * 10 + stable };
    });
  return scored.sort((a, b) => b.score - a.score).map((x) => x.n);
}

let discoveryCache: { at: number; models: { name: string; supportedGenerationMethods?: string[] }[] } | null = null;

async function discoverModels(apiKey: string, deep: boolean): Promise<string[]> {
  try {
    if (!discoveryCache || Date.now() - discoveryCache.at > 10 * 60 * 1000) {
      const res = await fetch(`${baseUrl()}/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) return [];
      const json = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      discoveryCache = { at: Date.now(), models: json.models ?? [] };
    }
    return rankDiscoveredModels(discoveryCache.models, deep);
  } catch {
    return [];
  }
}

type ModelAttempt =
  | { ok: true; data: Partial<AnalysisResponse>; text: string }
  | { ok: false; error: string };

/**
 * One model, at most one retry. The retry only happens when the reply was not
 * valid JSON; API errors (404 retired model, 429 rate limit, 5xx) are returned
 * straight away so the caller can switch to the fallback model.
 */
async function tryModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string
): Promise<ModelAttempt> {
  const model = genAI.getGenerativeModel(
    {
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    },
    process.env.GEMINI_BASE_URL?.trim() ? { baseUrl: baseUrl() } : undefined
  );

  let currentPrompt = prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(currentPrompt);
      const text = result.response.text();
      return { ok: true, data: JSON.parse(cleanJsonString(text)), text };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isParseError = err instanceof SyntaxError;
      if (!isParseError || attempt === 1) {
        return { ok: false, error: message };
      }
      currentPrompt = `${prompt}\n\nCRITICAL FIX: Your previous response was not valid JSON or failed parsing. Return ONLY raw JSON strictly conforming to the Output Contract without formatting or commentary.`;
    }
  }
  return { ok: false, error: "Gemini response was invalid or unreachable" };
}

/**
 * Server-side Gemini service.
 * Never exposes API key to client.
 * Enforces temperature ~0.2 and responseMimeType="application/json".
 * Tries the preferred model for the mode, then the fallback model.
 */
export async function callGeminiAnalysis(
  params: GeminiCallParams
): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = resolveModels(params.deep);

  if (!apiKey || apiKey.trim() === "") {
    return {
      data: {},
      modelUsed: "none (API key missing)",
      error: "GEMINI_API_KEY environment variable is not configured on the server.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const notes: string[] = [];
  let lastError = "";

  const tried = new Set<string>();
  const run = async (list: string[], isFallbackList: boolean) => {
    for (let i = 0; i < list.length; i++) {
      const modelName = list[i];
      if (tried.has(modelName)) continue;
      tried.add(modelName);
      const attempt = await tryModel(genAI, modelName, params.prompt);
      if (attempt.ok) {
        if (isFallbackList || tried.size > 1) notes.push(`[AI] Fallback model ${modelName} was used`);
        return { data: attempt.data, modelUsed: modelName, rawText: attempt.text, notes };
      }
      lastError = attempt.error;
      notes.push(`[AI] ${modelName} failed: ${attempt.error.slice(0, 160)}`);
    }
    return null;
  };

  const first = await run(models, false);
  if (first) return first;

  // Every configured model was rejected as missing/retired: ask Google what exists and retry once
  if (isModelNotFound(lastError)) {
    const discovered = (await discoverModels(apiKey, params.deep)).filter((m) => !tried.has(m)).slice(0, 2);
    if (discovered.length > 0) {
      notes.push(`[AI] Configured models unavailable; trying models listed by Google: ${discovered.join(", ")}`);
      const second = await run(discovered, true);
      if (second) return second;
    }
  }

  return {
    data: {},
    modelUsed: models[0],
    error: `Gemini error: ${lastError}`,
    notes,
  };
}
