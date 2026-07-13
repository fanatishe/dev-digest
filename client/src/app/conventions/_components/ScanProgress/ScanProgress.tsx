/* ScanProgress — what the Conventions screen shows WHILE an extract is running.
   A vertical checklist of the extractor's four real pipeline stages, ticked off from
   streamed SSE events (never a timer), plus the server's own log lines and an elapsed
   clock. The `analyze` stage is the slow one, so naming it — "Analyzing 12 file(s) with
   gpt-5.4…" — is the whole point: the user can see WHAT is taking the time. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SCAN_STAGES, type ScanState, type ScanStageStatus } from "@/lib/hooks/conventions";
import { s } from "./styles";

/** mm:ss since the scan began — a cheap, honest signal that we're still alive. */
function useElapsed(): string {
  const [start] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function StageRow({ status, label }: { status: ScanStageStatus; label: string }) {
  return (
    <div style={s.stage(status)}>
      <span style={s.stageIcon(status)}>
        {status === "done" ? (
          <Icon.Check size={14} />
        ) : status === "active" ? (
          <Icon.RefreshCw size={14} style={{ animation: "ddspin 1s linear infinite" }} />
        ) : (
          // No hollow-circle icon in the registry — a bordered dot reads the same.
          <span style={s.pendingDot} />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

export function ScanProgress({ scan, repoName }: { scan: ScanState; repoName: string }) {
  const t = useTranslations("conventions");
  const elapsed = useElapsed();

  // Newest line last; show the tail so the box doesn't grow without bound.
  const lines = scan.lines.slice(-6);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.pulse} />
        <span style={s.title}>{t("scan.title", { repo: repoName })}</span>
        <div style={{ flex: 1 }} />
        <span className="mono tnum" style={s.elapsed}>
          {elapsed}
        </span>
      </div>

      <div style={s.stages}>
        {SCAN_STAGES.map((stage) => (
          <StageRow key={stage} status={scan.stages[stage]} label={t(`scan.stage.${stage}`)} />
        ))}
      </div>

      {lines.length > 0 && (
        <div style={s.log}>
          {lines.map((l, i) => (
            <div key={`${l.t}-${i}`} style={s.line(l.kind === "error")}>
              <span className="mono" style={s.lineTime}>
                {l.t}
              </span>
              <span className="mono">{l.msg}</span>
            </div>
          ))}
        </div>
      )}

      {scan.error && <div style={s.error}>{scan.error}</div>}
    </div>
  );
}
