// Ticker search helpers shared by Look up and the TXN asset box. Pure, so they're tested directly.

import type { TickerMatch } from "./api";

/** What the portfolio can hold: the rest (indices, futures, currencies) only make sense in Look up. */
export const HOLDABLE_TYPES = ["CRYPTOCURRENCY", "EQUITY", "ETF", "MUTUALFUND"];

/** Matches of the wanted types (all types when none are given), at most `limit`. */
export function filterMatches(results: TickerMatch[], types?: string[], limit = 8): TickerMatch[] {
  const wanted = types ? results.filter((r) => r.type !== null && types.includes(r.type)) : results;
  return wanted.slice(0, limit);
}

const TYPE_LABELS: Record<string, string> = {
  CRYPTOCURRENCY: "Crypto",
  EQUITY: "Stock",
  ETF: "ETF",
  MUTUALFUND: "Fund",
  INDEX: "Index",
  CURRENCY: "FX",
  FUTURE: "Future",
};

/** "ETF · NYSEArca" or "Crypto": the small label on the right of a suggestion. */
export function matchLabel(match: TickerMatch): string {
  const kind = match.type ? (TYPE_LABELS[match.type] ?? match.type) : null;
  const place = match.source === "yours" ? "yours" : match.type === "CRYPTOCURRENCY" ? null : match.exchange;
  return [kind, place].filter(Boolean).join(" · ");
}

export function searchPath(query: string, yahoo: boolean): string {
  return `/api/search?q=${encodeURIComponent(query)}${yahoo ? "" : "&yahoo=false"}`;
}
