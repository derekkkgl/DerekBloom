import { describe, expect, it } from "vitest";
import type { Candle } from "./api";
import { barLabel, candleAt, chartPath, chartTime, rangeSpec, RANGES, toSeries } from "./chart";

function candle(time: number, close: number, extra: Partial<Candle> = {}): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 100, sma20: null, sma50: null, sma200: null, ...extra };
}

describe("ranges", () => {
  it("maps each button to a bar size the backend accepts", () => {
    expect(RANGES.map((r) => `${r.key}:${r.interval}`)).toEqual([
      "1D:5m", "5D:30m", "1M:1d", "3M:1d", "6M:1d", "YTD:1d", "1Y:1d", "2Y:1wk", "5Y:1wk", "MAX:1mo",
    ]);
  });

  it("falls back to 1Y for an unknown key and builds the API path", () => {
    expect(rangeSpec("nope").key).toBe("1Y");
    expect(chartPath("^GSPC", rangeSpec("5D"))).toBe("/api/chart/%5EGSPC?range=5d&interval=30m");
  });
});

describe("chartTime", () => {
  it("snaps daily bars to the trading date for any exchange", () => {
    const tokyo20Oct = Date.UTC(2026, 9, 19, 15) / 1000; // 20 Oct 00:00 in Tokyo
    const newYork20Oct = Date.UTC(2026, 9, 20, 4) / 1000; // 20 Oct 00:00 in New York
    const day = Date.UTC(2026, 9, 20) / 1000;
    expect(chartTime(tokyo20Oct, false)).toBe(day);
    expect(chartTime(newYork20Oct, false)).toBe(day);
  });

  it("shifts intraday bars into the viewer's local time", () => {
    const t = Date.UTC(2026, 9, 20, 14, 30) / 1000;
    expect(chartTime(t, true)).toBe(t - new Date(t * 1000).getTimezoneOffset() * 60);
  });
});

describe("toSeries", () => {
  const day = 86_400;
  const candles = [
    candle(day * 1, 10, { sma20: 9 }),
    candle(day * 2, 12, { open: null }), // no open: skipped, not invented
    candle(day * 3, 8, { volume: null, sma20: 9.5, sma200: 7 }),
    candle(day * 3 + 60, 9), // snaps onto day 3 again: duplicate time dropped
  ];
  const s = toSeries(candles, false);

  it("skips bars with a missing price and duplicate times", () => {
    expect(s.candles.map((c) => c.close)).toEqual([10, 8]);
  });

  it("colors volume by the bar's direction and skips missing volume", () => {
    expect(s.volume).toEqual([{ time: day, value: 100, color: "rgba(22, 107, 48, 0.3)" }]);
    const down = toSeries([candle(day, 5, { open: 6 })], false);
    expect(down.volume[0].color).toBe("rgba(180, 35, 24, 0.3)");
  });

  it("keeps only the SMA points that exist", () => {
    expect(s.sma.sma20).toEqual([{ time: day, value: 9 }, { time: day * 3, value: 9.5 }]);
    expect(s.sma.sma50).toEqual([]);
    expect(s.sma.sma200).toEqual([{ time: day * 3, value: 7 }]);
  });
});

describe("candleAt", () => {
  const candles = [candle(86_400, 10), candle(2 * 86_400, 11)];

  it("returns the latest candle when not hovering", () => {
    expect(candleAt(candles, null, false)?.close).toBe(11);
    expect(candleAt([], null, false)).toBeNull();
  });

  it("finds the hovered candle by its chart time", () => {
    expect(candleAt(candles, 86_400, false)?.close).toBe(10);
    expect(candleAt(candles, 5, false)).toBeNull();
  });
});

describe("barLabel", () => {
  it("labels daily bars by trading date and intraday bars with local time", () => {
    expect(barLabel(Date.UTC(2026, 9, 19, 15) / 1000, false)).toBe("20 Oct 2026");
    const t = Date.UTC(2026, 9, 20, 14, 30) / 1000;
    const local = new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    expect(barLabel(t, true)).toMatch(new RegExp(`${local}$`));
  });
});
