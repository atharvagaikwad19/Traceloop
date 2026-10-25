"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { TopToolbar } from "@/components/TopToolbar";
import { ActivityRail, Mode } from "@/components/ActivityRail";
import { EditorPanel, IncomingFile } from "@/components/EditorPanel";
import { BottomPanel, BottomTab } from "@/components/BottomPanel";
import { FindingsPanel } from "@/components/FindingsPanel";
import { StatusBar } from "@/components/StatusBar";
import { Finding, AnalysisResponse } from "@/lib/schema";
import { SAMPLE_PYTHON_CODE } from "@/lib/analysis/cache";
import { applyFixToCode, hasApplicableFix, isCodeStale } from "@/lib/analysis/patching";
import { APP_CONFIG } from "@/lib/config";
import {
  OpenFile,
  FileResult,
  ExplainLevel,
  detectLanguage,
  guessLanguageFromCode,
  isUntitled,
  nameForLanguage,
  nextUntitledName,
  renameFile,
  sanitizeFileName,
  uniqueName,
} from "@/lib/files";
import {
  HistoryEntry,
  addHistoryEntry,
  clearStoredHistory,
  loadHistory,
  recordAppliedFix,
  removeHistoryEntry,
  saveHistory,
} from "@/lib/history";

const SAMPLE_FILE_NAME = "sample_vulnerable.py";

