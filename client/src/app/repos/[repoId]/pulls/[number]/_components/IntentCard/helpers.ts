/* Pure derivations for the Intent card. Nothing here touches React or the network —
   the card computes these DURING RENDER from the record it is handed; none of it is
   ever mirrored into state. */

export interface TokenSavings {
  /** Locale-formatted counts, e.g. "12,431" / "890". */
  full: string;
  headers: string;
  /** Whole-percent saving, e.g. 93. */
  pct: number;
}

/**
 * Tokens saved by feeding the classifier hunk HEADERS instead of the full diff.
 * Derived on read — `tokens_saved` is deliberately never stored (see the plan).
 * Returns null when either count is missing (pre-existing rows) or nonsensical.
 */
export function tokenSavings(
  tokensFull: number | null | undefined,
  tokensHeaders: number | null | undefined,
): TokenSavings | null {
  if (tokensFull == null || tokensHeaders == null) return null;
  if (tokensFull <= 0 || tokensHeaders < 0 || tokensHeaders > tokensFull) return null;
  return {
    full: tokensFull.toLocaleString("en-US"),
    headers: tokensHeaders.toLocaleString("en-US"),
    pct: Math.round(((tokensFull - tokensHeaders) / tokensFull) * 100),
  };
}
