"use client";

import Link from "next/link";
import { CsvLink } from "@/components/CsvLink";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Sparkline } from "@/components/Sparkline";
import type { Commodities } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";

const COMMODITIES_POLL_MS = 60_000; // futures are cached 60 seconds

const HEADINGS: [string, boolean][] = [
  ["Commodity", false],
  ["Price", true],
  ["Chg", true],
  ["Chg %", true],
  ["YTD %", true],
  ["1 month", true],
  ["Date", true],
];

export function CommodityBoard({ mnemonic, title }: FunctionScreenProps) {
  const board = useApi<Commodities>("/api/commodities", COMMODITIES_POLL_MS);
  const [currency] = useDisplayCurrency();
  const rowLink = useRowLink();
  const b = board.data;

  return (
    <Panel title={title} mnemonic={mnemonic} meta={board.meta} actions={<CsvLink path="/api/commodities?format=csv" />}>
      <p className="mb-2 text-[13px] text-muted">
        Metals, energy, and grain, priced by the futures contract that expires next. A row opens its chart.
      </p>
      <UpdateFailed error={b ? board.error : null} />
      {!b ? (
        <Pending error={board.error} rows={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-ink">
                {HEADINGS.map(([label, right]) => (
                  <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row) => {
                const href = commandHref({ mnemonic: "GP", ticker: row.symbol });
                const link = rowLink(href);
                const price = money(row.last_usd, row.last_php, currency);
                const change = money(row.change_usd, row.change_php, currency);
                return (
                  <tr key={row.symbol} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                    <td className="px-1.5">
                      <Link href={href} className="hover:underline">{row.name}</Link>
                      <span className="ml-2 text-[12px] text-muted">{row.unit}</span>
                    </td>
                    <td className="px-1.5 text-right"><Num value={price.value} decimals={2} currency={price.currency} /></td>
                    <td className="px-1.5 text-right"><Num value={change.value} change decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={row.change_pct} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={row.ytd_pct} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Sparkline values={row.closes} /></td>
                    <td className="px-1.5 text-right font-mono text-[12px] text-muted">{formatDate(row.last_date, { year: false })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Front-month futures from Yahoo (gold GC=F, silver SI=F, WTI CL=F, gas NG=F, copper HG=F, wheat ZW=F). When one contract expires the next
        takes over, so a roll day can look like a jump. Wheat is quoted in US cents and shown here in dollars. The 1-month line is in dollars.{" "}
        {pesoNote(currency, b?.usd_php)}
      </p>
    </Panel>
  );
}
