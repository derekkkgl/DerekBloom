"use client";

import Link from "next/link";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import type { Wei } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { formatDate } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";
import { weiCells } from "@/lib/wei";

const WEI_POLL_MS = 60_000; // backend caches WEI for 60s

export function WorldIndices({ mnemonic, title }: FunctionScreenProps) {
  const wei = useApi<Wei>("/api/wei", WEI_POLL_MS);
  const rowLink = useRowLink();

  return (
    <Panel title={title} mnemonic={mnemonic} meta={wei.meta}>
      <p className="mb-2 text-[13px] text-muted">
        The world&apos;s main stock indices by region, plus Bitcoin, the dollar, gold, oil, and the US 10-year yield. Select a row for its chart.
      </p>
      <UpdateFailed error={wei.data ? wei.error : null} />
      {!wei.data ? (
        <Pending error={wei.error} rows={12} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="micro-label px-1 py-1 font-normal">Index</th>
                <th scope="col" className="micro-label px-1 py-1 text-right font-normal">Last</th>
                <th scope="col" className="micro-label px-1 py-1 text-right font-normal">Chg</th>
                <th scope="col" className="micro-label px-1 py-1 text-right font-normal">Chg %</th>
                <th scope="col" className="micro-label px-1 py-1 text-right font-normal">YTD %</th>
                <th scope="col" className="micro-label px-1 py-1 font-normal">Market</th>
                <th scope="col" className="micro-label px-1 py-1 text-right font-normal">Date</th>
              </tr>
            </thead>
            {wei.data.groups.map((group) => (
              <tbody key={group.region}>
                <tr>
                  <th scope="colgroup" colSpan={7} className="micro-label border-b border-hairline px-1 pt-3 pb-1 text-left font-medium text-ink">
                    {group.region}
                  </th>
                </tr>
                {group.rows.map((row) => {
                  const cells = weiCells(row);
                  const href = commandHref({ mnemonic: "GP", ticker: row.symbol });
                  const link = rowLink(href);
                  return (
                    <tr key={row.symbol} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                      <td className="px-1">
                        <Link href={href} className="hover:underline">{row.name}</Link>
                        {row.currency && <span className="ml-1.5 font-mono text-[11px] text-muted">{row.currency}</span>}
                      </td>
                      <td className="px-1 text-right"><Num value={row.last} {...cells.last} /></td>
                      <td className="px-1 text-right"><Num value={cells.change} change {...cells.changeFormat} /></td>
                      <td className="px-1 text-right"><Num value={cells.changePct} change percent decimals={2} /></td>
                      <td className="px-1 text-right"><Num value={cells.ytdPct} change percent decimals={2} /></td>
                      <td className={`px-1 ${row.status === "open" ? "text-ink" : "text-muted"}`}>{row.status === "open" ? "Open" : "Closed"}</td>
                      <td className="px-1 text-right font-mono text-[12px] text-muted">{formatDate(row.last_date, { year: false })}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Open or closed follows each exchange&apos;s regular hours; holidays aren&apos;t known. The 10-year yield&apos;s change is in basis points.
      </p>
    </Panel>
  );
}
