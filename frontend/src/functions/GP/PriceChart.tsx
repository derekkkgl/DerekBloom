"use client";

import { useState } from "react";
import { Chart } from "@/components/Chart";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { RangeRule } from "@/components/RangeRule";
import { Stat, StatList } from "@/components/StatList";
import { combineMeta, type Candle, type ChartData, type Quote } from "@/lib/api";
import { barLabel, candleAt, chartPath, DEFAULT_RANGE, quoteInPhp, RANGES, rangeSpec, SMA_LINES, yearRange, type RangeSpec } from "@/lib/chart";
import { useDisplayCurrency } from "@/lib/currency";
import { priceDecimals } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const QUOTE_POLL_MS = 60_000;
const INTRADAY_POLL_MS = 60_000; // backend caches intraday bars for 60s
const DAILY_POLL_MS = 600_000; // and daily bars for 10 min
const FX_QUOTE = `/api/quote/${encodeURIComponent("PHP=X")}`;
const YEAR = rangeSpec("1Y");

/** What the hero and key stats show, in whichever currency the chart is in. */
type View = {
  currency: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
  volume: number | null;
  marketCap: number | null;
  yearLow: number | null;
  yearHigh: number | null;
};

export function PriceChart({ ticker = "", mnemonic, title }: FunctionScreenProps) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [displayCurrency] = useDisplayCurrency();
  const wantPhp = displayCurrency === "PHP";
  const spec = rangeSpec(rangeKey);

  const chart = useApi<ChartData>(chartPath(ticker, spec, wantPhp ? "PHP" : undefined), spec.intraday ? INTRADAY_POLL_MS : DAILY_POLL_MS);
  const quote = useApi<Quote>(`/api/quote/${encodeURIComponent(ticker)}`, QUOTE_POLL_MS);
  const converted = chart.data?.converted ?? false;
  const fx = useApi<Quote>(converted ? FX_QUOTE : null, QUOTE_POLL_MS);
  // The 52-week range in pesos comes from a year of daily bars, each at its own day's rate.
  const year = useApi<ChartData>(converted && spec.key !== YEAR.key ? chartPath(ticker, YEAR, "PHP") : null, DAILY_POLL_MS);

  const q = quote.data;
  const candles = chart.data?.candles ?? [];
  const fetchedAt = chart.meta ? Date.parse(chart.meta.as_of) : 0;
  const view = buildView(q, converted, fx.data, spec.key === YEAR.key ? chart.data : year.data, fetchedAt);
  const decimals = priceDecimals(q?.symbol, view.price ?? candles.at(-1)?.close);
  const shown = candleAt(candles, hoverTime, spec.intraday);
  const note = chart.data?.conversion_note ?? null;

  return (
    <Panel title={title} mnemonic={mnemonic} ticker={ticker} meta={combineMeta(chart.meta, quote.meta, converted ? fx.meta : null)}>
      <UpdateFailed error={chart.data ? chart.error : null} />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pb-2">
        <div>
          <h1 className="font-serif text-[22px] leading-7 font-semibold">{q?.name ?? ticker}</h1>
          <div className="flex items-baseline gap-3">
            <Num value={view.price} decimals={decimals} currency={view.currency ?? undefined} className="text-[32px] leading-10 font-medium" />
            <Num value={view.change} change decimals={decimals} className="text-[15px]" />
            <Num value={view.changePct} change percent decimals={2} className="text-[15px]" />
          </div>
        </div>
        <p className="micro-label pb-1">
          {converted ? "Prices in PHP at each bar's USD/PHP rate" : `Prices in ${view.currency ?? "native currency"}`}
          {q?.exchange && <span> · {q.exchange}</span>}
        </p>
      </div>
      {wantPhp && note && !converted && <p className="pb-1 text-[12px] text-muted">Not shown in pesos: {note}</p>}

      <RangeButtons active={spec.key} onSelect={setRangeKey} />
      <Legend
        candle={shown}
        label={shown ? barLabel(shown, spec, chart.data?.last_trade ?? null, fetchedAt) : "—"}
        spec={spec}
        decimals={decimals}
      />

      <div className="grid grid-cols-1 gap-x-4 border-t border-hairline md:grid-cols-[1fr_220px]">
        <div className="min-w-0 pt-1">
          {chart.data && candles.length > 0 ? (
            <Chart
              candles={candles}
              intraday={spec.intraday}
              decimals={decimals}
              fitKey={`${ticker}:${spec.key}:${chart.data.currency}`}
              onHover={setHoverTime}
            />
          ) : chart.data ? (
            <p className="py-8 text-[13px] text-muted">No bars for this range.</p>
          ) : (
            <div className="py-2">
              <Pending error={chart.error} rows={10} />
            </div>
          )}
          {converted && note && <p className="pt-1 text-[11px] text-muted">{note}</p>}
        </div>
        <aside className="pt-2 md:border-l md:border-hairline md:pl-4">
          <KeyStats view={view} last={candles.at(-1) ?? null} decimals={decimals} spec={spec} />
          {!q && quote.error && <p className="mt-2 text-[12px] text-muted">Quote: {quote.error.message}</p>}
          {converted && !fx.data && fx.error && <p className="mt-2 text-[12px] text-muted">USD/PHP rate: {fx.error.message}</p>}
        </aside>
      </div>
    </Panel>
  );
}

