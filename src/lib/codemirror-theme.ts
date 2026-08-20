// EditorView is re-exported by @uiw/react-codemirror (no direct @codemirror/view dep).
import { EditorView } from "@uiw/react-codemirror";

/**
 * Surge Config editor themes (v0.2.1, T12).
 *
 * All colors resolve through the app's semantic CSS variables, so the editor
 * follows Light/Dark/System switching with zero JS — the .dark class swaps
 * the vars and CodeMirror re-paints.
 *
 * Palette (dark): section headers / keys = blue-ish, values = white,
 * comments = gray, accent = --accent, errors = --danger.
 */

const SHARED_STYLES: Record<string, Record<string, string>> = {
  "&": {
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    fontSize: "12px",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.55",
  },
  ".cm-content": {
    padding: "4px 0",
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-tertiary)",
    border: "none",
    paddingRight: "4px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.6em",
    paddingLeft: "12px",
    paddingRight: "10px",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--surface)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--accent) 28%, transparent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-matchingBracket, .cm-nonmatchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--accent) 18%, transparent)",
  },
  ".cm-comment": {
    color: "var(--text-tertiary)",
    fontStyle: "italic",
  },
  ".cm-string": {
    color: "var(--chart-download)",
  },
  ".cm-number, .cm-atom, .cm-bool": {
    color: "var(--warning)",
  },
  ".cm-keyword": {
    color: "var(--accent)",
  },
  ".cm-property, .cm-attribute, .cm-variable-2": {
    color: "var(--text-primary)",
  },
  ".cm-error": {
    color: "var(--danger)",
    textDecoration: "underline dotted var(--danger)",
  },
  "&.cm-focused": {
    outline: "none",
  },
};

export const surgeLightTheme = EditorView.theme(SHARED_STYLES, { dark: false });
export const surgeDarkTheme = EditorView.theme(SHARED_STYLES, { dark: true });
