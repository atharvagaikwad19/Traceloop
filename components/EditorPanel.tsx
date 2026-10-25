"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import Editor, { Monaco, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Finding } from "@/lib/schema";
import { OpenFile } from "@/lib/files";
import { TRACELOOP_THEME, defineTraceLoopTheme } from "@/lib/monacoTheme";
import {
  FileCode,
  FolderOpen,
  Sparkles,
  AlertTriangle,
  Upload,
  X,
  Plus,
} from "lucide-react";

const GithubIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const LANGUAGE_TAB_COLOR: Record<string, string> = {
  python: "text-[#5cc8ff]",
  javascript: "text-[#f5b942]",
  typescript: "text-[#7c6cff]",
};

const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES_AT_ONCE = 10;

export interface IncomingFile {
  name: string;
  content: string;
}

interface EditorPanelProps {
  files: OpenFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  onNewFile: () => void;
  onRenameFile: (id: string, name: string) => void;
  onCodeChange: (newCode: string) => void;
  onOpenFiles: (files: IncomingFile[]) => void;
  onLoadSample: () => void;
  findings: Finding[];
  selectedLine?: number;
  onCursorChange?: (line: number, col: number) => void;
  isOutOfDate: boolean;
  onAnalyzeShortcut: () => void;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onNewFile,
  onRenameFile,
  onCodeChange,
  onOpenFiles,
  onLoadSample,
  findings,
  selectedLine,
  onCursorChange,
  isOutOfDate,
  onAnalyzeShortcut,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutRef = useRef(onAnalyzeShortcut);
  const cursorRef = useRef(onCursorChange);
  shortcutRef.current = onAnalyzeShortcut;
  cursorRef.current = onCursorChange;

  const [showGithubModal, setShowGithubModal] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [githubError, setGithubError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [importNote, setImportNote] = useState("");

  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0];

  const handleEditorDidMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;

