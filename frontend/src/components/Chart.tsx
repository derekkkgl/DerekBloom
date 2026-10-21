"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/api";
import { SMA_LINES, toSeries, type SmaKey } from "@/lib/chart";

// Broadsheet colors (globals.css). Canvas drawing can't read Tailwind classes, so they're repeated here.
export const PAPER = "#F3EEE3";
export const INK = "#141414";
export const MUTED = "#5E5A52";
export const HAIRLINE = "rgba(20, 20, 20, 0.16)";
const UP = "#166B30";
const DOWN = "#B42318";

type Series = {
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  sma: Record<SmaKey, ISeriesApi<"Line">>;
};

type ChartProps = {
  candles: Candle[];
  intraday: boolean;
  /** Price decimals for the axis and crosshair label (house style: whole units for BTC). */
  decimals: number;
  /** The view refits when this changes (a new range), but not when polling refreshes the same range. */
  fitKey: string;
  /** Called with the chart time under the crosshair, or null when the pointer leaves. */
  onHover: (time: number | null) => void;
  height?: number;
};

/**
 * Candles, volume, and SMA 20/50/200 drawn with TradingView lightweight-charts (v5 API).
 * The library is loaded in the browser only, after the first paint.
 */
export function Chart({ candles, intraday, decimals, fitKey, onHover, height = 420 }: ChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Series | null>(null);
  const hoverRef = useRef(onHover);
  const fittedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hoverRef.current = onHover;
  });

  // Create the chart once.
  useEffect(() => {
    let disposed = false;
    const el = container.current;
    if (!el) return;

    import("lightweight-charts").then((lc) => {
      if (disposed) return;
      const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim() || "monospace";
      const chart = lc.createChart(el, {
        autoSize: true,
        layout: { background: { type: lc.ColorType.Solid, color: PAPER }, textColor: MUTED, fontFamily: mono, fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: HAIRLINE } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.24 } },
        timeScale: { borderVisible: false, rightOffset: 2 },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: MUTED, labelBackgroundColor: INK },
          horzLine: { color: MUTED, labelBackgroundColor: INK },
        },
      });

      const volume = chart.addSeries(lc.HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        borderVisible: false,
        priceLineColor: MUTED,
      });

      const sma = Object.fromEntries(
        SMA_LINES.map((line) => [
          line.key,
          chart.addSeries(lc.LineSeries, {
            color: line.color,
            lineWidth: 1,
            lineStyle: line.dashed ? lc.LineStyle.Dashed : lc.LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          }),
        ]),
      ) as Series["sma"];

      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        hoverRef.current(typeof param.time === "number" ? param.time : null);
      });

      chartRef.current = chart;
      seriesRef.current = { candles: candleSeries, volume, sma };
      setReady(true);
    });

    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed data whenever it (or the bar size) changes.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ready || !chart || !series) return;

    const data = toSeries(candles, intraday);
    const priceFormat = { type: "price" as const, precision: decimals, minMove: 10 ** -decimals };
    const ts = (time: number) => time as UTCTimestamp;

    series.candles.applyOptions({ priceFormat });
    series.candles.setData(data.candles.map((c) => ({ ...c, time: ts(c.time) })));
    series.volume.setData(data.volume.map((v) => ({ ...v, time: ts(v.time) })));
    for (const { key } of SMA_LINES) {
      series.sma[key].applyOptions({ priceFormat });
      series.sma[key].setData(data.sma[key].map((p) => ({ ...p, time: ts(p.time) })));
    }
    chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    if (fittedRef.current !== fitKey && data.candles.length > 0) {
      chart.timeScale().fitContent();
      fittedRef.current = fitKey;
    }
  }, [ready, candles, intraday, decimals, fitKey]);

  return <div ref={container} style={{ height }} className="w-full" role="img" aria-label="Candlestick price chart with volume and moving averages" />;
}
