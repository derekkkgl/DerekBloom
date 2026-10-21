// Helpers for the world-markets screens: exchange-rate decimals, IMAP tiles, and the WMAP grid.

import type { HeatTile } from "@/components/HeatMap";
import type { ImapGroup, WorldMarket } from "./api";
import { money } from "./crypto";
import { commandHref } from "./command";
import type { DisplayCurrency } from "./currency";
import { formatNumber } from "./format";

/** Exchange rates need more decimals than prices: 157.97 yen, 1.4105 Canadian dollars, 0.00473 pounds. */
export function rateDecimals(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 2;
  const abs = Math.abs(value);
  if (abs >= 100) return 2;
  if (abs >= 0.01) return 4;
  return 6;
}

/**
 * Heat-map tiles for one IMAP group. Sectors are sized by their share of the S&P 500, world ETFs by
 * fund assets, and your list by the square root of size (so VT isn't a sliver next to NVIDIA).
 * Rows without a size are left off the map; the table still lists them.
 */
export function imapTiles(group: ImapGroup, currency: DisplayCurrency, names: Record<string, string> = {}): HeatTile[] {
  const tiles: HeatTile[] = [];
  for (const row of group.rows) {
    const href = commandHref({ mnemonic: "DES", ticker: row.input ?? row.symbol });
    const change = row.change_pct;
    if (group.id === "sectors") {
      if (!row.weight_pct) continue;
      const detail = `${row.symbol} · ${formatNumber(row.weight_pct, { decimals: 1, percent: true })}`;
      tiles.push({ key: row.symbol, label: row.name ?? row.symbol, weight: row.weight_pct, change, detail, href });
      continue;
    }
    if (!row.size_usd) continue;
    const size = money(row.size_usd, row.size_php, currency);
    const sizeText = formatNumber(size.value, { compact: true, currency: size.currency });
    if (group.id === "world") {
      tiles.push({ key: row.symbol, label: row.name ?? row.symbol, weight: row.size_usd, change, detail: `${row.symbol} · ${sizeText}`, href });
    } else {
      const label = row.input ?? row.symbol;
      const name = names[label] ?? row.name;
      tiles.push({ key: row.symbol, label, weight: Math.sqrt(row.size_usd), change, detail: name ? `${name} · ${sizeText}` : sizeText, href });
    }
  }
  return tiles;
}

/** The WMAP grid's size: one column and row past the furthest market. */
export function gridSize(markets: Pick<WorldMarket, "col" | "row">[]): { cols: number; rows: number } {
  return {
    cols: markets.reduce((most, m) => Math.max(most, m.col + 1), 0),
    rows: markets.reduce((most, m) => Math.max(most, m.row + 1), 0),
  };
}
