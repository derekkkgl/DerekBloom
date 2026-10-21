import { describe, expect, it } from "vitest";
import type { Candle, Quote } from "./api";
import { barLabel, candleAt, chartPath, chartTime, quoteInPhp, rangeSpec, RANGES, toSeries, yearRange } from "./chart";

function candle(time: number, close: number, extra: Partial<Candle> = {}): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 100, sma20: null, sma50: null, sma200: null, close_time: null, ...extra };
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
    expect(chartPath("BTC", rangeSpec("1Y"), "PHP")).toBe("/api/chart/BTC?range=1y&interval=1d&currency=PHP");
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

describe("barLabel (in Manila time)", () => {
  const utc = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) / 1000;
  const fetchedAt = utc(2026, 10, 21, 14, 41) * 1000; // 22:41 in Manila

  it("shows date and local time for intraday bars", () => {
    expect(barLabel(candle(utc(2026, 10, 20, 14, 30), 1), rangeSpec("1D"), null, fetchedAt)).toBe("20 Oct 2026 22:30");
  });

  it("shows when a past daily bar closed, flagging a next-day close", () => {
    const nvda = candle(utc(2026, 10, 20, 4), 1, { close_time: utc(2026, 10, 20, 20) }); // 16:00 New York
    expect(barLabel(nvda, rangeSpec("1Y"), null, fetchedAt)).toBe("Tue 20 Oct 2026 · closed 04:00 Manila (21 Oct)");
    const tokyo = candle(utc(2026, 10, 19, 15), 1, { close_time: utc(2026, 10, 20, 6, 30) }); // 15:30 Tokyo
    expect(barLabel(tokyo, rangeSpec("1Y"), null, fetchedAt)).toBe("Tue 20 Oct 2026 · closed 14:30 Manila");
  });

  it("shows the last trade for a bar still trading", () => {
    const today = candle(utc(2026, 10, 21), 1, { close_time: utc(2026, 10, 22) }); // crypto, closes at 08:00 Manila tomorrow
    const label = barLabel(today, rangeSpec("1M"), "2026-10-21T14:40:00Z", fetchedAt);
    expect(label).toBe("Wed 21 Oct 2026 · last trade 22:40 Manila");
    expect(barLabel(today, rangeSpec("1M"), null, fetchedAt)).toBe("Wed 21 Oct 2026 · still trading");
  });

  it("names the week or month and the day it closed", () => {
    const week = candle(utc(2026, 10, 12, 4), 1, { close_time: utc(2026, 10, 16, 20) });
    expect(barLabel(week, rangeSpec("2Y"), null, fetchedAt)).toBe("Week of 12 Oct 2026 · closed Sat 17 Oct 04:00 Manila");
    const month = candle(utc(2026, 9, 1, 4), 1, { close_time: utc(2026, 9, 30, 20) });
    expect(barLabel(month, rangeSpec("MAX"), null, fetchedAt)).toBe("Sept 2026 · closed Thu 1 Oct 04:00 Manila");
  });

  it("falls back to the date when the close time is unknown", () => {
    expect(barLabel(candle(utc(2026, 10, 20, 4), 1), rangeSpec("1Y"), null, fetchedAt)).toBe("Tue 20 Oct 2026");
  });
});

describe("quoteInPhp", () => {
  const usd = { price: 110, prev_close: 100, change: 10, open: 101, day_high: 112, day_low: 99, market_cap: 1000 } as Quote;
  const fx = { price: 60, prev_close: 50, change: 10 } as Quote;

  it("uses today's rate for today's prices and yesterday's for the previous close", () => {
    const php = quoteInPhp(usd, fx);
    expect(php.price).toBe(6600);
    expect(php.prevClose).toBe(5000);
    expect(php.change).toBe(1600);
    expect(php.changePct).toBeCloseTo(32); // 6600 / 5000 - 1: the asset's move plus the peso's
    expect([php.open, php.dayHigh, php.dayLow, php.marketCap]).toEqual([6060, 6720, 5940, 60000]);
  });

  it("leaves a figure empty when either side is missing", () => {
    expect(quoteInPhp({ ...usd, open: null }, fx).open).toBeNull();
    expect(quoteInPhp(usd, { ...fx, price: null }).price).toBeNull();
  });
});

describe("yearRange", () => {
  it("takes the low and high of the last 52 weeks only", () => {
    const now = 400 * 86_400;
    const candles = [candle(10 * 86_400, 1000), candle(100 * 86_400, 10), candle(300 * 86_400, 20)];
    expect(yearRange(candles, now)).toEqual({ low: 8, high: 21 });
    expect(yearRange([], now)).toEqual({ low: null, high: null });
  });
});
