/**
 * Editor tabs: file model plus naming and language-detection helpers.
 * Pure functions only (no React), so they are easy to unit test.
 */
import type { Finding, DebugDiagnosis, ExplainDetail } from "./schema";

export type AnalysisMode = "review" | "debug" | "explain";
export type ExplainLevel = "beginner" | "intermediate" | "expert";

export const LANGUAGES = [
  { value: "python", label: "Python (.py)", ext: "py" },
  { value: "javascript", label: "JavaScript (.js)", ext: "js" },
  { value: "typescript", label: "TypeScript (.ts)", ext: "ts" },
  { value: "json", label: "JSON (.json)", ext: "json" },
  { value: "html", label: "HTML (.html)", ext: "html" },
  { value: "css", label: "CSS (.css)", ext: "css" },
  { value: "markdown", label: "Markdown (.md)", ext: "md" },
  { value: "plaintext", label: "Plain Text (.txt)", ext: "txt" },
] as const;

/** Result of the latest analysis for one open file. */
export interface FileResult {
  findings: Finding[];
  score: number;
  diagnosis?: DebugDiagnosis;
  explanationDetail?: ExplainDetail;
  analyzedCode: string;
  mode: AnalysisMode;
  level: ExplainLevel;
  deep: boolean;
  modelUsed: string;
  fromCache: boolean;
  isLlmOnly: boolean;
  status: string;
  historyId?: string;
}

export interface OpenFile {
  id: string;
  name: string;
  language: string;
  code: string;
  result?: FileResult;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  md: "markdown",
  txt: "plaintext",
};

export function extensionFor(language: string): string {
  return LANGUAGES.find((l) => l.value === language)?.ext ?? "txt";
}

function getExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function languageFromFileName(name: string): string | null {
  const ext = getExtension(name);
  return ext ? EXT_TO_LANGUAGE[ext] ?? null : null;
}

export function languageFromFence(content: string): string | null {
  const m = content.match(/^```(\w+)/);
  if (!m) return null;
  const fence = m[1].toLowerCase();
  const map: Record<string, string> = {
    py: "python", python: "python",
    js: "javascript", javascript: "javascript",
    ts: "typescript", typescript: "typescript",
    json: "json", html: "html", css: "css",
  };
  return map[fence] ?? null;
}

/**
 * Best-effort guess for pasted code with no file name. Returns null when the
 * signals are too weak, so the current language is kept.
 */
export function guessLanguageFromCode(code: string): string | null {
  const text = code.trim();
  if (text.length < 8) return null;

  const fence = languageFromFence(text);
  if (fence) return fence;

  if (/^[\[{]/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      /* not JSON, keep going */
    }
  }

  const count = (res: RegExp[]) => res.reduce((n, r) => n + (r.test(text) ? 1 : 0), 0);

  const py = count([
    /^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w\[\], .]+)?\s*:?\s*$/m,
    /^\s*(from\s+[\w.]+\s+import\s+|import\s+\w+(\s*,\s*\w+)*\s*$)/m,
    /^\s*(elif|except|finally)\b.*:?\s*$/m,
    /\bprint\s*\(/,
    /\b(None|True|False)\b/,
    /^\s*#[^!]/m,
    /\bself\b/,
    /^\s*class\s+\w+(\(.*\))?\s*:\s*$/m,
    /\bif\s+__name__\s*==/,
  ]);

  const js = count([
    /\b(const|let|var)\s+[\w{[]/,
    /=>/,
    /console\.\w+\(/,
    /\bfunction\s*\w*\s*\(/,
    /;\s*$/m,
    /\brequire\(|^\s*import\s+.+\s+from\s+['"]/m,
    /===|!==/,
    /\b(null|undefined)\b/,
    /^\s*\/\//m,
    /\bmodule\.exports\b|\bexport\s+(default|const|function)\b/,
  ]);

  const ts = count([
    /:\s*(string|number|boolean|any|void)\b/,
    /^\s*interface\s+\w+/m,
    /^\s*type\s+\w+\s*=/m,
    /<\w+(\[\])?>\s*\(/,
  ]);

  if (js >= 2 && js > py) return ts >= 2 ? "typescript" : "javascript";
  if (py >= 2 && py > js) return "python";
  return null;
}

/** Remove characters that are not allowed in file names. */
export function sanitizeFileName(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Make `name` unique among `existing` by adding " (2)", " (3)" ... before the extension. */
export function uniqueName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;

  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

/**
 * Rename a tab. A recognised extension also sets the language; a name with no
 * extension gets the current language's extension added.
 */
export function renameFile(
  file: Pick<OpenFile, "id" | "name" | "language">,
  rawName: string,
  allFiles: Pick<OpenFile, "id" | "name">[]
): { name: string; language: string } {
  let name = sanitizeFileName(rawName);
  if (!name) return { name: file.name, language: file.language };

  let language = file.language;
  const fromExt = languageFromFileName(name);
  if (fromExt) {
    language = fromExt;
  } else if (getExtension(name) === null) {
    name = `${name}.${extensionFor(language)}`;
  }

  const others = allFiles.filter((f) => f.id !== file.id).map((f) => f.name);
  return { name: uniqueName(name, others), language };
}

/** When the language changes, swap the extension of a recognised file name. */
export function nameForLanguage(name: string, newLanguage: string): string {
  const ext = extensionFor(newLanguage);
  const current = getExtension(name);
  if (current && EXT_TO_LANGUAGE[current]) {
    return `${name.slice(0, name.lastIndexOf("."))}.${ext}`;
  }
  if (current === null) return `${name}.${ext}`;
  return name;
}

export function isUntitled(name: string): boolean {
  return /^untitled-\d+\./i.test(name);
}

/** untitled-1.py, untitled-2.js ... smallest unused number. */
export function nextUntitledName(existing: string[], language: string): string {
  const ext = extensionFor(language);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 1; i < 1000; i++) {
    const candidate = `untitled-${i}.${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `untitled-${Date.now()}.${ext}`;
}

/** Language for a file being opened: extension, then ``` fence, then content guess, then fallback. */
export function detectLanguage(name: string, content: string, fallback: string): string {
  return (
    languageFromFileName(name) ??
    languageFromFence(content) ??
    guessLanguageFromCode(content) ??
    fallback
  );
}
