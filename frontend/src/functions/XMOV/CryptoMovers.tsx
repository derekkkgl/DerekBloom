"use client";

import Link from "next/link";
import { useState } from "react";
import { CsvLink } from "@/components/CsvLink";
import { TextButton } from "@/components/Field";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import type { CryptoMovers as Movers, MoverCoin, Trending, TrendingCoin } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency, type DisplayCurrency } from "@/lib/currency";
import { priceDecimals } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";

const MOVERS_POLL_MS = 120_000; // the top-200 list (shared with CRYPTO) is cached 2 minutes
const TRENDING_POLL_MS = 600_000;
const COUNT = 10;

type Window = "24h" | "7d";

export function CryptoMovers({ mnemonic, title }: FunctionScreenProps) {
  const [window, setWindow] = useState<Window>("24h");
  const path = `/api/crypto/movers?window=${window}&n=${COUNT}`;
  const movers = useApi<Movers>(path, MOVERS_POLL_MS);
  const [currency] = useDisplayCurrency();
  const m = movers.data;

  return (
    <>
      <Panel title={title} mnemonic={mnemonic} meta={movers.meta} actions={<CsvLink path={`${path}&format=csv`} />}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] text-muted">
            The biggest rises and falls among the top {m?.universe ?? 200} coins by market cap. With PHP on, moves are measured in pesos.
          </p>
          <div className="flex gap-3" role="group" aria-label="Period">
            {(["24h", "7d"] as const).map((w) => (
              <TextButton key={w} active={w === window} aria-pressed={w === window} onClick={() => setWindow(w)}>
                {w === "24h" ? "24 hours" : "7 days"}
              </TextButton>
            ))}
          </div>
        </div>
        <UpdateFailed error={m ? movers.error : null} />
        {!m ? (
          <Pending error={movers.error} rows={10} />
        ) : (
          <div className="grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-0 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline">
            <MoverTable caption="Gainers" coins={m.gainers} window={m.window} currency={currency} />
            <MoverTable caption="Losers" coins={m.losers} window={m.window} currency={currency} />
          </div>
        )}
      </Panel>
      <TrendingPanel currency={currency} />
    </>
  );
}

function change(coin: MoverCoin, window: Window, currency: DisplayCurrency): number | null {
  const php = currency === "PHP" && coin.price_php !== null;
  if (window === "7d") return php ? coin.change_7d_pct_php : coin.change_7d_pct;
  return php ? coin.change_24h_pct_php : coin.change_24h_pct;
}

function CoinName({ coin, href }: { coin: { symbol: string | null; name: string | null }; href: string | null }) {
  const name = (
    <>
      <span className="font-mono text-[12px] font-medium">{coin.symbol}</span>
      <span className="ml-2 text-muted">{coin.name}</span>
    </>
  );
  return href ? <Link href={href} className="hover:underline">{name}</Link> : name;
}

function MoverTable({ caption, coins, window, currency }: { caption: string; coins: MoverCoin[]; window: Window; currency: DisplayCurrency }) {
  const rowLink = useRowLink();
  return (
    <table className="w-full text-[13px]">
      <caption className="micro-label pb-1 text-left">{caption}</caption>
      <thead>
        <tr className="border-b border-ink">
          <th scope="col" className="micro-label w-10 px-1.5 py-1 text-right font-normal">Rank</th>
          <th scope="col" className="micro-label px-1.5 py-1 text-left font-normal">Coin</th>
          <th scope="col" className="micro-label px-1.5 py-1 text-right font-normal">Price</th>
          <th scope="col" className="micro-label px-1.5 py-1 text-right font-normal">{window}</th>
        </tr>
      </thead>
      <tbody>
        {coins.length === 0 && (
          <tr className="h-7 border-b border-hairline">
            <td colSpan={4} className="px-1.5 text-muted">No coin in the top 200 moved this way.</td>
          </tr>
        )}
        {coins.map((coin) => {
          const href = coin.ticker ? commandHref({ mnemonic: "DES", ticker: coin.ticker }) : null;
          const link = rowLink(href);
          const price = money(coin.price_usd, coin.price_php, currency);
          return (
            <tr key={coin.id} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
              <td className="px-1.5 text-right"><Num value={coin.rank} decimals={0} className="text-muted" /></td>
              <td className="max-w-0 truncate px-1.5"><CoinName coin={coin} href={href} /></td>
              <td className="px-1.5 text-right"><Num value={price.value} decimals={priceDecimals(coin.symbol, price.value)} currency={price.currency} /></td>
              <td className="px-1.5 text-right"><Num value={change(coin, window, currency)} change percent decimals={2} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TrendingPanel({ currency }: { currency: DisplayCurrency }) {
  const trending = useApi<Trending>("/api/crypto/trending", TRENDING_POLL_MS);
  const rowLink = useRowLink();
  const t = trending.data;

  return (
    <Panel title="Trending on CoinGecko" mnemonic="XMOV" meta={trending.meta}>
      <p className="mb-2 text-[13px] text-muted">The coins people searched for most on CoinGecko in the last 24 hours. Popular is not the same as good.</p>
      <UpdateFailed error={t ? trending.error : null} />
      {!t ? (
        <Pending error={trending.error} rows={8} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-ink">
                {[["#", true], ["Coin", false], ["Mkt cap rank", true], ["Price", true], ["24h", true], ["Mkt cap", true]].map(([label, right]) => (
                  <th key={String(label)} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.coins.map((coin: TrendingCoin, i) => {
                const href = coin.ticker ? commandHref({ mnemonic: "DES", ticker: coin.ticker }) : null;
                const link = rowLink(href);
                const price = money(coin.price_usd, coin.price_php, currency);
                const cap = money(coin.market_cap_usd, coin.market_cap_php, currency);
                const move = currency === "PHP" && coin.price_php !== null ? coin.change_24h_pct_php : coin.change_24h_pct;
                return (
                  <tr key={coin.id} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                    <td className="px-1.5 text-right"><Num value={i + 1} decimals={0} className="text-muted" /></td>
                    <td className="px-1.5"><CoinName coin={coin} href={href} /></td>
                    <td className="px-1.5 text-right"><Num value={coin.rank} decimals={0} /></td>
                    <td className="px-1.5 text-right"><Num value={price.value} decimals={priceDecimals(coin.symbol, price.value)} currency={price.currency} /></td>
                    <td className="px-1.5 text-right"><Num value={move} change percent decimals={2} /></td>
                    <td className="px-1.5 text-right"><Num value={cap.value} compact currency={cap.currency} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Coins with a Look up alias open their DES. Peso prices on the movers come straight from CoinGecko; trending prices are in dollars from CoinGecko.{" "}
        {pesoNote(currency, t?.usd_php)}
      </p>
    </Panel>
  );
}
