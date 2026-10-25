import { describe, it, expect, afterEach } from "vitest";
import { applyFixToCode, hasApplicableFix } from "../lib/analysis/patching";
import {
  detectLanguage,
  guessLanguageFromCode,
  nameForLanguage,
  nextUntitledName,
  renameFile,
  sanitizeFileName,
  uniqueName,
  languageFromFileName,
} from "../lib/files";
import {
  addHistoryEntry,
  recordAppliedFix,
  removeHistoryEntry,
  severityCounts,
  formatRelativeTime,
  HistoryEntry,
} from "../lib/history";
import { resolveModels, rankDiscoveredModels, isModelNotFound } from "../lib/ai/gemini";
import { computeCacheKey } from "../lib/analysis/cache";

describe("Apply Fix safety", () => {
  const code = "def f(a)\n    return a\n\nprint(f(1))\n";

  it("never applies an empty fix (this used to delete the user's lines)", () => {
    const r = applyFixToCode(code, 1, 2, "");
    expect(r.success).toBe(false);
    expect(r.newCode).toBe(code);
  });

  it("never applies a whitespace-only or documentation-hint fix", () => {
    expect(hasApplicableFix("   \n ")).toBe(false);
    expect(hasApplicableFix("See documentation: https://example.com")).toBe(false);
    expect(hasApplicableFix(undefined)).toBe(false);
  });

  it("still applies a real single-line fix", () => {
    const r = applyFixToCode(code, 1, 1, "def f(a):");
    expect(r.success).toBe(true);
    expect(r.newCode.split("\n")[0]).toBe("def f(a):");
    expect(r.lineCountChanged).toBe(false);
  });
});

describe("File tabs: naming", () => {
  it("builds untitled names with the right extension and skips used numbers", () => {
    expect(nextUntitledName([], "python")).toBe("untitled-1.py");
    expect(nextUntitledName(["untitled-1.js", "untitled-2.js"], "javascript")).toBe("untitled-3.js");
  });

  it("removes illegal characters and limits length", () => {
    expect(sanitizeFileName('  my:file*?<>|.py ')).toBe("myfile.py");
    expect(sanitizeFileName("a".repeat(100)).length).toBe(60);
  });

  it("makes duplicate names unique before the extension", () => {
    expect(uniqueName("a.py", ["a.py"])).toBe("a (2).py");
    expect(uniqueName("a.py", ["a.py", "a (2).py"])).toBe("a (3).py");
    expect(uniqueName("b.py", ["a.py"])).toBe("b.py");
  });

  it("rename: a known extension sets the language, no extension adds one", () => {
    const file = { id: "1", name: "untitled-1.py", language: "python" };
    expect(renameFile(file, "app.js", [file])).toEqual({ name: "app.js", language: "javascript" });
    expect(renameFile(file, "calculator", [file])).toEqual({ name: "calculator.py", language: "python" });
    expect(renameFile(file, "   ", [file])).toEqual({ name: "untitled-1.py", language: "python" });
  });

  it("rename: does not collide with another tab", () => {
    const a = { id: "1", name: "a.py", language: "python" };
    const b = { id: "2", name: "b.py", language: "python" };
    expect(renameFile(b, "a.py", [a, b]).name).toBe("a (2).py");
  });

  it("changing language swaps a recognised extension", () => {
    expect(nameForLanguage("untitled-1.py", "javascript")).toBe("untitled-1.js");
    expect(nameForLanguage("notes", "python")).toBe("notes.py");
  });
});

describe("File tabs: language detection", () => {
  it("reads the language from the extension", () => {
    expect(languageFromFileName("x.PY")).toBe("python");
    expect(languageFromFileName("x.jsx")).toBe("javascript");
    expect(languageFromFileName("noext")).toBeNull();
  });

  it("guesses Python even when the colon is missing", () => {
    expect(guessLanguageFromCode("def calculate_area(width, height)\n    return width * height\n\nprint(calculate_area(5, 10))")).toBe("python");
  });

  it("guesses JavaScript", () => {
    expect(guessLanguageFromCode("const total = items.reduce((a, b) => a + b, 0);\nconsole.log(total);")).toBe("javascript");
  });

  it("returns null when there is not enough signal", () => {
    expect(guessLanguageFromCode("x")).toBeNull();
    expect(detectLanguage("Dockerfile", "hello", "python")).toBe("python");
  });
});

