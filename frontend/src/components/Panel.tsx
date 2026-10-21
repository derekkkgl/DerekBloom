import type { ReactNode } from "react";
import type { Meta } from "@/lib/api";
import { formatTime } from "@/lib/format";

type PanelProps = {
  title: string;
  mnemonic?: string;
  ticker?: string;
  meta?: Meta | null;
  className?: string;
  children: ReactNode;
};

/**
 * A ruled section of the paper, never a card: a 1px ink rule on top, then a header bar.
 * Left: mnemonic and title. Right: ticker, data source, and last-updated time.
 */
export function Panel({ title, mnemonic, ticker, meta, className = "", children }: PanelProps) {
  return (
    <section className={`border-t border-ink ${className}`}>
      <header className="flex items-baseline justify-between gap-4 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {mnemonic && <span className="font-mono text-[11px] tracking-wider text-muted">{mnemonic}</span>}
          <h2 className="truncate font-serif text-lg leading-6 font-semibold">{title}</h2>
        </div>
        <div className="flex shrink-0 items-baseline gap-3 font-mono text-[11px] text-muted">
          {ticker && <span className="text-ink">{ticker}</span>}
          {meta && <span className="uppercase">{meta.source}</span>}
          {meta && <span>{formatTime(meta.as_of)}</span>}
          {meta?.stale && <span className="font-sans uppercase tracking-wider text-ink">Stale</span>}
        </div>
      </header>
      <div className="pb-3">{children}</div>
    </section>
  );
}
