import { describe, expect, it } from "vitest";
import type { TickerMatch } from "./api";
import { filterMatches, HOLDABLE_TYPES, matchLabel, searchPath } from "./search";

const m = (ticker: string, type: string | null, source: TickerMatch["source"] = "yahoo", exchange: string | null = "NYSE"): TickerMatch => ({
  ticker, symbol: ticker, name: null, type, exchange, source,
});

describe("ticker search helpers", () => {
  it("keeps only what the portfolio can hold, in order", () => {
    const results = [m("B", "EQUITY"), m("BTC", "CRYPTOCURRENCY"), m("BZ=F", "FUTURE"), m("^BVSP", "INDEX"), m("BND", "ETF")];
    expect(filterMatches(results, HOLDABLE_TYPES).map((r) => r.ticker)).toEqual(["B", "BTC", "BND"]);
    expect(filterMatches(results).length).toBe(5);
    expect(filterMatches(results, undefined, 2).length).toBe(2);
  });

  it("labels each suggestion", () => {
    expect(matchLabel(m("VOO", "ETF", "yahoo", "NYSEArca"))).toBe("ETF · NYSEArca");
    expect(matchLabel(m("BTC", "CRYPTOCURRENCY", "alias", "CCC"))).toBe("Crypto");
    expect(matchLabel(m("VOO", "ETF", "yours"))).toBe("ETF · yours");
  });

  it("builds the search path", () => {
    expect(searchPath("BTC-USD", true)).toBe("/api/search?q=BTC-USD");
    expect(searchPath("^N", false)).toBe("/api/search?q=%5EN&yahoo=false");
  });
});
