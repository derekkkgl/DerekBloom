// How each WEI row prints: most rows are prices or index points with % changes;
// the US 10Y is a yield, so its change is in basis points and a % change means nothing.

import type { WeiRow } from "./api";
import type { FormatOptions } from "./format";

export type WeiCells = {
  last: FormatOptions;
  change: number | null;
  changeFormat: FormatOptions;
  changePct: number | null;
  ytdPct: number | null;
};

const YIELDS = new Set(["^TNX"]);
const DECIMALS: Record<string, number> = { "BTC-USD": 0, "PHP=X": 3, "^TNX": 3 };

export function weiCells(row: WeiRow): WeiCells {
  const decimals = DECIMALS[row.symbol] ?? 2;
  if (YIELDS.has(row.symbol)) {
    // Yahoo's ^TNX is the yield in percent; its change is in percentage points, 1pt = 100bp.
    return {
      last: { percent: true, decimals },
      change: row.change === null ? null : row.change * 100,
      changeFormat: { decimals: 1, suffix: "bp" },
      changePct: null,
      ytdPct: null,
    };
  }
  return {
    last: { decimals },
    change: row.change,
    changeFormat: { decimals },
    changePct: row.change_pct,
    ytdPct: row.ytd_pct,
  };
}
