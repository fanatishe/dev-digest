"use client";

import React from "react";
import { SEV, type Severity } from "./tokens";
import { Icon } from "../icons";

/**
 * Minimal finding shape the popover renders. Both the shared `FindingPreview`
 * (PR-list rollup) and the full `FindingRecord` (per-run findings) are
 * structurally assignable to it, so callers pass either directly. Kept local so
 * the design-system layer stays decoupled from `@devdigest/shared`.
 */
export type PopoverFinding = {
  id: string;
  severity: Severity;
  title: string;
  file: string;
  start_line: number;
  confidence: number;
  rationale?: string | null;
};

const CLOSE_DELAY_MS = 120;

/**
 * Hover popover listing a set of findings. The anchor (`children`) shows the
 * popup on hover/focus; because the popup is a DOM descendant of the wrapper,
 * moving the pointer onto it does not fire `mouseleave`, so it stays open. A
 * short close delay covers the gap between anchor and popup.
 *
 * No popover primitive existed before this — the rest of the app used native
 * `title` tooltips, which can't render rich content or survive pointer travel.
 */
export function FindingsPopover({
  children,
  findings,
  header,
  confidenceLabel = "conf",
  align = "left",
}: {
  children: React.ReactNode;
  findings: PopoverFinding[];
  /** Header text, e.g. "6 findings" (i18n resolved by the caller). */
  header: string;
  /** Suffix after the confidence percentage, e.g. "conf". */
  confidenceLabel?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const hasFindings = findings.length > 0;

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && hasFindings && (
        <div role="tooltip" style={{ ...popStyle, ...(align === "right" ? { right: 0 } : { left: 0 }) }}>
          <div style={headerStyle}>
            <Icon.ListChecks size={13} style={{ color: "var(--text-muted)" }} />
            <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>{header}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {findings.map((f) => {
              const sev = SEV[f.severity] ?? SEV.SUGGESTION;
              const I = Icon[sev.icon];
              const pct = Math.round(f.confidence * 100);
              const confColor =
                pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
              return (
                <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <I size={13} style={{ color: sev.c, flexShrink: 0 }} />
                    <span style={titleStyle}>{f.title}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 20 }}>
                    <span className="mono" style={fileStyle}>
                      {f.file}:{f.start_line}
                    </span>
                    <span className="mono tnum" style={confStyle}>
                      <span
                        style={{ width: 6, height: 6, borderRadius: 99, background: confColor, flexShrink: 0 }}
                      />
                      {pct}% {confidenceLabel}
                    </span>
                  </div>
                  {f.rationale && <div style={rationaleStyle}>{f.rationale}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const popStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  zIndex: 50,
  width: 340,
  maxWidth: "min(340px, 90vw)",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
  textAlign: "left",
  cursor: "default",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 12,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fileStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--accent-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 200,
};

const confStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "var(--text-muted)",
  flexShrink: 0,
};

const rationaleStyle: React.CSSProperties = {
  paddingLeft: 20,
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
