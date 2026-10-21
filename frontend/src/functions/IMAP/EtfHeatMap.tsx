"use client";

import Link from "next/link";
import { CsvLink } from "@/components/CsvLink";
import { HeatMap } from "@/components/HeatMap";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import type { ApiError, Imap, ImapGroup, Meta } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency, type DisplayCurrency } from "@/lib/currency";
import { US_LIST } from "@/lib/frontPage";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";
import { imapTiles } from "@/lib/world";

const IMAP_POLL_MS = 60_000; // day moves are cached 60 seconds, sizes a day

const HOME_NAMES = Object.fromEntries(US_LIST.map((s) => [s.symbol, s.name]));
const PATH = `/api/imap?symbols=${US_LIST.map((s) => encodeURIComponent(s.symbol)).join(",")}`;

const ABOUT: Record<ImapGroup["id"], string> = {
  sectors: "The S&P 500 split into its 11 sectors, each tracked by a SPDR sector ETF. Tile size is the sector's share of the index.",
  world: "Broad ETFs for the world, the world outside the US, emerging markets, Japan, China, and India. Tile size is the fund's assets.",
  home: "The stocks and funds on your Home page. Tile size follows the square root of market cap or fund assets, so small ones stay readable.",
};

export function EtfHeatMap({ mnemonic, title }: FunctionScreenProps) {
  const imap = useApi<Imap>(PATH, IMAP_POLL_MS);
  const [currency] = useDisplayCurrency();
  const m = imap.data;

  if (!m) {
    return (
      <Panel title={title} mnemonic={mnemonic} meta={imap.meta}>
        <Pending error={imap.error} rows={12} />
      </Panel>
    );
  }
  return (
    <>
      {m.groups.map((group, i) => (
        <GroupPanel
          key={group.id}
          group={group}
          mnemonic={mnemonic}
          title={i === 0 ? `${title}: ${group.title}` : group.title}
          meta={i === 0 ? imap.meta : null}
          error={i === 0 ? imap.error : null}
          currency={currency}
          usdPhp={m.usd_php}
          first={i === 0}
        />
      ))}
    </>
  );
}

type GroupProps = {
  group: ImapGroup;
  mnemonic: string;
  title: string;
  meta: Meta | null;
  error: ApiError | null;
  currency: DisplayCurrency;
  usdPhp: number | null;
  first: boolean;
};

function GroupPanel({ group, mnemonic, title, meta, error, currency, usdPhp, first }: GroupProps) {
  const rowLink = useRowLink();
  const tiles = imapTiles(group, currency, HOME_NAMES);
  const sectors = group.id === "sectors";
  const missing = group.rows.filter((r) => !(sectors ? r.weight_pct : r.size_usd)).map((r) => r.input ?? r.symbol);

  return (
    <Panel title={title} mnemonic={mnemonic} meta={meta} actions={first ? <CsvLink path={`${PATH}&format=csv`} /> : undefined}>
      <p className="mb-2 text-[13px] text-muted">{ABOUT[group.id]}</p>
      <UpdateFailed error={error} />
      {tiles.length > 0 ? (
        <HeatMap tiles={tiles} label={`${group.title} by size, tinted by today's change`} />
      ) : (
        <p className="text-[13px] text-muted">Yahoo has no sizes for these right now, so there is no map. The table still has today&apos;s moves.</p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="border-b border-ink">
              <th scope="col" className="micro-label px-1.5 py-1 text-left font-normal">{sectors ? "Sector" : group.id === "world" ? "Fund" : "Holding"}</th>
              <th scope="col" className="micro-label px-1.5 py-1 text-left font-normal">Ticker</th>
              <th scope="col" className="micro-label px-1.5 py-1 text-right font-normal">{sectors ? "S&P 500 weight" : group.id === "world" ? "Fund assets" : "Size"}</th>
              <th scope="col" className="micro-label px-1.5 py-1 text-right font-normal">Today</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => {
              const ticker = row.input ?? row.symbol;
              const href = commandHref({ mnemonic: "DES", ticker });
              const link = rowLink(href);
              const size = money(row.size_usd, row.size_php, currency);
              return (
                <tr key={row.symbol} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                  <td className="max-w-0 truncate px-1.5">
                    <Link href={href} className="hover:underline">{group.id === "home" ? (HOME_NAMES[ticker] ?? row.name ?? ticker) : row.name}</Link>
                  </td>
                  <td className="px-1.5 font-mono text-[12px]">{ticker}</td>
                  <td className="px-1.5 text-right">
                    {sectors ? <Num value={row.weight_pct} percent decimals={1} /> : <Num value={size.value} compact currency={size.currency} />}
                  </td>
                  <td className="px-1.5 text-right"><Num value={row.change_pct} change percent decimals={2} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {sectors
          ? "Sector weights are SPY's, from Yahoo, refreshed daily."
          : "Fund assets and market caps come from Yahoo, refreshed daily. Vanguard funds (VT, VXUS, VOO) report assets for the whole fund, mutual-fund share classes included, so they look bigger than the ETF alone."}{" "}
        Moves are in dollars, the funds&apos; own currency.
        {missing.length > 0 && ` Not on the map (Yahoo has no ${sectors ? "weight" : "size"}): ${missing.join(", ")}.`}{" "}
        {!sectors && pesoNote(currency, usdPhp)}
      </p>
    </Panel>
  );
}
