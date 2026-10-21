"use client";

import { useState } from "react";
import { Chart } from "@/components/Chart";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { RangeRule } from "@/components/RangeRule";
import { Stat, StatList } from "@/components/StatList";
import { combineMeta, type Candle, type ChartData, type Quote } from "@/lib/api";
import { barLabel, candleAt, chartPath, DEFAULT_RANGE, RANGES, rangeSpec, SMA_LINES, type RangeSpec } from "@/lib/chart";
import { priceDecimals } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const QUOTE_POLL_MS = 60_000;
const INTRADAY_POLL_MS = 60_000; // backend caches intraday bars for 60s
const DAILY_POLL_MS = 600_000; // and daily bars for 10 min

export function PriceChart({ ticker = "", mnemonic, title }: FunctionScreenProps) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const spec = rangeSpec(rangeKey);
  const chart = useApi<ChartData>(chartPath(ticker, spec), spec.intraday ? INTRADAY_POLL_MS : DAILY_POLL_MS);
  const quote = useApi<Quote>(`/api/quote/${encodeURIComponent(ticker)}`, QUOTE_POLL_MS);

  const q = quote.data;
  const candles = chart.data?.candles ?? [];
  const currency = chart.data?.currency ?? q?.currency ?? null;
  const decimals = priceDecimals(q?.symbol, q?.price ?? candles.at(-1)?.close);
  const shown = candleAt(candles, hoverTime, spec.intraday);

  return (
    <Panel title={title} mnemonic={mnemonic} ticker={ticker} meta={combineMeta(chart.meta, quote.meta)}>
      <UpdateFailed error={chart.data ? chart.error : null} />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 pb-2">
        <div>
          <h1 className="font-serif text-[22px] leading-7 font-semibold">{q?.name ?? ticker}</h1>
          <div className="flex items-baseline gap-3">
            <Num value={q?.price} decimals={decimals} currency={currency ?? undefined} className="text-[32px] leading-10 font-medium" />
            <Num value={q?.change} change decimals={decimals} className="text-[15px]" />
            <Num value={q?.change_pct} change percent decimals={2} className="text-[15px]" />
          </div>
        </div>
        <p className="micro-label pb-1">
          Prices in {currency ?? "native currency"}
          {q?.exchange && <span> · {q.exchange}</span>}
        </p>
      </div>

      <RangeButtons active={spec.key} onSelect={setRangeKey} />
      <Legend candle={shown} spec={spec} decimals={decimals} />

      <div className="grid grid-cols-1 gap-x-4 border-t border-hairline md:grid-cols-[1fr_220px]">
        <div className="min-w-0 pt-1">
          {chart.data && candles.length > 0 ? (
            <Chart candles={candles} intraday={spec.intraday} decimals={decimals} fitKey={`${ticker}:${spec.key}`} onHover={setHoverTime} />
          ) : chart.data ? (
            <p className="py-8 text-[13px] text-muted">No bars for this range.</p>
          ) : (
            <div className="py-2">
              <Pending error={chart.error} rows={10} />
            </div>
          )}
        </div>
        <aside className="pt-2 md:border-l md:border-hairline md:pl-4">
          <KeyStats quote={q} last={candles.at(-1) ?? null} decimals={decimals} spec={spec} />
          {!q && quote.error && <p className="mt-2 text-[12px] text-muted">Quote: {quote.error.message}</p>}
        </aside>
      </div>
    </Panel>
  );
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
function Legend({ candle, spec, decimals }: { candle: Candle | null; spec: RangeSpec; decimals: number }) {
  return (
    <div className="flex min-h-6 flex-wrap items-baseline gap-x-3 py-1 font-mono text-[11px] tabular-nums" aria-live="off">
      <span className="text-muted">{candle ? barLabel(candle.time, spec.intraday) : "—"}</span>
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

function KeyStats({ quote, last, decimals, spec }: { quote: Quote | null; last: Candle | null; decimals: number; spec: RangeSpec }) {
  return (
    <StatList title="Key stats">
      <Stat label="Open"><Num value={quote?.open} decimals={decimals} /></Stat>
      <Stat label="Day high"><Num value={quote?.day_high} decimals={decimals} /></Stat>
      <Stat label="Day low"><Num value={quote?.day_low} decimals={decimals} /></Stat>
      <Stat label="Prev close"><Num value={quote?.prev_close} decimals={decimals} /></Stat>
      <Stat label="Volume"><Num value={quote?.volume} compact /></Stat>
      <Stat label="Market cap"><Num value={quote?.market_cap} compact /></Stat>
      <div className="border-b border-hairline py-1.5 text-[13px]">
        <p className="mb-1 text-muted">52-week range</p>
        <RangeRule low={quote?.year_low ?? null} high={quote?.year_high ?? null} value={quote?.price ?? null} format={{ decimals }} label="52-week range" />
      </div>
      {SMA_LINES.map((line) => (
        <Stat key={line.key} label={line.label}><Num value={last?.[line.key]} decimals={decimals} /></Stat>
      ))}
      <p className="pt-1 text-[11px] text-muted">Averages on {spec.bars}.</p>
    </StatList>
  );
}
