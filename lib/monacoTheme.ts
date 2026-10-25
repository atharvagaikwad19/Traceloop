import type { Monaco } from "@monaco-editor/react";

export const TRACELOOP_THEME = "traceloop-dark";

/** Registers the TraceLoop editor theme (call from Monaco's beforeMount). */
export function defineTraceLoopTheme(monaco: Monaco) {
  monaco.editor.defineTheme(TRACELOOP_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0b0e1a",
      "editor.foreground": "#e4e9f7",
      "editorGutter.background": "#0b0e1a",
      "editor.lineHighlightBackground": "#121729",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#7c6cff40",
      "editor.inactiveSelectionBackground": "#7c6cff22",
      "editorLineNumber.foreground": "#4b5878",
      "editorLineNumber.activeForeground": "#b6c0dc",
      "editorCursor.foreground": "#14b8a6",
      "editorIndentGuide.background1": "#1b2238",
      "editorWidget.background": "#121729",
      "editorWidget.border": "#2a3452",
      "scrollbarSlider.background": "#2a345266",
      "diffEditor.insertedTextBackground": "#34d39926",
      "diffEditor.removedTextBackground": "#ff5d7326",
    },
  });
}
