import { z } from "zod";

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const CategorySchema = z.enum(["bug", "security", "performance", "style"]);
export type Category = z.infer<typeof CategorySchema>;

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SourceSchema = z.enum(["static", "llm", "both"]);
export type Source = z.infer<typeof SourceSchema>;

export const TraceStepSchema = z.object({
  line: z.number(),
  state: z.string(),
  note: z.string(),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const ExplanationLevelsSchema = z.object({
  beginner: z.string(),
  intermediate: z.string(),
  expert: z.string(),
});
export type ExplanationLevels = z.infer<typeof ExplanationLevelsSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  severity: SeveritySchema,
  category: CategorySchema,
  line: z.number(),
  endLine: z.number().default(1),
  snippet: z.string().default(""),
  title: z.string(),
  confidence: ConfidenceSchema,
  source: SourceSchema,
  why: z.string(),
  trigger: z.string().default(""),
  triggerVerified: z.boolean().default(false),
  trace: z.array(TraceStepSchema).default([]),
  impact: z.string(),
  fix: z.string(),
  fixExplanation: z.string(),
  prevention: z.string(),
  test: z.string(),
  explain: ExplanationLevelsSchema,
  reference: z.string().default(""),
  reproduced: z.boolean().default(false),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ResponseMetaSchema = z.object({
  mode: z.enum(["review", "debug", "explain"]),
  level: z.enum(["beginner", "intermediate", "expert"]),
  modelUsed: z.string(),
  durationMs: z.number(),
  toolsRan: z.array(z.string()),
  deep: z.boolean(),
  fromCache: z.boolean(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const DebugDiagnosisSchema = z.object({
  hypotheses: z.array(
    z.object({
      title: z.string(),
      likelihood: z.enum(["high", "medium", "low"]),
      explanation: z.string(),
    })
  ),
  rootCause: z.string(),
  suggestedFix: z.string(),
});
export type DebugDiagnosis = z.infer<typeof DebugDiagnosisSchema>;

export const ExplainDetailSchema = z.object({
  overview: z.string(),
  walkthrough: z.array(
    z.object({
      lineRange: z.string(),
      explanation: z.string(),
      purpose: z.string(),
    })
  ),
  concepts: z.array(z.string()),
  complexity: z.object({
    time: z.string(),
    space: z.string(),
  }),
});
export type ExplainDetail = z.infer<typeof ExplainDetailSchema>;

export const AnalysisResponseSchema = z.object({
  summary: z.string(),
  score: z.number(),
  findings: z.array(FindingSchema),
  meta: ResponseMetaSchema,
  diagnosis: DebugDiagnosisSchema.optional(),
  explanationDetail: ExplainDetailSchema.optional(),
});
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

export const AnalyzeRequestSchema = z.object({
  code: z.string().min(1, "Code cannot be empty"),
  language: z.enum(["python", "javascript", "typescript", "json", "html", "css", "markdown", "plaintext"]),
  mode: z.enum(["review", "debug", "explain"]).default("review"),
  level: z.enum(["beginner", "intermediate", "expert"]).default("intermediate"),
  deep: z.boolean().default(false),
  allowVerification: z.boolean().default(false),
  errorContext: z.string().default(""),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
