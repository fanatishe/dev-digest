/* DateRangeChip — preset look-back window selector for the per-agent detail page.

   Presentational only: it renders the preset buttons and reports the chosen ISO
   `{from,to}` via `onChange`. The OWNER (AgentEvalDetailView) writes both keys to
   the URL in a single `router.replace` — a multi-key URL update must not be two
   calls (client INSIGHTS 2026-07-13). Copy lives in a colocated constant because
   WP-G owns no writable eval i18n namespace (see constants.ts). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { COPY } from "./constants";
import { RANGE_PRESETS, activePreset, rangeForPreset, type RangePresetDays } from "./helpers";
import { s } from "./styles";

export interface DateRange {
  from?: string;
  to?: string;
}

export function DateRangeChip({
  from,
  onChange,
}: {
  from?: string;
  onChange: (range: DateRange) => void;
}) {
  const active = activePreset(from);
  const select = (days: RangePresetDays) => onChange(rangeForPreset(days));
  return (
    <div style={s.wrap} role="group" aria-label={COPY.ariaLabel}>
      <Icon.Calendar size={13} style={s.icon} />
      {RANGE_PRESETS.map((days) => {
        const isActive = active === days;
        return (
          <button
            key={days}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(days)}
            style={{ ...s.chip, ...(isActive ? s.chipActive : null) }}
          >
            {COPY.preset(days)}
          </button>
        );
      })}
    </div>
  );
}

export default DateRangeChip;
