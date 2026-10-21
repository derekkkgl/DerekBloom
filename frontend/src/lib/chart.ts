// GP's range buttons and the conversion from API candles to lightweight-charts series.
// Pure functions, so the time and gap handling can be tested without a browser.

import type { Candle, Quote } from "./api";
import { phpChangePct } from "./tape";

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

export function chartPath(ticker: string, spec: RangeSpec, currency?: "PHP"): string {
  const base = `/api/chart/${encodeURIComponent(ticker)}?range=${spec.range}&interval=${spec.interval}`;
  return currency ? `${base}&currency=${currency}` : base;
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

/** The viewer's city for time labels: "Asia/Manila" -> "Manila". */
export function localZoneName(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  return zone.split("/").pop()?.replace(/_/g, " ") || "local time";
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
const HOUR_MINUTE: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function fmt(date: Date, opts: Intl.DateTimeFormatOptions, utc = false): string {
  return date.toLocaleString("en-GB", utc ? { ...opts, timeZone: "UTC" } : opts);
}

/** "Fri 17 Oct": built in two parts, because ICU adds a comma after the weekday only sometimes. */
function dayName(date: Date, utc = false, year = false): string {
  return `${fmt(date, { weekday: "short" }, utc)} ${fmt(date, year ? { ...DAY_MONTH, year: "numeric" } : DAY_MONTH, utc)}`;
}

/**
 * The hover legend's date and time for a bar.
 *   intraday: "21 Oct 2026 22:30" in local time
 *   daily:    "Mon 20 Oct 2026 · closed 04:00 Manila (21 Oct)"
 *   weekly:   "Week of 13 Oct 2026 · closed Fri 17 Oct 04:00 Manila"
 *   monthly:  "Oct 2026 · closed Fri 30 Oct 04:00 Manila"
 * A bar that hadn't closed when the data was fetched shows its last trade instead.
 */
export function barLabel(candle: Candle, spec: RangeSpec, lastTrade: string | null, fetchedAt: number): string {
  const shown = new Date(chartTime(candle.time, spec.intraday) * 1000); // already shifted, so read it as UTC
  if (spec.intraday) {
    return `${fmt(shown, { ...DAY_MONTH, year: "numeric" }, true)} ${fmt(shown, HOUR_MINUTE, true)}`;
  }

  const period =
    spec.interval === "1wk"
      ? `Week of ${fmt(shown, { ...DAY_MONTH, year: "numeric" }, true)}`
      : spec.interval === "1mo"
        ? fmt(shown, { month: "short", year: "numeric" }, true)
        : dayName(shown, true, true);
  if (candle.close_time === null) return period;

  const zone = localZoneName();
  const daily = spec.interval === "1d";
  const at = (moment: Date) => {
    const clock = fmt(moment, HOUR_MINUTE);
    if (!daily) return `${dayName(moment)} ${clock} ${zone}`;
    const otherDay = fmt(moment, DAY_MONTH) !== fmt(shown, DAY_MONTH, true);
    return `${clock} ${zone}${otherDay ? ` (${fmt(moment, DAY_MONTH)})` : ""}`;
  };

  const closesAt = new Date(candle.close_time * 1000);
  if (closesAt.getTime() <= fetchedAt) return `${period} · closed ${at(closesAt)}`;
  const trade = lastTrade ? new Date(lastTrade) : null;
  return trade && !Number.isNaN(trade.getTime()) ? `${period} · last trade ${at(trade)}` : `${period} · still trading`;
}

/** The day's figures of a USD quote in pesos: today's prices at today's rate, yesterday's close at yesterday's. */
export function quoteInPhp(q: Quote, fx: Quote) {
  const rate = fx.price;
  const times = (value: number | null, by: number | null) => (value !== null && by !== null ? value * by : null);
  const price = times(q.price, rate);
  const prevClose = times(q.prev_close, fx.prev_close);
  return {
    price,
    prevClose,
    change: price !== null && prevClose !== null ? price - prevClose : null,
    changePct: phpChangePct({ last: q.price, change: q.change }, { last: fx.price, change: fx.change }),
    open: times(q.open, rate),
    dayHigh: times(q.day_high, rate),
    dayLow: times(q.day_low, rate),
    marketCap: times(q.market_cap, rate),
  };
}

/** Lowest low and highest high of the past 52 weeks, from daily bars. */
export function yearRange(candles: Candle[], nowSeconds: number): { low: number | null; high: number | null } {
  const recent = candles.filter((c) => c.time >= nowSeconds - 365 * 86_400);
  const lows = recent.map((c) => c.low).filter((v): v is number => v !== null);
  const highs = recent.map((c) => c.high).filter((v): v is number => v !== null);
  return { low: lows.length ? Math.min(...lows) : null, high: highs.length ? Math.max(...highs) : null };
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
