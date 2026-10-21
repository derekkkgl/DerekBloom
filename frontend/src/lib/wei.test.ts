import { describe, expect, it } from "vitest";
import type { WeiRow } from "./api";
import { weiCells } from "./wei";

function row(symbol: string, extra: Partial<WeiRow> = {}): WeiRow {
  return {
    symbol, name: symbol, region: "Americas", currency: "USD", last: 100, change: 1, change_pct: 1, ytd_pct: 10,
    last_date: "2026-10-20", status: "open", ...extra,
  };
}

describe("weiCells", () => {
  it("shows the 10Y yield change in basis points and no % change", () => {
    const cells = weiCells(row("^TNX", { last: 4.1, change: -0.019 }));
    expect(cells.change).toBeCloseTo(-1.9);
    expect(cells.changeFormat).toEqual({ decimals: 1, suffix: "bp" });
    expect(cells.changePct).toBeNull();
    expect(cells.ytdPct).toBeNull();
  });

  it("uses house decimals: whole dollars for BTC, 3 for USD/PHP", () => {
    expect(weiCells(row("BTC-USD")).last.decimals).toBe(0);
    expect(weiCells(row("PHP=X")).last.decimals).toBe(3);
    expect(weiCells(row("^GSPC")).changePct).toBe(1);
  });

  it("passes a missing change through as null", () => {
    expect(weiCells(row("^TNX", { change: null })).change).toBeNull();
  });
});
