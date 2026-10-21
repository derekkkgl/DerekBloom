// GP's range buttons and the conversion from API candles to lightweight-charts series.
// Pure functions, so the time and gap handling can be tested without a browser.

import type { Candle } from "./api";

export type RangeSpec = {
  key: string; // button label
  range: string; // API ?range=
  interval: string; // API ?interval=
  bars: string; // how the legend names a bar, e.g. "weekly bars"
  intraday: boolean;
};

export const RANGES: RangeSpec[] = [
  { key: "1D", range: "1d", interval: "5m", bars: "5-minute bars", intraday: true },
  { key: "5D", range: "5d", interval: "30m", bars: "30-minute bars", intraday: true },
  { key: "1M", range: "1mo", interval: "1d", bars: "daily bars", intraday: false },
  { key: "3M", range: "3mo", interval: "1d", bars: "daily bars", intraday: false },
  { key: "6M", range: "6mo", interval: "1d", bars: "daily bars", intraday: false },
  { key: "YTD", range: "ytd", interval: "1d", bars: "daily bars", intraday: false },
  { key: "1Y", range: "1y", interval: "1d", bars: "daily bars", intraday: false },
  { key: "2Y", range: "2y", interval: "1wk", bars: "weekly bars", intraday: false },
  { key: "5Y", range: "5y", interval: "1wk", bars: "weekly bars", intraday: false },
  { key: "MAX", range: "max", interval: "1mo", bars: "monthly bars", intraday: false },
];

export const DEFAULT_RANGE = "1Y";

export function rangeSpec(key: string): RangeSpec {
  return RANGES.find((r) => r.key === key) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
}

export function chartPath(ticker: string, spec: RangeSpec): string {
  return `/api/chart/${encodeURIComponent(ticker)}?range=${spec.range}&interval=${spec.interval}`;
}

export const SMA_LINES = [
  { key: "sma20", label: "SMA 20", color: "#9A9285", dashed: false },
  { key: "sma50", label: "SMA 50", color: "#5E5A52", dashed: false },
  { key: "sma200", label: "SMA 200", color: "#141414", dashed: true },
] as const;

export type SmaKey = (typeof SMA_LINES)[number]["key"];

const UP_VOLUME = "rgba(22, 107, 48, 0.3)"; // --color-up at 30%
const DOWN_VOLUME = "rgba(180, 35, 24, 0.3)"; // --color-down at 30%
const DAY = 86_400;

/**
 * The time the chart plots a bar at. lightweight-charts labels every time as UTC, so:
 * - daily and longer bars snap to the nearest UTC midnight. Yahoo stamps them at local
 *   midnight of the exchange (Tokyo's 20 Oct is 19 Oct 15:00 UTC), and rounding gives
 *   back the trading date for any exchange within 12 hours of UTC.
 * - intraday bars shift by the viewer's UTC offset, so the axis reads in local time.
 */
export function chartTime(time: number, intraday: boolean): number {
  if (!intraday) return Math.round(time / DAY) * DAY;
  return time - new Date(time * 1000).getTimezoneOffset() * 60;
}

/** "20 Oct 2026" for daily bars, "20 Oct 2026 22:30" (local time) for intraday ones. */
export function barLabel(time: number, intraday: boolean): string {
  const shown = new Date(chartTime(time, intraday) * 1000); // already shifted, so read it as UTC
  const date = shown.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (!intraday) return date;
  return `${date} ${shown.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

type Point = { time: number; value: number };

export type SeriesData = {
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  volume: (Point & { color: string })[];
  sma: Record<SmaKey, Point[]>;
};

/** Split candles into the chart's series. Bars missing a price are skipped, never filled in. */
export function toSeries(candles: Candle[], intraday: boolean): SeriesData {
  const out: SeriesData = { candles: [], volume: [], sma: { sma20: [], sma50: [], sma200: [] } };
  let lastTime = -Infinity;
  for (const c of candles) {
    const time = chartTime(c.time, intraday);
    if (time <= lastTime) continue; // the chart needs strictly increasing times
    if (c.open === null || c.high === null || c.low === null) continue;
    lastTime = time;
    out.candles.push({ time, open: c.open, high: c.high, low: c.low, close: c.close });
    if (c.volume !== null) out.volume.push({ time, value: c.volume, color: c.close >= c.open ? UP_VOLUME : DOWN_VOLUME });
    for (const { key } of SMA_LINES) {
      const value = c[key];
      if (value !== null) out.sma[key].push({ time, value });
    }
  }
  return out;
}

/** The candle under the crosshair (by chart time), or the latest one when not hovering. */
export function candleAt(candles: Candle[], time: number | null, intraday: boolean): Candle | null {
  if (candles.length === 0) return null;
  if (time === null) return candles[candles.length - 1];
  return candles.find((c) => chartTime(c.time, intraday) === time) ?? null;
}
