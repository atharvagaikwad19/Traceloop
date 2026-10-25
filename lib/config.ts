export const APP_CONFIG = {
  /** The display application name - configured here in ONE place */
  displayName: "TraceLoop",
  tagline: "AI code review & debugging",
  internalName: "traceloop",
  /**
   * Default Gemini models. These are Google's "-latest" aliases, which always
   * point at the current release, so the app does not break when a specific
   * model version is retired. Quick uses the light model, Deep the stronger
   * one, and each falls back to the other. If both are rejected the server
   * asks Google which models are available and uses one of those.
   * Override with GEMINI_MODEL (both), GEMINI_MODEL_QUICK or GEMINI_MODEL_DEEP.
   */
  quickModel: "gemini-flash-lite-latest",
  deepModel: "gemini-flash-latest",
  /** Model name shown before the first analysis has run (Quick is the default). */
  defaultModel: "gemini-flash-lite-latest",
  maxInputLines: 300,
  version: "1.1.0",
} as const;
