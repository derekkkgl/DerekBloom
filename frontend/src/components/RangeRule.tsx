import { formatNumber, type FormatOptions } from "@/lib/format";

/**
 * Low and high with a hairline between them and a short ink tick at the current price:
 * where today sits in the 52-week range. The numbers carry the meaning; the rule is a glance.
 */
export function RangeRule({
  low,
  high,
  value,
  format = {},
  label,
}: {
  low: number | null;
  high: number | null;
  value: number | null;
  format?: FormatOptions;
  label: string;
}) {
  const known = low !== null && high !== null && value !== null && high > low;
  const position = known ? Math.min(Math.max((value - low) / (high - low), 0), 1) * 100 : null;

  return (
    <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums" aria-label={label}>
      <span>{formatNumber(low, format)}</span>
      <span className="relative h-3 flex-1" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
        {position !== null && <span className="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${position}%` }} />}
      </span>
      <span>{formatNumber(high, format)}</span>
    </div>
  );
}