    editorInstance.onDidChangeCursorPosition((e) => {
      cursorRef.current?.(e.position.lineNumber, e.position.column);
    });

    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      () => shortcutRef.current()
    );

    updateDecorations();
  };

  // Markers for the active file only. A fresh collection per update keeps
  // decorations from leaking between tabs (each tab is its own Monaco model).
  const updateDecorations = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;
    decorationsRef.current?.clear();

    const newDecorations: editor.IModelDeltaDecoration[] = findings.map((f) => {
      const line = Math.max(1, f.line);
      const endLine = Math.max(line, f.endLine || line);
      return {
        range: new monacoRef.current!.Range(line, 1, endLine, 1000),
        options: {
          isWholeLine: false,
          glyphMarginClassName: `monaco-glyph-${f.severity}`,
          inlineClassName: `monaco-wavy-${f.severity}`,
          linesDecorationsClassName: `monaco-glyph-${f.severity}`,
          hoverMessage: {
            value: `**[${f.severity.toUpperCase()}] ${f.title}**\n\n${f.why}\n\n*Fix:* \`${f.fix || "See findings panel"}\``,
          },
        },
      };
    });

    decorationsRef.current = editorRef.current.createDecorationsCollection(newDecorations);
  }, [findings]);

  useEffect(() => {
    updateDecorations();
  }, [updateDecorations, activeFileId]);

  useEffect(() => {
    if (selectedLine && editorRef.current) {
      editorRef.current.revealLineInCenter(selectedLine);
      editorRef.current.setPosition({ lineNumber: selectedLine, column: 1 });
      editorRef.current.focus();
    }
  }, [selectedLine]);

  // ---- reading files (picker and drag-and-drop, several at once) ----
  const readFiles = async (list: File[]) => {
    setImportNote("");
    const chosen = list.slice(0, MAX_FILES_AT_ONCE);
    const skipped: string[] = list.slice(MAX_FILES_AT_ONCE).map((f) => f.name);
    const incoming: IncomingFile[] = [];

    for (const file of chosen) {
      if (file.size > MAX_FILE_BYTES) {
        skipped.push(`${file.name} (over 1 MB)`);
        continue;
      }
      try {
        incoming.push({ name: file.name, content: await file.text() });
      } catch {
        skipped.push(`${file.name} (unreadable)`);
      }
    }

    if (incoming.length > 0) onOpenFiles(incoming);
    if (skipped.length > 0) setImportNote(`Skipped: ${skipped.join(", ")}`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length > 0) void readFiles(list);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const list = Array.from(e.dataTransfer.files ?? []);
    if (list.length > 0) void readFiles(list);
  };

  // ---- GitHub import (github.com / raw.githubusercontent.com only) ----
  const handleImportGithub = async () => {
    setGithubError("");
    try {
      const parsed = new URL(githubUrl);
      const isGitHubDomain =
        parsed.hostname === "github.com" || parsed.hostname === "raw.githubusercontent.com";

      if (!isGitHubDomain) {
        setGithubError("Only github.com or raw.githubusercontent.com URLs are permitted.");
        return;
      }

      let fetchUrl = githubUrl;
      if (parsed.hostname === "github.com") {
        // https://github.com/user/repo/blob/main/path/file.py -> raw URL
        fetchUrl = githubUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`Failed to fetch file (HTTP ${res.status})`);
      const text = await res.text();
      const name = decodeURIComponent(fetchUrl.split("?")[0].split("/").pop() || "github_file.txt");

      onOpenFiles([{ name, content: text }]);
      setShowGithubModal(false);
      setGithubUrl("");
    } catch (err: unknown) {
      setGithubError(err instanceof Error ? err.message : "Failed to load GitHub file");
    }
  };

  // ---- tab renaming ----
  const startRename = (file: OpenFile) => {
    setRenamingId(file.id);
    setDraftName(file.name);
  };

  const commitRename = () => {
    if (renamingId) onRenameFile(renamingId, draftName);
    setRenamingId(null);
  };

  return (
    <div
      className={`flex-1 flex flex-col bg-[#0b0e1a] h-full overflow-hidden relative ${
        isDragging ? "ring-2 ring-[#7c6cff] ring-inset" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Tab bar */}
      <div className="h-9 bg-[#121729] border-b border-[#2a3452] flex items-stretch justify-between select-none">
        <div className="flex items-end min-w-0 flex-1 overflow-x-auto pl-2 gap-0.5">
          {files.map((file) => {
            const isActive = file.id === activeFile.id;
            const isRenaming = renamingId === file.id;
            return (
              <div
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                onDoubleClick={() => startRename(file)}
                onAuxClick={(e) => {
                  if (e.button === 1) onCloseFile(file.id);
                }}
                title="Double-click to rename"
                className={`group flex items-center gap-1.5 pl-3 pr-1.5 h-8 rounded-t text-xs font-mono cursor-pointer border-t-2 shrink-0 max-w-[220px] ${
                  isActive
                    ? "bg-[#0b0e1a] text-[#e4e9f7] border-[#7c6cff]"
                    : "text-[#8f9bb8] border-transparent hover:bg-[#1b2238] hover:text-[#e4e9f7]"
                }`}
              >
                <FileCode
                  className={`w-3.5 h-3.5 shrink-0 ${LANGUAGE_TAB_COLOR[file.language] ?? "text-[#5cc8ff]"}`}
                />
                {isRenaming ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#0b0e1a] border border-[#7c6cff] rounded px-1 text-xs w-36 outline-none text-[#e4e9f7]"
                  />
                ) : (
                  <span className="truncate">{file.name}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(file.id);
                  }}
                  className={`p-0.5 rounded hover:bg-[#2a3452] ${
                    isActive ? "opacity-70" : "opacity-0 group-hover:opacity-70"
                  } hover:!opacity-100`}
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          <button
            onClick={onNewFile}
            className="mb-1 ml-1 p-1 rounded text-[#8f9bb8] hover:text-[#e4e9f7] hover:bg-[#1b2238] shrink-0"
            title="New file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {isOutOfDate && (
            <div className="mb-1 ml-2 flex items-center gap-1 text-[11px] text-[#f5b942] bg-[#f5b942]/10 border border-[#f5b942]/30 px-2 py-0.5 rounded font-mono shrink-0">
              <AlertTriangle className="w-3 h-3 text-[#f5b942]" />
              <span>Results out of date</span>
            </div>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-2 px-3 shrink-0">
          <button
            onClick={onLoadSample}
            className="flex items-center gap-1 text-xs text-[#8f9bb8] hover:text-[#e4e9f7] px-2 py-1 rounded hover:bg-[#1b2238] transition-colors"
            title="Load sample vulnerable code (works offline without API key)"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#f5b942]" />
            <span>Load Sample</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-[#8f9bb8] hover:text-[#e4e9f7] px-2 py-1 rounded hover:bg-[#1b2238] transition-colors"
            title="Open one or more local files, or drag and drop them into the editor"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#5cc8ff]" />
            <span>Open Files</span>
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept=".py,.js,.mjs,.cjs,.ts,.tsx,.jsx,.json,.html,.css,.md,.txt"
          />

          <button
            onClick={() => setShowGithubModal(true)}
            className="flex items-center gap-1 text-xs text-[#8f9bb8] hover:text-[#e4e9f7] px-2 py-1 rounded hover:bg-[#1b2238] transition-colors"
            title="Fetch a public file from GitHub"
          >
            <GithubIcon className="w-3.5 h-3.5 text-[#e4e9f7]" />
            <span>GitHub URL</span>
          </button>
        </div>
      </div>

      {importNote && (
        <div className="px-3 py-1 text-[11px] text-[#f5b942] bg-[#f5b942]/10 border-b border-[#f5b942]/30 font-mono flex items-center justify-between">
          <span>{importNote}</span>
          <button onClick={() => setImportNote("")} className="hover:text-[#e4e9f7]">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-[#0b0e1a]/80 z-20 flex flex-col items-center justify-center text-[#e4e9f7] pointer-events-none">
          <Upload className="w-8 h-8 text-[#7c6cff] mb-2 animate-bounce" />
          <p className="text-sm font-medium">Drop code files to open them in new tabs</p>
        </div>
      )}

      {/* GitHub Import Modal */}
      {showGithubModal && (
        <div className="absolute inset-0 bg-black/60 z-30 flex items-center justify-center p-4">
          <div className="bg-[#121729] border border-[#2a3452] rounded-md p-4 w-full max-w-md shadow-xl">
            <h3 className="text-sm font-semibold text-[#e4e9f7] mb-1 flex items-center gap-2">
              <GithubIcon className="w-4 h-4 text-[#7c6cff]" />
              Import Public GitHub File
            </h3>
            <p className="text-xs text-[#8f9bb8] mb-3">
              Enter a link to a file on github.com. Only GitHub domains are allowed.
            </p>
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && githubUrl) void handleImportGithub();
              }}
              placeholder="https://github.com/owner/repo/blob/main/src/app.py"
              className="w-full bg-[#0b0e1a] border border-[#2a3452] rounded px-3 py-1.5 text-xs text-[#e4e9f7] focus:outline-none focus:border-[#7c6cff] mb-2 font-mono"
            />
            {githubError && <p className="text-xs text-[#ff5d73] mb-2">{githubError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  setShowGithubModal(false);
                  setGithubError("");
                }}
                className="px-3 py-1 text-xs text-[#8f9bb8] hover:text-[#e4e9f7] bg-[#1b2238] rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleImportGithub}
                disabled={!githubUrl}
                className="px-3 py-1 text-xs text-white bg-[#7c6cff] hover:bg-[#6a59f0] disabled:opacity-50 rounded"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Center Monaco Editor (one model per tab via `path`) */}
      <div className="flex-1 w-full h-full relative">
        <Editor
          height="100%"
          path={activeFile.id}
          language={activeFile.language}
          value={activeFile.code}
          theme={TRACELOOP_THEME}
          beforeMount={defineTraceLoopTheme}
          onChange={(val) => onCodeChange(val || "")}
          onMount={handleEditorDidMount}
          options={{
            fontSize: 13,
            fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
            lineNumbers: "on",
            glyphMargin: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            minimap: { enabled: false },
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: "all",
            renderWhitespace: "selection",
            tabSize: 4,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
};