/**
 * Native: the quote as is. In pesos: today's figures at today's rate and the previous close
 * at yesterday's (see quoteInPhp), the 52-week range from peso daily bars. Until the rate
 * arrives the peso figures stay empty rather than showing dollars under a peso label.
 */
function buildView(q: Quote | null, converted: boolean, fx: Quote | null, yearBars: ChartData | null, fetchedAt: number): View {
  if (!converted) {
    return {
      currency: q?.currency ?? null,
      price: q?.price ?? null,
      change: q?.change ?? null,
      changePct: q?.change_pct ?? null,
      open: q?.open ?? null,
      dayHigh: q?.day_high ?? null,
      dayLow: q?.day_low ?? null,
      prevClose: q?.prev_close ?? null,
      volume: q?.volume ?? null,
      marketCap: q?.market_cap ?? null,
      yearLow: q?.year_low ?? null,
      yearHigh: q?.year_high ?? null,
    };
  }
  const php = q && fx ? quoteInPhp(q, fx) : null;
  const range = yearBars?.converted ? yearRange(yearBars.candles, fetchedAt / 1000) : { low: null, high: null };
  return {
    currency: "PHP",
    price: php?.price ?? null,
    change: php?.change ?? null,
    changePct: php?.changePct ?? null,
    open: php?.open ?? null,
    dayHigh: php?.dayHigh ?? null,
    dayLow: php?.dayLow ?? null,
    prevClose: php?.prevClose ?? null,
    volume: q?.volume ?? null,
    marketCap: php?.marketCap ?? null,
    yearLow: range.low,
    yearHigh: range.high,
  };
}

function RangeButtons({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  return (
    <div role="group" aria-label="Chart range" className="flex flex-wrap gap-x-3 pb-1 font-mono text-[12px]">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={r.key === active}
          onClick={() => onSelect(r.key)}
          className={`border-b-2 pb-0.5 ${r.key === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {r.key}
        </button>
      ))}
    </div>
  );
}

/** The hovered bar's OHLC and SMA values, or the latest bar when the pointer is off the chart. */
function Legend({ candle, label, spec, decimals }: { candle: Candle | null; label: string; spec: RangeSpec; decimals: number }) {
  return (
    <div className="flex min-h-6 flex-wrap items-baseline gap-x-3 py-1 font-mono text-[11px] tabular-nums" aria-live="off">
      <span className="text-muted">{label}</span>
      {(["open", "high", "low", "close"] as const).map((field) => (
        <span key={field}>
          <span className="text-muted">{field[0].toUpperCase()} </span>
          <Num value={candle?.[field]} decimals={decimals} />
        </span>
      ))}
      <span>
        <span className="text-muted">Vol </span>
        <Num value={candle?.volume} compact />
      </span>
      {SMA_LINES.map((line) => (
        <span key={line.key} className="flex items-baseline gap-1">
          <span
            aria-hidden="true"
            className="inline-block w-3 translate-y-[-3px] border-t-2"
            style={{ borderColor: line.color, borderTopStyle: line.dashed ? "dashed" : "solid" }}
          />
          <span className="text-muted">{line.label}</span>
          <Num value={candle?.[line.key]} decimals={decimals} />
        </span>
      ))}
      <span className="text-muted">· {spec.bars}</span>
    </div>
  );
}

function KeyStats({ view, last, decimals, spec }: { view: View; last: Candle | null; decimals: number; spec: RangeSpec }) {
  return (
    <StatList title="Key stats">
      <Stat label="Open"><Num value={view.open} decimals={decimals} /></Stat>
      <Stat label="Day high"><Num value={view.dayHigh} decimals={decimals} /></Stat>
      <Stat label="Day low"><Num value={view.dayLow} decimals={decimals} /></Stat>
      <Stat label="Prev close"><Num value={view.prevClose} decimals={decimals} /></Stat>
      <Stat label="Volume"><Num value={view.volume} compact /></Stat>
      <Stat label="Market cap"><Num value={view.marketCap} compact currency={view.currency ?? undefined} /></Stat>
      <div className="border-b border-hairline py-1.5 text-[13px]">
        <p className="mb-1 text-muted">52-week range</p>
        <RangeRule low={view.yearLow} high={view.yearHigh} value={view.price} format={{ decimals }} label="52-week range" />
      </div>
      {SMA_LINES.map((line) => (
        <Stat key={line.key} label={line.label}><Num value={last?.[line.key]} decimals={decimals} /></Stat>
      ))}
      <p className="pt-1 text-[11px] text-muted">Averages on {spec.bars}.</p>
    </StatList>
  );
}
