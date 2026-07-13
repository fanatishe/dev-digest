/**
 * Severity → CSS colour token. The single source of truth for the client.
 *
 * Promoted out of `FindingCard/constants.ts` once a second, unrelated consumer
 * appeared (`components/diff-viewer`, the SHARED ring, which may never import
 * from a route's `_components/`). Three copies had already drifted apart —
 * one guarded the lookup, one mapped SUGGESTION to `var(--accent)`.
 *
 * Values are design-system CSS-var tokens (never hex), matching
 * `vendor/ui/primitives/tokens.ts`.
 */

/**
 * Note the `as const`: it makes an arbitrary-string index (`TOKENS[wireValue]`)
 * a type error, so `sevToken()` is mechanically the only way to read this map.
 * The key set is intentionally wider than the contract's 3-value `Severity` —
 * the UI `Severity` from `@devdigest/ui` also carries `INFO`.
 */
export const SEVERITY_TOKEN = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
} as const satisfies Record<string, string>;

/** Colour for a severity we do not recognise. */
export const SEVERITY_TOKEN_FALLBACK = "var(--text-muted)";

/**
 * Resolve a severity to its colour token.
 *
 * `severity` arrives over the wire, so the lookup is guarded to OWN properties:
 * a bare `SEVERITY_TOKEN[severity]` with a severity of `"constructor"` (or
 * `"toString"`, `"valueOf"`, …) resolves UP THE PROTOTYPE CHAIN and yields a
 * *function* — truthy, so a `??` fallback never fires — which would then be
 * handed to React as a CSSProperties value. Always resolve through this fn.
 */
export function sevToken(severity: string): string {
  if (!Object.prototype.hasOwnProperty.call(SEVERITY_TOKEN, severity)) {
    return SEVERITY_TOKEN_FALLBACK;
  }
  return (SEVERITY_TOKEN as Record<string, string>)[severity] ?? SEVERITY_TOKEN_FALLBACK;
}
