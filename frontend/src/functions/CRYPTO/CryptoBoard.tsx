"use client";

import Link from "next/link";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Sparkline } from "@/components/Sparkline";
import type { CryptoMarkets } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { coinView } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import { priceDecimals } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";

const MARKETS_POLL_MS = 120_000; // backend caches the CoinGecko list for 2 minutes

const HEADINGS: [string, boolean][] = [
  ["#", true],
  ["Coin", false],
  ["Price", true],
  ["1h", true],
  ["24h", true],
  ["7d", true],
  ["Vol 24h", true],
  ["Mkt cap", true],
  ["Last 7 days", true],
];

export function CryptoBoard({ mnemonic, title }: FunctionScreenProps) {
  const markets = useApi<CryptoMarkets>("/api/crypto/markets", MARKETS_POLL_MS);
  const [currency] = useDisplayCurrency();
  const rowLink = useRowLink();

  return (
    <Panel title={title} mnemonic={mnemonic} meta={markets.meta}>
      <p className="mb-2 text-[13px] text-muted">
        The top 100 coins by market cap, in {currency === "PHP" ? "pesos" : "dollars"}. With PHP on, changes are measured in pesos. Select a coin for its chart.
      </p>
      <UpdateFailed error={markets.data ? markets.error : null} />
      {!markets.data ? (
        <Pending error={markets.error} rows={14} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-ink">
                {HEADINGS.map(([label, right]) => (
                  <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {markets.data.coins.map((coin) => {
                const view = coinView(coin, currency);
                const href = coin.ticker ? commandHref({ mnemonic: "GP", ticker: coin.ticker }) : null;
                const link = rowLink(href);
                const name = (
                  <>
                    <span className="font-mono text-[12px] font-medium">{coin.symbol}</span>
                    <span className="ml-2 text-muted">{coin.name}</span>
                  </>
                );
                return (
                  <tr key={coin.id} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                    <td className="px-1.5 text-right"><Num value={coin.rank} decimals={0} className="text-muted" /></td>
                    <td className="px-1.5">{href ? <Link href={href} className="hover:underline">{name}</Link> : name}</td>
                    <td className="px-1.5 text-right">
                      <Num value={view.price} decimals={priceDecimals(coin.symbol, view.price)} currency={view.currency} />
                    </td>
                    <td className="px-1.5 text-right"><Num value={view.change1h} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={view.change24h} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={view.change7d} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={view.volume} compact currency={view.currency} /></td>
                    <td className="px-1.5 text-right"><Num value={view.marketCap} compact currency={view.currency} /></td>
                    <td className="py-0.5 pl-3 text-right"><Sparkline values={view.sparkline} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Coins without a Look up alias yet aren&apos;t linked. Peso prices and changes come straight from CoinGecko.
      </p>
    </Panel>
  );
}
