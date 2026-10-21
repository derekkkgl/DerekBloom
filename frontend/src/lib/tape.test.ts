import { describe, expect, it } from "vitest";
import type { CryptoGlobal, WeiRow } from "./api";
import { buildTape, phpChangePct, TAPE_SPECS } from "./tape";

function row(symbol: string, last: number | null, change: number | null, change_pct: number | null): WeiRow {
  return { symbol, name: symbol, region: "x", currency: "USD", last, change, change_pct, ytd_pct: null, last_date: null, status: "open" };
}

const BTC = row("BTC-USD", 110, 10, 10); // up 10% in USD, from 100
const FX = row("PHP=X", 60, -2, -3.2258); // peso strengthened from 62 to 60
const TNX = row("^TNX", 4.12, 0.03, 0.73);
const GLOBAL = { btc_dominance_pct: 59.56 } as CryptoGlobal;

const cell = (cells: ReturnType<typeof buildTape>, key: string) => cells.find((c) => c.key === key)!;

describe("phpChangePct", () => {
  it("combines the coin's move and the peso's move", () => {
    // 100 * 62 = 6200 yesterday, 110 * 60 = 6600 today
    expect(phpChangePct(BTC, FX)).toBeCloseTo((6600 / 6200 - 1) * 100, 6);
  });

  it("is null when any input is missing", () => {
    expect(phpChangePct(row("BTC-USD", 110, null, null), FX)).toBeNull();
    expect(phpChangePct(BTC, row("PHP=X", null, null, null))).toBeNull();
  });
});

describe("buildTape", () => {
  it("has the 12 tape items in order", () => {
    expect(buildTape(null, null, "USD").map((c) => c.label)).toEqual(TAPE_SPECS.map((s) => s.label));
    expect(TAPE_SPECS).toHaveLength(12);
  });

  it("prices USD assets in dollars by default", () => {
    const btc = cell(buildTape([BTC, FX], null, "USD"), "btc");
    expect(btc.value).toBe(110);
    expect(btc.format.currency).toBe("USD");
    expect(btc.change).toBe(10);
  });

  it("converts USD assets to pesos with the live rate", () => {
    const btc = cell(buildTape([BTC, FX], null, "PHP"), "btc");
    expect(btc.value).toBe(6600);
    expect(btc.format.currency).toBe("PHP");
    expect(btc.change).toBeCloseTo(6.4516, 3);
  });

  it("stays in dollars when no USD/PHP rate is available", () => {
    const btc = cell(buildTape([BTC], null, "PHP"), "btc");
    expect(btc.value).toBe(110);
    expect(btc.format.currency).toBe("USD");
  });

  it("leaves indices and the FX rate unconverted", () => {
    const cells = buildTape([row("^GSPC", 7712.57, 21.8, 0.28), FX], null, "PHP");
    expect(cell(cells, "spx").value).toBe(7712.57);
    expect(cell(cells, "spx").format.currency).toBeUndefined();
    expect(cell(cells, "usdphp").value).toBe(60);
  });

  it("shows the 10Y change in basis points", () => {
    const tnx = cell(buildTape([TNX], null, "USD"), "us10y");
    expect(tnx.change).toBeCloseTo(3);
    expect(tnx.changeFormat.suffix).toBe("bp");
  });

  it("takes BTC dominance from CoinGecko with no change figure", () => {
    const d = cell(buildTape(null, GLOBAL, "USD"), "btcd");
    expect(d.value).toBe(59.56);
    expect(d.hasChange).toBe(false);
    expect(d.source).toBe("global");
  });

  it("marks everything missing when sources fail", () => {
    expect(buildTape(null, null, "PHP").every((c) => c.value === null)).toBe(true);
  });
});
