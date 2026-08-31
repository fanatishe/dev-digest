/* DateRangeChip/helpers.ts — pure date-range math for the per-agent detail filter.

   The chip works in whole-day presets but emits ISO instants on the wire, matching
   the `?from&to` query params the detail endpoints accept (AC-29). No I/O, no React. */

/** The selectable look-back windows, in days. The middle one is the default. */
export const RANGE_PRESETS = [7, 30, 90] as const;
export type RangePresetDays = (typeof RANGE_PRESETS)[number];

/** Default look-back window when no `?from&to` is present (spec AC-29: last 30 days). */
export const DEFAULT_RANGE_DAYS: RangePresetDays = 30;

const DAY_MS = 86_400_000;

/** An ISO instant `days` before `now` (defaults to the current time). */
export function isoDaysAgo(days: number, now: number = Date.now()): string {
  return new Date(now - days * DAY_MS).toISOString();
}

/** The `{from,to}` ISO range for a preset window ending at `now`. */
export function rangeForPreset(
  days: number,
  now: number = Date.now(),
): { from: string; to: string } {
  return { from: isoDaysAgo(days, now), to: new Date(now).toISOString() };
}

/**
 * Which preset the current `from` corresponds to, for highlighting the active chip.
 * No `from` → the default window; otherwise the preset whose length is closest to the
 * elapsed days, or `null` when `from` is unparseable / far from any preset.
 */
export function activePreset(
  from: string | null | undefined,
  now: number = Date.now(),
): RangePresetDays | null {
  if (!from) return DEFAULT_RANGE_DAYS;
  const ms = Date.parse(from);
  if (Number.isNaN(ms)) return null;
  const elapsedDays = Math.round((now - ms) / DAY_MS);
  let best: RangePresetDays | null = null;
  let bestDiff = Infinity;
  for (const preset of RANGE_PRESETS) {
    const diff = Math.abs(preset - elapsedDays);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset;
    }
  }
  // Only treat it as a known preset when it is reasonably close (within 3 days).
  return bestDiff <= 3 ? best : null;
}
