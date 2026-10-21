"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time } from "lightweight-charts";
import { formatNumber } from "@/lib/format";
import { HAIRLINE, INK, MUTED, PAPER } from "./Chart";

export type Line = {
  label: string;
  color: string;
  dashed?: boolean;
  data: { time: string; value: number }[]; // time: YYYY-MM-DD
};

/**
 * Ink lines on paper (lightweight-charts v5): hairline horizontal grid, no borders, mono axis text.
 * A legend above names each line with a swatch and shows its value at the hovered date.
 */
export function LineChart({ lines, currency, decimals = 0, height = 260, label, daily = false, compact = false }: {
  lines: Line[];
  currency?: string;
  decimals?: number;
  height?: number;
  label: string;
  /** Daily data: the hover legend shows the day, not just the month. */
  daily?: boolean;
  /** Hover values with K/M/B suffixes, for big totals. */
  compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const [built, setBuilt] = useState(0); // bumps each time a chart is created, so data is fed to it
  const [hover, setHover] = useState<{ date: string; values: (number | null)[] } | null>(null);
  const count = lines.length;
  const dashed = lines.map((l) => Boolean(l.dashed)).join(",");
  const colors = lines.map((l) => l.color).join(",");

  // Create the chart (again only if the set of lines changes shape).
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
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.04 } },
        timeScale: { borderVisible: false },
        crosshair: {
          mode: lc.CrosshairMode.Magnet,
          vertLine: { color: MUTED, labelBackgroundColor: INK },
          horzLine: { color: MUTED, labelBackgroundColor: INK },
        },
        handleScroll: false,
        handleScale: false,
      });
      const styles = dashed.split(",");
      const palette = colors.split(",");
      seriesRef.current = Array.from({ length: count }, (_, i) =>
        chart.addSeries(lc.LineSeries, {
          color: palette[i],
          lineWidth: 2,
          lineStyle: styles[i] === "true" ? lc.LineStyle.Dashed : lc.LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
        }),
      );
      chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
        if (!param.time) return setHover(null);
        const values = seriesRef.current.map((s) => {
          const point = param.seriesData.get(s);
          return point && "value" in point ? point.value : null;
        });
        setHover({ date: timeText(param.time, daily), values });
      });
      chartRef.current = chart;
      setBuilt((n) => n + 1);
    });

    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = [];
    };
  }, [count, dashed, colors, daily]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!built || !chart) return;
    const priceFormat = { type: "price" as const, precision: decimals, minMove: 10 ** -decimals };
    // Axis labels with separators and K/M suffixes, like every other number on the page.
    const big = (v: number) => Math.abs(v) >= 10_000;
    chart.applyOptions({ localization: { priceFormatter: (v: number) => formatNumber(v, { compact: big(v), decimals: big(v) ? (Math.abs(v) >= 1e6 ? 1 : 0) : decimals }) } });
    lines.forEach((line, i) => {
      const series = seriesRef.current[i];
      series?.applyOptions({ priceFormat });
      series?.setData(line.data);
    });
    chart.timeScale().fitContent();
  }, [built, lines, decimals]);

  const format = (v: number | null | undefined) => formatNumber(v, { decimals, currency, compact });
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-5 pb-1 font-mono text-[11px] text-muted">
        <span>{hover?.date ?? (daily ? "Hover the chart for a day's value" : "Hover the chart for a month's values")}</span>
        {lines.map((line, i) => (
          <span key={line.label} className="flex items-baseline gap-1.5">
            <span aria-hidden="true" className="inline-block w-4 border-t-2" style={{ borderColor: line.color, borderTopStyle: line.dashed ? "dashed" : "solid" }} />
            <span className="font-sans">{line.label}</span>
            {hover && <span className="text-ink">{format(hover.values[i])}</span>}
          </span>
        ))}
      </div>
      <div ref={container} style={{ height }} className="w-full" role="img" aria-label={label} />
    </div>
  );
}

function timeText(time: Time, daily: boolean): string {
  const length = daily ? 10 : 7;
  if (typeof time === "string") return time.slice(0, length);
  if (typeof time === "number") return new Date(time * 1000).toISOString().slice(0, length);
  const month = `${time.year}-${String(time.month).padStart(2, "0")}`;
  return daily ? `${month}-${String(time.day).padStart(2, "0")}` : month;
}
