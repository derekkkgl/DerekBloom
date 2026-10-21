"use client";

import Link from "next/link";
import { CsvLink } from "@/components/CsvLink";
import { Num } from "@/components/Num";
import type { ScreenRow } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { money } from "@/lib/crypto";
import type { DisplayCurrency } from "@/lib/currency";
import { priceDecimals } from "@/lib/format";
import { useRowLink } from "@/lib/useRowLink";

type Props = {
  rows: ScreenRow[];
  currency: DisplayCurrency;
  caption: string;
  /** Text for a screen that came back with no stocks. */
  empty: string;
  /** Adds volume, average volume, and relative volume (MOST). */
  volume?: boolean;
  /** A CSV link in the caption, for screens with more than one table. */
  csvPath?: string;
};

/** Stocks from one of Yahoo's US screeners. A row opens the stock's DES. */
export function ScreenTable({ rows, currency, caption, empty, volume = false, csvPath }: Props) {
  const rowLink = useRowLink();
  const headings: [string, boolean][] = [
    ["#", true],
    ["Stock", false],
    ["Price", true],
    ["Chg %", true],
    ...(volume ? ([["Volume", true], ["Avg vol 3M", true], ["Rel vol", true]] as [string, boolean][]) : []),
    ["Mkt cap", true],
  ];
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-[13px] ${volume ? "min-w-[720px]" : ""}`}>
        <caption className="micro-label pb-1 text-left">
          {caption}
          {csvPath && (
            <span className="ml-3 font-mono normal-case tracking-normal">
              <CsvLink path={csvPath} />
            </span>
          )}
        </caption>
        <thead>
          <tr className="border-b border-ink">
            {headings.map(([label, right]) => (
              <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="h-7 border-b border-hairline">
              <td colSpan={headings.length} className="px-1.5 text-muted">{empty}</td>
            </tr>
          )}
          {rows.map((row) => {
            const href = commandHref({ mnemonic: "DES", ticker: row.symbol });
            const link = rowLink(href);
            const price = money(row.price_usd, row.price_php, currency);
            const cap = money(row.market_cap_usd, row.market_cap_php, currency);
            return (
              <tr key={row.symbol} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                <td className="w-8 px-1.5 text-right"><Num value={row.rank} decimals={0} className="text-muted" /></td>
                <td className="max-w-0 truncate px-1.5">
                  <Link href={href} className="hover:underline">
                    <span className="font-mono text-[12px] font-medium">{row.symbol}</span>
                    <span className="ml-2 text-muted">{row.name}</span>
                  </Link>
                </td>
                <td className="px-1.5 text-right"><Num value={price.value} decimals={priceDecimals(row.symbol, price.value)} currency={price.currency} /></td>
                <td className="px-1.5 text-right"><Num value={row.change_pct} change percent decimals={2} /></td>
                {volume && (
                  <>
                    <td className="px-1.5 text-right"><Num value={row.volume} compact /></td>
                    <td className="px-1.5 text-right"><Num value={row.avg_volume_3m} compact className="text-muted" /></td>
                    <td className="px-1.5 text-right">
                      <Num value={row.rel_volume} decimals={1} />
                      {row.rel_volume !== null && <span className="font-mono text-[12px] text-muted">×</span>}
                    </td>
                  </>
                )}
                <td className="px-1.5 text-right"><Num value={cap.value} compact currency={cap.currency} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
