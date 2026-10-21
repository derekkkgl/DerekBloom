"use client";

import Link from "next/link";
import { CsvLink } from "@/components/CsvLink";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { TileMap, type MapTile } from "@/components/TileMap";
import type { Wmap } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { formatDate } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";

const WMAP_POLL_MS = 60_000; // indices are cached 60 seconds

const HEADINGS: [string, boolean][] = [
  ["Market", false],
  ["Index", false],
  ["Last", true],
  ["Chg %", true],
  ["YTD %", true],
  ["Date", true],
];

export function WorldMap({ mnemonic, title }: FunctionScreenProps) {
  const wmap = useApi<Wmap>("/api/wmap", WMAP_POLL_MS);
  const rowLink = useRowLink();
  const w = wmap.data;

  const tiles: MapTile[] = (w?.markets ?? []).map((m) => ({
    key: m.symbol,
    code: m.code,
    label: m.country,
    change: m.change_pct,
    col: m.col,
    row: m.row,
    href: commandHref({ mnemonic: "GP", ticker: m.symbol }),
  }));
  const noChange = (w?.markets ?? []).filter((m) => m.change_pct === null).map((m) => m.country);

  return (
    <Panel title={title} mnemonic={mnemonic} meta={wmap.meta} actions={<CsvLink path="/api/wmap?format=csv" />}>
      <p className="mb-2 text-[13px] text-muted">
        Each square is one country&apos;s main stock index, placed roughly where it sits on the globe and tinted by its latest day&apos;s move.
        A square opens its chart.
      </p>
      <UpdateFailed error={w ? wmap.error : null} />
      {!w ? (
        <Pending error={wmap.error} rows={10} />
      ) : (
        <>
          <TileMap tiles={tiles} label="World stock markets by latest day's change" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-ink">
                  {HEADINGS.map(([label, right]) => (
                    <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              {w.regions.map((region) => (
                <tbody key={region}>
                  <tr>
                    <th scope="colgroup" colSpan={HEADINGS.length} className="micro-label border-b border-hairline px-1.5 pt-3 pb-1 text-left font-medium text-ink">
                      {region}
                    </th>
                  </tr>
                  {w.markets.filter((m) => m.region === region).map((m) => {
                    const href = commandHref({ mnemonic: "GP", ticker: m.symbol });
                    const link = rowLink(href);
                    return (
                      <tr key={m.symbol} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                        <td className="px-1.5">
                          <span className="mr-2 font-mono text-[12px] font-medium">{m.code}</span>
                          <Link href={href} className="hover:underline">{m.country}</Link>
                        </td>
                        <td className="px-1.5 text-muted">{m.index}</td>
                        <td className="px-1.5 text-right"><Num value={m.last} decimals={2} /></td>
                        <td className="px-1.5 text-right"><Num value={m.change_pct} change percent decimals={2} /></td>
                        <td className="px-1.5 text-right"><Num value={m.ytd_pct} change percent decimals={2} /></td>
                        <td className="px-1.5 text-right font-mono text-[12px] text-muted">{formatDate(m.last_date, { year: false })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Moves are in each index&apos;s own points, so a currency swing isn&apos;t counted. Markets close at different hours, so each square is its
        own latest session; the date column says which.
        {noChange.length > 0 && ` Yahoo has today's level but no earlier close for ${noChange.join(", ")}, so no change can be worked out.`}
      </p>
    </Panel>
  );
}
