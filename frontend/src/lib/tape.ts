// What the ticker tape shows, built from /api/wei and /api/crypto/global.
// Pure function so the PHP conversion can be tested without a browser.

import type { CryptoGlobal, WeiRow } from "./api";
import type { DisplayCurrency } from "./currency";
import type { FormatOptions } from "./format";

type Kind =
  | "index" // points, no currency
  | "usd" // a USD price: follows the PHP/USD toggle
  | "fx" // an exchange rate
  | "yield" // a yield in %, change in basis points
  | "dominance"; // BTC share of total crypto market cap, from CoinGecko

type TapeSpec = { key: string; label: string; kind: Kind; decimals: number; symbol?: string };

const FX_SYMBOL = "PHP=X"; // USD/PHP: how many pesos one dollar buys

export const TAPE_SPECS: TapeSpec[] = [
  { key: "spx", label: "S&P 500", kind: "index", decimals: 2, symbol: "^GSPC" },
  { key: "ndx", label: "Nasdaq", kind: "index", decimals: 2, symbol: "^IXIC" },
  { key: "nky", label: "Nikkei", kind: "index", decimals: 2, symbol: "^N225" },
  { key: "dax", label: "DAX", kind: "index", decimals: 2, symbol: "^GDAXI" },
  { key: "btc", label: "BTC", kind: "usd", decimals: 0, symbol: "BTC-USD" },
  { key: "eth", label: "ETH", kind: "usd", decimals: 2, symbol: "ETH-USD" },
  { key: "btcd", label: "BTC dom.", kind: "dominance", decimals: 1 },
  { key: "dxy", label: "DXY", kind: "index", decimals: 2, symbol: "DX-Y.NYB" },
  { key: "us10y", label: "US 10Y", kind: "yield", decimals: 3, symbol: "^TNX" },
  { key: "gold", label: "Gold", kind: "usd", decimals: 2, symbol: "GC=F" },
  { key: "oil", label: "Oil", kind: "usd", decimals: 2, symbol: "CL=F" },
  { key: "usdphp", label: "USD/PHP", kind: "fx", decimals: 3, symbol: FX_SYMBOL },
];

export type TapeCell = {
  key: string;
  label: string;
  source: "wei" | "global";
  value: number | null;
  format: FormatOptions;
  change: number | null;
  changeFormat: FormatOptions;
  hasChange: boolean; // false when the source has no change figure at all (BTC dominance)
};

const PCT: FormatOptions = { percent: true, decimals: 2 };

function num(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Day change of a USD price seen in pesos. Both the price and the peso moved, so
 * compare today's price x rate with yesterday's price x rate.
 */
export function phpChangePct(usd: Pick<WeiRow, "last" | "change">, fx: Pick<WeiRow, "last" | "change">): number | null {
  const { last, change } = usd;
  const { last: rate, change: rateChange } = fx;
  if (!num(last) || !num(change) || !num(rate) || !num(rateChange)) return null;
  const before = (last - change) * (rate - rateChange);
  if (before === 0) return null;
  return ((last * rate) / before - 1) * 100;
}

export function buildTape(rows: WeiRow[] | null, global: CryptoGlobal | null, currency: DisplayCurrency): TapeCell[] {
  const bySymbol = new Map((rows ?? []).map((r) => [r.symbol, r]));
  const fx = bySymbol.get(FX_SYMBOL);

  return TAPE_SPECS.map((spec): TapeCell => {
    const base = { key: spec.key, label: spec.label, source: "wei" as const, hasChange: true };

    if (spec.kind === "dominance") {
      return {
        ...base,
        source: "global",
        value: global?.btc_dominance_pct ?? null,
        format: { percent: true, decimals: spec.decimals },
        change: null,
        changeFormat: PCT,
        hasChange: false,
      };
    }

    const row = spec.symbol ? bySymbol.get(spec.symbol) : undefined;
    const last = row?.last ?? null;

    if (spec.kind === "usd") {
      // Show pesos only when a live USD/PHP rate is on hand; otherwise stay honest in dollars.
      if (currency === "PHP" && row && fx && num(last) && num(fx.last)) {
        return {
          ...base,
          value: last * fx.last,
          format: { currency: "PHP", decimals: spec.decimals },
          change: phpChangePct(row, fx),
          changeFormat: PCT,
        };
      }
      return {
        ...base,
        value: last,
        format: { currency: "USD", decimals: spec.decimals },
        change: row?.change_pct ?? null,
        changeFormat: PCT,
      };
    }

    if (spec.kind === "yield") {
      // Yahoo's ^TNX is the yield in percent; its change is in percentage points, 1pt = 100bp.
      const change = row?.change;
      return {
        ...base,
        value: last,
        format: { percent: true, decimals: spec.decimals },
        change: num(change) ? change * 100 : null,
        changeFormat: { decimals: 1, suffix: "bp" },
      };
    }

    return {
      ...base,
      value: last,
      format: { decimals: spec.decimals },
      change: row?.change_pct ?? null,
      changeFormat: PCT,
    };
  });
}