describe("History helpers", () => {
  const make = (id: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
    id,
    createdAt: 1,
    fileName: "a.py",
    language: "python",
    mode: "review",
    level: "intermediate",
    deep: false,
    code: "x",
    score: 90,
    findings: [],
    modelUsed: "m",
    appliedFixes: [],
    ...extra,
  });

  it("puts the newest entry first and caps the list", () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) list = addHistoryEntry(list, make(`h${i}`), 3);
    expect(list.map((e) => e.id)).toEqual(["h4", "h3", "h2"]);
  });

  it("re-adding the same id moves it to the top without duplicating", () => {
    let list = addHistoryEntry([], make("a"));
    list = addHistoryEntry(list, make("b"));
    list = addHistoryEntry(list, make("a"));
    expect(list.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("records an applied fix and the fixed code", () => {
    const list = recordAppliedFix([make("a")], "a", { title: "Fix", line: 3, at: 5 }, "fixed code");
    expect(list[0].appliedFixes).toHaveLength(1);
    expect(list[0].fixedCode).toBe("fixed code");
  });

  it("ignores an unknown history id and removes entries", () => {
    const base = [make("a")];
    expect(recordAppliedFix(base, undefined, { title: "t", line: 1, at: 1 }, "x")).toBe(base);
    expect(removeHistoryEntry(base, "a")).toEqual([]);
  });

  it("counts severities and formats time", () => {
    const f = (severity: "critical" | "high" | "medium" | "low") => ({ severity }) as never;
    expect(severityCounts([f("critical"), f("low"), f("low")])).toEqual({ critical: 1, high: 0, medium: 0, low: 2 });
    expect(formatRelativeTime(0, 30_000)).toBe("just now");
    expect(formatRelativeTime(0, 5 * 60_000)).toBe("5 min ago");
    expect(formatRelativeTime(0, 3 * 3_600_000)).toBe("3 h ago");
  });
});

describe("Model selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("Quick prefers the light model, Deep the strong model, each falling back to the other", () => {
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_QUICK;
    delete process.env.GEMINI_MODEL_DEEP;
    const quick = resolveModels(false);
    const deep = resolveModels(true);
    expect(quick).toHaveLength(2);
    expect(deep).toEqual([...quick].reverse());
  });

  it("GEMINI_MODEL forces a single model", () => {
    process.env.GEMINI_MODEL = "my-model";
    expect(resolveModels(true)).toEqual(["my-model"]);
    expect(resolveModels(false)).toEqual(["my-model"]);
  });
});

describe("Cache key", () => {
  it("changes when verification permission changes", () => {
    const base = { code: "x", language: "python", mode: "review", level: "beginner", deep: true };
    expect(computeCacheKey({ ...base, allowVerification: true } as never)).not.toBe(
      computeCacheKey({ ...base, allowVerification: false } as never)
    );
  });
});

describe("Model discovery", () => {
  const list = [
    { name: "models/gemini-3-flash-preview", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-flash-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-flash-image", supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
  ];

  it("Quick picks the newest Flash-Lite, Deep the newest full Flash", () => {
    expect(rankDiscoveredModels(list, false)[0]).toBe("gemini-3.5-flash-lite");
    expect(rankDiscoveredModels(list, true)[0]).toBe("gemini-3.5-flash");
  });

  it("skips tts, image and embedding models", () => {
    const names = rankDiscoveredModels(list, true);
    expect(names.some((n) => /tts|image|embed/.test(n))).toBe(false);
  });

  it("recognises a missing or retired model error", () => {
    expect(isModelNotFound("[404 Not Found] models/x is not found for API version v1beta")).toBe(true);
    expect(isModelNotFound("[429 Too Many Requests] quota")).toBe(false);
  });
});
