import { direction, formatNumber, type FormatOptions } from "@/lib/format";

type NumProps = FormatOptions & {
  value: number | null | undefined;
  /** A change value: colored up/down with a ▲/▼ arrow and an explicit sign. */
  change?: boolean;
  className?: string;
};

/**
 * Every number on screen: monospace, tabular digits, right-aligned.
 * Changes are never shown by color alone; they also get a sign and an arrow.
 */
export function Num({ value, change = false, className = "", ...opts }: NumProps) {
  const text = formatNumber(value, change ? { signed: true, ...opts } : opts);
  const dir = change ? direction(value, opts.decimals ?? 2) : 0;
  const tone = dir > 0 ? "text-up" : dir < 0 ? "text-down" : "";

  return (
    <span className={`font-mono tabular-nums text-right whitespace-nowrap ${tone} ${className}`}>
      {dir !== 0 && (
        <span aria-hidden="true" className="mr-0.5 text-[0.8em]">
          {dir > 0 ? "▲" : "▼"}
        </span>
      )}
      {text}
    </span>
  );
}
