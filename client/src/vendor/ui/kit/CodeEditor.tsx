import React from "react";

/**
 * CodeEditor — a controlled, line-numbered text editor with lightweight markdown
 * highlighting. A transparent-caret <textarea> is layered over a highlighted <pre>
 * and a line-number gutter; the three scroll in lockstep. Self-contained (no syntax
 * lib / CDN) — the highlighter is a per-line regex pass rendered as React nodes, so
 * there's no HTML injection. Drop-in for <Textarea> (same value/onChange/rows/mono).
 */

const LINE = 20; // px line-height — shared by gutter, pre, and textarea so rows align
const PAD_Y = 12;
const PAD_X = 12;
const FONT = 12.5;

/** Highlight one line as React nodes. Order matters: fence → heading → list → plain. */
function highlightLine(line: string): React.ReactNode {
  if (line === "") return " "; // keep empty lines at full line-height
  // Fenced code delimiter
  if (/^\s*```/.test(line)) return <span style={{ color: "var(--text-muted)" }}>{line}</span>;
  // ATX heading (# … ######)
  if (/^#{1,6}\s/.test(line)) {
    return <span style={{ color: "var(--accent)", fontWeight: 700 }}>{line}</span>;
  }
  // List item — tint just the marker, leave the text normal
  const li = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/.exec(line);
  if (li) {
    return (
      <>
        {li[1]}
        <span style={{ color: "var(--accent)" }}>{li[2]}</span>
        {li[3]}
        {li[4]}
      </>
    );
  }
  // Blockquote
  if (/^\s*>/.test(line)) return <span style={{ color: "var(--text-secondary)" }}>{line}</span>;
  return line;
}

export function CodeEditor({
  value,
  onChange,
  placeholder,
  rows = 16,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const preRef = React.useRef<HTMLPreElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const lines = value.length === 0 ? [""] : value.split("\n");
  const height = rows * LINE + PAD_Y * 2;

  // Keep the highlight layer and gutter aligned with the textarea's scroll.
  const onScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  const layer: React.CSSProperties = {
    margin: 0,
    position: "absolute",
    inset: 0,
    padding: `${PAD_Y}px ${PAD_X}px`,
    fontSize: FONT,
    lineHeight: `${LINE}px`,
    whiteSpace: "pre",
    overflow: "hidden",
    border: "none",
    tabSize: 2,
  };

  return (
    <div
      style={{
        display: "flex",
        height,
        background: "var(--bg-primary)",
        fontSize: FONT,
        lineHeight: `${LINE}px`,
      }}
    >
      {/* line-number gutter */}
      <div
        ref={gutterRef}
        aria-hidden
        className="mono"
        style={{
          flexShrink: 0,
          overflow: "hidden",
          padding: `${PAD_Y}px 10px`,
          textAlign: "right",
          color: "var(--text-muted)",
          userSelect: "none",
          borderRight: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        {lines.map((_, i) => (
          <div key={i} style={{ height: LINE }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* stacked highlight layer + editable textarea */}
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <pre ref={preRef} aria-hidden className="mono" style={{ ...layer, color: "var(--text-primary)" }}>
          {value.length === 0 && placeholder ? (
            <div style={{ height: LINE, color: "var(--text-muted)" }}>{placeholder}</div>
          ) : (
            lines.map((ln, i) => (
              <div key={i} style={{ height: LINE }}>
                {highlightLine(ln)}
              </div>
            ))
          )}
        </pre>
        <textarea
          ref={taRef}
          className="mono"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onScroll={onScroll}
          wrap="off"
          spellCheck={false}
          aria-label={ariaLabel}
          style={{
            ...layer,
            width: "100%",
            height: "100%",
            resize: "none",
            overflow: "auto",
            background: "transparent",
            color: "transparent",
            caretColor: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}
