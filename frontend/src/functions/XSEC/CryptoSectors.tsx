"use client";

import { CsvLink } from "@/components/CsvLink";
import { HeatMap, type HeatTile } from "@/components/HeatMap";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import type { CryptoSectors as Sectors } from "@/lib/api";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import { formatNumber } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const SECTORS_POLL_MS = 600_000; // categories are cached 10 minutes

const HEADINGS: [string, boolean][] = [
  ["#", true],
  ["Category", false],
  ["Mkt cap", true],
  ["24h", true],
  ["Vol 24h", true],
  ["Biggest coins", false],
];

export function CryptoSectors({ mnemonic, title }: FunctionScreenProps) {
  const sectors = useApi<Sectors>("/api/crypto/sectors", SECTORS_POLL_MS);
  const [currency] = useDisplayCurrency();
  const s = sectors.data;

  const tiles: HeatTile[] = (s?.categories ?? [])
    .filter((c) => c.sector !== null && c.market_cap_usd !== null)
    .map((c) => {
      const cap = money(c.market_cap_usd, c.market_cap_php, currency);
      return {
        key: c.id,
        label: c.sector!,
        // Square root, so a sector a hundredth of Layer 1's size still gets a readable tile.
        weight: Math.sqrt(c.market_cap_usd!),
        change: c.change_24h_pct,
        detail: formatNumber(cap.value, { compact: true, currency: cap.currency }),
      };
    });

  return (
    <Panel title={title} mnemonic={mnemonic} meta={sectors.meta} actions={<CsvLink path="/api/crypto/sectors?format=csv" />}>
      <p className="mb-2 text-[13px] text-muted">
        How each corner of crypto moved in the last 24 hours, by the total market cap of its coins. Bigger tile, bigger sector.
      </p>
      <UpdateFailed error={s ? sectors.error : null} />
      {!s ? (
        <Pending error={sectors.error} rows={12} />
      ) : (
        <>
          <HeatMap tiles={tiles} label="Crypto sectors by market cap, tinted by 24-hour change" />
          <p className="mt-1 text-[11px] text-muted">
            Tile area follows the square root of market cap, so small sectors stay readable. A coin can belong to several sectors, so the tiles
            overlap in what they hold and don&apos;t add up to the whole market.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <caption className="micro-label pb-1 text-left">The 100 biggest CoinGecko categories</caption>
              <thead>
                <tr className="border-b border-ink">
                  {HEADINGS.map(([label, right]) => (
                    <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.categories.map((c) => {
                  const cap = money(c.market_cap_usd, c.market_cap_php, currency);
                  const volume = money(c.volume_24h_usd, c.volume_24h_php, currency);
                  return (
                    <tr key={c.id} className="h-7 border-b border-hairline">
                      <td className="px-1.5 text-right"><Num value={c.rank} decimals={0} className="text-muted" /></td>
                      <td className="px-1.5">
                        {c.name}
                        {c.sector && <span className="micro-label ml-2">on map</span>}
                      </td>
                      <td className="px-1.5 text-right"><Num value={cap.value} compact currency={cap.currency} /></td>
                      <td className="px-1.5 text-right"><Num value={c.change_24h_pct} change percent decimals={2} /></td>
                      <td className="px-1.5 text-right"><Num value={volume.value} compact currency={volume.currency} /></td>
                      <td className="max-w-[220px] truncate px-1.5 font-mono text-[12px] text-muted">{c.top_coins ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-2 text-[11px] text-muted">
        CoinGecko gives categories a 24-hour change only, measured in dollars. {pesoNote(currency, s?.usd_php)}
      </p>
    </Panel>
  );
}
