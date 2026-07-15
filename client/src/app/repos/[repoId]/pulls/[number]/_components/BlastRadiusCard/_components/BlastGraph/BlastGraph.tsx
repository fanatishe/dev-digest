/* BlastGraph — the same data as BlastTree, drawn as changed symbol → callers → endpoints.

   Hand-rolled SVG, no graph library. The topology is FIXED — always exactly three
   columns, always left-to-right — so a force-directed layout engine would be tens of
   kilobytes of dependency to compute three `x` coordinates we already know. It would
   also move nodes around between renders, which is the opposite of what a reviewer
   scanning for "what does this touch" wants.

   The graph is a SUMMARY view: it caps callers and endpoints per symbol (see GRAPH in
   ../../constants). The tree is the exhaustive one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { GRAPH } from "../../constants";
import { basename, ellipsize, graphableSymbols } from "../../helpers";
import { GRAPH_COLORS, s } from "../../styles";

interface BlastGraphProps {
  blast: BlastRadius;
}

interface Node {
  id: string;
  label: string;
  title: string;
  x: number;
  y: number;
  color: string;
}

export function BlastGraph({ blast }: BlastGraphProps) {
  const t = useTranslations("blast");
  const symbols = graphableSymbols(blast);

  if (symbols.length === 0) {
    return <p style={s.muted}>{t("graph.empty")}</p>;
  }

  const nodes: Node[] = [];
  const edges: { from: string; to: string }[] = [];
  const [symbolX, callerX, endpointX] = GRAPH.columnX;
  const step = GRAPH.nodeHeight + GRAPH.rowGap;

  // Column 2 and 3 are deduped ACROSS symbols: one file calling two changed symbols is
  // one node with two edges, not two nodes. That is what makes the fan-in legible.
  const callerRow = new Map<string, number>();
  const endpointRow = new Map<string, number>();
  let nextCallerRow = 0;
  let nextEndpointRow = 0;

  symbols.forEach((impact, i) => {
    const symbolId = `sym:${impact.symbol}`;
    nodes.push({
      id: symbolId,
      label: ellipsize(`${impact.symbol}()`, 18),
      title: impact.symbol,
      x: symbolX,
      y: GRAPH.paddingY + i * step,
      color: GRAPH_COLORS.symbol,
    });

    for (const caller of impact.callers.slice(0, GRAPH.maxCallersPerSymbol)) {
      const id = `call:${caller.file}`;
      if (!callerRow.has(id)) {
        callerRow.set(id, nextCallerRow++);
        nodes.push({
          id,
          label: ellipsize(caller.name || basename(caller.file), 18),
          title: `${caller.file}:${caller.line}`,
          x: callerX,
          y: GRAPH.paddingY + callerRow.get(id)! * step,
          color: GRAPH_COLORS.caller,
        });
      }
      edges.push({ from: symbolId, to: id });
    }

    for (const endpoint of impact.endpoints_affected.slice(0, GRAPH.maxEndpoints)) {
      const id = `ep:${endpoint}`;
      if (!endpointRow.has(id)) {
        endpointRow.set(id, nextEndpointRow++);
        nodes.push({
          id,
          label: ellipsize(endpoint, 20),
          title: endpoint,
          x: endpointX,
          y: GRAPH.paddingY + endpointRow.get(id)! * step,
          color: GRAPH_COLORS.endpoint,
        });
      }
      // The endpoint hangs off the CALLERS, not the symbol — but with the callers
      // deduped there is no single edge source, so anchor it to the symbol. The
      // claim being drawn is "changing this symbol can reach this endpoint", which
      // is exactly what the server computed.
      edges.push({ from: symbolId, to: id });
    }
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rows = Math.max(symbols.length, nextCallerRow, nextEndpointRow, 1);
  const height = GRAPH.paddingY * 2 + rows * step;

  return (
    <>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${GRAPH.width} ${height}`}
        style={s.svg}
      >
        {edges.map((e, i) => {
          const from = byId.get(e.from);
          const to = byId.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + GRAPH.columnWidth;
          const y1 = from.y + GRAPH.nodeHeight / 2;
          const x2 = to.x;
          const y2 = to.y + GRAPH.nodeHeight / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}->${e.to}-${i}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}

        {nodes.map((n) => (
          <g key={n.id}>
            <title>{n.title}</title>
            <rect
              x={n.x}
              y={n.y}
              width={GRAPH.columnWidth}
              height={GRAPH.nodeHeight}
              rx={5}
              fill="var(--bg-elevated)"
              stroke={n.color}
              strokeWidth={1}
            />
            <text
              x={n.x + GRAPH.columnWidth / 2}
              y={n.y + GRAPH.nodeHeight / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontFamily="var(--font-mono)"
              fill="var(--text-secondary)"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>

      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot(GRAPH_COLORS.symbol)} aria-hidden />
          {t("graph.legendSymbol")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot(GRAPH_COLORS.caller)} aria-hidden />
          {t("graph.legendCaller")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot(GRAPH_COLORS.endpoint)} aria-hidden />
          {t("graph.legendEndpoint")}
        </span>
      </div>
    </>
  );
}