export default function Home() {
  // ---- open files (tabs) ----
  const [files, setFiles] = useState<OpenFile[]>([
    { id: "file-1", name: "untitled-1.py", language: "python", code: "" },
  ]);
  const [activeId, setActiveId] = useState<string>("file-1");
  // filesRef always holds the newest list so async code never reads stale tabs
  const filesRef = useRef<OpenFile[]>(files);
  const idCounter = useRef(1);

  const commitFiles = (next: OpenFile[]) => {
    filesRef.current = next;
    setFiles(next);
  };
  const patchFile = (id: string, patch: Partial<OpenFile>) =>
    commitFiles(filesRef.current.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const newFileId = () => `file-${++idCounter.current}`;

  const activeFile = files.find((f) => f.id === activeId) ?? files[0];
  const code = activeFile.code;
  const language = activeFile.language;
  const result = activeFile.result;

  // ---- settings shared by all tabs ----
  const [mode, setMode] = useState<Mode>("review");
  const [deep, setDeep] = useState<boolean>(false);
  const [allowVerification, setAllowVerification] = useState<boolean>(false);
  const [level, setLevel] = useState<ExplainLevel>("intermediate");
  const [errorContext, setErrorContext] = useState<string>("");

  // ---- run state ----
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);
  // Each log entry is "time<TAB>text" so the Output tab shows when it really happened
  const stamp = (text: string) => `${new Date().toLocaleTimeString()}\t${text}`;
  const addLog = (line: string) => setLogs((prev) => [...prev, stamp(line)]);

  const [selectedLine, setSelectedLine] = useState<number | undefined>();
  const [bottomTab, setBottomTab] = useState<BottomTab>("output");
  const [diffCode, setDiffCode] = useState<string>("");
  const [activeFixFinding, setActiveFixFinding] = useState<Finding | null>(null);
  const [cursorLine, setCursorLine] = useState<number>(1);
  const [cursorCol, setCursorCol] = useState<number>(1);

  // ---- history (browser localStorage only) ----
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  useEffect(() => {
    const stored = loadHistory();
    historyRef.current = stored;
    setHistory(stored);
  }, []);
  const commitHistory = (next: HistoryEntry[]) => {
    const saved = saveHistory(next);
    historyRef.current = saved;
    setHistory(saved);
  };

  // ---- derived values for the active tab ----
  const findings = result?.findings ?? [];
  const analyzedCode = result?.analyzedCode ?? "";
  const isOutOfDate = analyzedCode.length > 0 && isCodeStale(analyzedCode, code);
  const apiError = apiErrors[activeFile.id] ?? "";
  const isActiveLoading = loadingId === activeFile.id;
  const modelUsed = result?.modelUsed ?? (deep ? APP_CONFIG.deepModel : APP_CONFIG.quickModel);
  const engineStatus = isActiveLoading ? "Analyzing..." : apiError ? "Error" : result?.status ?? "Ready";

  // ---- analysis ----
  const runAnalysis = useCallback(
    async (opts?: { fileId?: string; code?: string }) => {
      const fileId = opts?.fileId ?? activeId;
      const file = filesRef.current.find((f) => f.id === fileId);
      if (!file) return;
      if (loadingId) return; // one analysis at a time

      const targetCode = opts?.code !== undefined ? opts.code : file.code;
      const setError = (msg: string) => setApiErrors((prev) => ({ ...prev, [fileId]: msg }));

      if (!targetCode || targetCode.trim() === "") {
        setError("Please paste or load code before analyzing.");
        return;
      }

      setLoadingId(fileId);
      setError("");
      addLog(
        `Starting ${mode.toUpperCase()} analysis of ${file.name} (${deep ? "Deep" : "Quick"}, ${file.language})`
      );

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: targetCode,
            language: file.language,
            mode,
            level,
            deep,
            allowVerification,
            errorContext,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP error ${res.status}`);

        const response = data as AnalysisResponse & { pipelineLogs?: string[] };
        const tools = response.meta?.toolsRan || [];
        const hasStatic = tools.some((t) => t === "ruff" || t === "bandit" || t === "eslint");
        const fromCache = Boolean(response.meta?.fromCache);

        let status = "Ready";
        if (fromCache) status = "Cached";
        else if (response.meta?.deep && allowVerification) status = "Deep Verified";
        else if (!hasStatic) status = "LLM only";

        const currentName = filesRef.current.find((f) => f.id === fileId)?.name ?? file.name;
        const score = response.score ?? 100;
        const modelName = response.meta?.modelUsed || APP_CONFIG.defaultModel;

        // Same code + settings analysed again: refresh that history entry instead of adding a duplicate
        const previous = historyRef.current.find(
          (e) =>
            e.code === targetCode &&
            e.fileName === currentName &&
            e.mode === mode &&
            e.level === level &&
            e.deep === deep
        );
        const entry: HistoryEntry = {
          id: previous?.id ?? `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: Date.now(),
          fileName: currentName,
          language: file.language,
          mode,
          level,
          deep,
          code: targetCode,
          score,
          findings: response.findings || [],
          diagnosis: response.diagnosis,
          explanationDetail: response.explanationDetail,
          modelUsed: modelName,
          appliedFixes: previous?.appliedFixes ?? [],
          fixedCode: previous?.fixedCode,
        };
        commitHistory(addHistoryEntry(historyRef.current, entry));

        const newResult: FileResult = {
          findings: response.findings || [],
          score,
          diagnosis: response.diagnosis,
          explanationDetail: response.explanationDetail,
          analyzedCode: targetCode,
          mode,
          level,
          deep,
          modelUsed: modelName,
          fromCache,
          isLlmOnly: !hasStatic && tools.length > 0,
          status,
          historyId: entry.id,
        };
        if (filesRef.current.some((f) => f.id === fileId)) {
          patchFile(fileId, { result: newResult });
        }

        if (response.pipelineLogs) setLogs((prev) => [...prev, ...response.pipelineLogs!.map(stamp)]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to run analysis";
        setError(msg);
        addLog(`[Error] ${msg}`);
      } finally {
        setLoadingId(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, loadingId, mode, level, deep, allowVerification, errorContext]
  );

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runAnalysis();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runAnalysis]);

  // ---- tabs ----
  const selectFile = (id: string) => {
    setActiveId(id);
    setSelectedLine(undefined);
    setDiffCode("");
    setActiveFixFinding(null);
  };

  const handleNewFile = () => {
    const names = filesRef.current.map((f) => f.name);
    const lang = activeFile.language;
    const file: OpenFile = { id: newFileId(), name: nextUntitledName(names, lang), language: lang, code: "" };
    commitFiles([...filesRef.current, file]);
    selectFile(file.id);
  };

  const handleCloseFile = (id: string) => {
    const list = filesRef.current;
    const file = list.find((f) => f.id === id);
    if (!file) return;

    const unsaved =
      file.code.trim() !== "" && (!file.result || isCodeStale(file.result.analyzedCode, file.code));
    if (unsaved && !window.confirm(`Close ${file.name}? Code that has not been analysed since your last edit will be lost.`)) {
      return;
    }

    const index = list.findIndex((f) => f.id === id);
    let next = list.filter((f) => f.id !== id);
    if (next.length === 0) {
      next = [{ id: newFileId(), name: "untitled-1.py", language: "python", code: "" }];
    }
    commitFiles(next);
    if (id === activeId) selectFile(next[Math.min(index, next.length - 1)].id);
  };

  const handleRenameFile = (id: string, rawName: string) => {
    const file = filesRef.current.find((f) => f.id === id);
    if (!file) return;
    const renamed = renameFile(file, rawName, filesRef.current);
    patchFile(id, renamed);
  };

  const handleLanguageChange = (lang: string) => {
    const others = filesRef.current.filter((f) => f.id !== activeFile.id).map((f) => f.name);
    patchFile(activeFile.id, {
      language: lang,
      name: uniqueName(nameForLanguage(activeFile.name, lang), others),
    });
  };

  const handleCodeChange = (newCode: string) => {
    const patch: Partial<OpenFile> = { code: newCode };
    // Pasting into a blank "untitled" tab: detect Python vs JavaScript and fix the extension
    if (isUntitled(activeFile.name) && activeFile.code.trim() === "" && newCode.trim().length >= 15) {
      const guess = guessLanguageFromCode(newCode);
      if (guess && guess !== activeFile.language) {
        const others = filesRef.current.filter((f) => f.id !== activeFile.id).map((f) => f.name);
        patch.language = guess;
        patch.name = uniqueName(nameForLanguage(activeFile.name, guess), others);
      }
    }
    patchFile(activeFile.id, patch);
  };

  const handleOpenFiles = (incoming: IncomingFile[]) => {
    let list = filesRef.current;
    // Opening into the untouched starter tab replaces it instead of leaving an empty tab behind
    if (list.length === 1 && list[0].code.trim() === "" && !list[0].result && isUntitled(list[0].name)) {
      list = [];
    }

    const added: OpenFile[] = [];
    for (const item of incoming) {
      const cleaned = sanitizeFileName(item.name) || "file.txt";
      const name = uniqueName(cleaned, [...list, ...added].map((f) => f.name));
      added.push({
        id: newFileId(),
        name,
        language: detectLanguage(name, item.content, activeFile.language),
        code: item.content,
      });
    }
    if (added.length === 0) return;

    commitFiles([...list, ...added]);
    selectFile(added[added.length - 1].id);
    addLog(
      `Opened ${added.length} file${added.length > 1 ? "s" : ""}: ${added.map((f) => f.name).join(", ")}`
    );
  };

  // Load Sample (works offline: the sample answer is pre-seeded in the cache)
  const handleLoadSample = () => {
    const existing = filesRef.current.find((f) => f.name === SAMPLE_FILE_NAME);
    let fileId: string;
    if (existing) {
      fileId = existing.id;
      patchFile(fileId, { code: SAMPLE_PYTHON_CODE, language: "python", result: undefined });
    } else {
      fileId = newFileId();
      const sample: OpenFile = { id: fileId, name: SAMPLE_FILE_NAME, language: "python", code: SAMPLE_PYTHON_CODE };
      const list = filesRef.current;
      const replaceStarter =
        list.length === 1 && list[0].code.trim() === "" && !list[0].result && isUntitled(list[0].name);
      commitFiles(replaceStarter ? [sample] : [...list, sample]);
    }
    selectFile(fileId);
    setErrorContext(
      "TypeError: unsupported operand type(s) for /: 'int' and 'NoneType'\n  File 'sample_vulnerable.py', line 14, in get_user_data"
    );
    addLog(`Loaded bundled sample with known security & runtime issues`);
    runAnalysis({ fileId, code: SAMPLE_PYTHON_CODE });
  };

  // ---- fixes ----
  const handleViewFix = (finding: Finding) => {
    setActiveFixFinding(finding);
    const patch = applyFixToCode(code, finding.line, finding.endLine, finding.fix);
    if (patch.success) {
      setDiffCode(patch.newCode);
      setBottomTab("diff");
    } else {
      addLog(`[Patch Error] ${patch.error}`);
    }
  };

  const handleApplyFix = (finding: Finding) => {
    if (isOutOfDate) {
      addLog(`[Warning] Code changed since analysis. Re-analyze before applying this fix.`);
      return;
    }
    if (!hasApplicableFix(finding.fix)) {
      addLog(`[Apply Error] '${finding.title}' has no automatic fix to apply.`);
      return;
    }

    const patch = applyFixToCode(code, finding.line, finding.endLine, finding.fix);
    if (!patch.success) {
      addLog(`[Apply Error] ${patch.error}`);
      return;
    }

    patchFile(activeFile.id, { code: patch.newCode });
    addLog(`[Applied Fix] Applied '${finding.title}' at line ${finding.line}`);

    // Remember the applied fix on the history entry this result came from
    commitHistory(
      recordAppliedFix(
        historyRef.current,
        result?.historyId,
        { title: finding.title, line: finding.line, at: Date.now() },
        patch.newCode
      )
    );

    if (patch.lineCountChanged) {
      addLog(`[Auto-Reanalysis] Line count changed by ${patch.linesDelta} line(s) - rerunning analysis`);
      runAnalysis({ fileId: activeFile.id, code: patch.newCode });
    }
  };

  const handleApplyDiffFix = () => {
    if (activeFixFinding) {
      handleApplyFix(activeFixFinding);
    } else if (diffCode && !isOutOfDate) {
      patchFile(activeFile.id, { code: diffCode });
      runAnalysis({ fileId: activeFile.id, code: diffCode });
    }
  };

  // ---- history actions ----
  const handleRestoreHistory = (entry: HistoryEntry) => {
    const name = uniqueName(entry.fileName, filesRef.current.map((f) => f.name));
    const file: OpenFile = {
      id: newFileId(),
      name,
      language: entry.language,
      code: entry.code,
      result: {
        findings: entry.findings,
        score: entry.score,
        diagnosis: entry.diagnosis,
        explanationDetail: entry.explanationDetail,
        analyzedCode: entry.code,
        mode: entry.mode,
        level: entry.level,
        deep: entry.deep,
        modelUsed: entry.modelUsed,
        fromCache: false,
        isLlmOnly: false,
        status: "Restored",
        historyId: entry.id,
      },
    };
    commitFiles([...filesRef.current, file]);
    selectFile(file.id);
    setMode(entry.mode);
    setLevel(entry.level);
    setDeep(entry.deep);
    addLog(`Restored saved results for ${entry.fileName}`);
  };

  const handleOpenFixedHistory = (entry: HistoryEntry) => {
    if (!entry.fixedCode) return;
    const dot = entry.fileName.lastIndexOf(".");
    const base = dot > 0 ? entry.fileName.slice(0, dot) : entry.fileName;
    const ext = dot > 0 ? entry.fileName.slice(dot) : "";
    const name = uniqueName(`${base} (fixed)${ext}`, filesRef.current.map((f) => f.name));
    const file: OpenFile = { id: newFileId(), name, language: entry.language, code: entry.fixedCode };
    commitFiles([...filesRef.current, file]);
    selectFile(file.id);
  };

  const handleDeleteHistory = (id: string) => commitHistory(removeHistoryEntry(historyRef.current, id));

  const handleClearHistory = () => {
    if (!window.confirm("Delete all saved analysis history from this browser?")) return;
    clearStoredHistory();
    historyRef.current = [];
    setHistory([]);
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    if (newMode === "debug") setBottomTab("error");
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0e1a] text-[#e4e9f7]">
      <TopToolbar
        language={language}
        onLanguageChange={handleLanguageChange}
        deep={deep}
        onDeepChange={setDeep}
        allowVerification={allowVerification}
        onAllowVerificationChange={setAllowVerification}
        onAnalyze={() => runAnalysis()}
        isLoading={loadingId !== null}
      />

      <div className="flex-1 flex overflow-hidden">
        <ActivityRail activeMode={mode} onModeChange={handleModeChange} />

        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          <EditorPanel
            files={files}
            activeFileId={activeFile.id}
            onSelectFile={selectFile}
            onCloseFile={handleCloseFile}
            onNewFile={handleNewFile}
            onRenameFile={handleRenameFile}
            onCodeChange={handleCodeChange}
            onOpenFiles={handleOpenFiles}
            onLoadSample={handleLoadSample}
            findings={findings}
            selectedLine={selectedLine}
            onCursorChange={(ln, col) => {
              setCursorLine(ln);
              setCursorCol(col);
            }}
            isOutOfDate={isOutOfDate}
            onAnalyzeShortcut={() => runAnalysis()}
          />

          <BottomPanel
            activeTab={bottomTab}
            onTabChange={setBottomTab}
            logs={logs}
            onClearLogs={() => setLogs([])}
            originalCode={code}
            diffCode={diffCode}
            language={language}
            errorContext={errorContext}
            onErrorContextChange={setErrorContext}
            mode={mode}
            onApplyDiffFix={handleApplyDiffFix}
            canApplyFix={!isOutOfDate && (Boolean(diffCode) || Boolean(activeFixFinding))}
            history={history}
            onRestoreHistory={handleRestoreHistory}
            onOpenFixedHistory={handleOpenFixedHistory}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
          />
        </div>

        <FindingsPanel
          mode={mode}
          score={result ? result.score : null}
          findings={findings}
          diagnosis={result?.diagnosis}
          explanationDetail={result?.explanationDetail}
          level={level}
          onLevelChange={setLevel}
          isLoading={isActiveLoading}
          isEmpty={!result}
          error={apiError}
          onRetry={() => runAnalysis()}
          isOutOfDate={isOutOfDate}
          isLlmOnly={result?.isLlmOnly ?? false}
          isQuickMode={!deep}
          onSelectLine={(ln) => setSelectedLine(ln)}
          onViewFix={handleViewFix}
          onApplyFix={handleApplyFix}
          canApplyFix={!isOutOfDate}
        />
      </div>

      <StatusBar
        mode={mode}
        language={language}
        cursorLine={cursorLine}
        cursorCol={cursorCol}
        modelName={modelUsed}
        status={engineStatus}
        isCached={result?.fromCache ?? false}
      />
    </div>
  );
}
