"use client";

// The four live blocks of the Home front page. Each draws its own Panel so its header
// shows where its numbers came from and when. The lists live in lib/frontPage.ts.

import Link from "next/link";
import type { ReactNode } from "react";
import type { CryptoMarkets, News, Quotes, Wei } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { coinView } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import { formatStamp, priceDecimals } from "@/lib/format";
import { CRYPTO_LIST, HEADLINE_COUNT, INDEX_LIST, pickInOrder, quotesPath, US_LIST } from "@/lib/frontPage";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";
import { Pending, UpdateFailed } from "./LoadState";
import { Num } from "./Num";
import { Panel } from "./Panel";
import { Sparkline } from "./Sparkline";

const QUOTES_POLL_MS = 60_000;
const WEI_POLL_MS = 60_000;
const MARKETS_POLL_MS = 120_000;
const NEWS_POLL_MS = 300_000;

const SIDE_COLUMN = "md:border-l md:border-l-hairline md:pl-6";
const gp = (ticker: string) => commandHref({ mnemonic: "GP", ticker });

function Note({ children }: { children: ReactNode }) {
  return <p className="micro-label border-b border-ink pb-1">{children}</p>;
}

export function UsColumn() {
  const symbols = US_LIST.map((s) => s.symbol);
  const quotes = useApi<Quotes>(quotesPath(symbols), QUOTES_POLL_MS);
  const rows = pickInOrder(quotes.data?.quotes, symbols, (q) => q.input);
  const rowLink = useRowLink();

  return (
    <Panel title="US stocks and ETFs" meta={quotes.meta}>
      <Note>Last price in USD · day change · past month</Note>
      <UpdateFailed error={quotes.data ? quotes.error : null} />
      {!quotes.data ? (
        <Pending error={quotes.error} rows={8} />
      ) : (
        <table className="w-full text-[13px]">
          <tbody>
            {US_LIST.map((item, i) => {
              const q = rows[i];
              const link = rowLink(gp(item.symbol));
              return (
                <tr key={item.symbol} onClick={link.onClick} className={`h-8 border-b border-hairline ${link.className}`}>
                  <td className="w-16 px-1">
                    <Link href={gp(item.symbol)} className="font-mono text-[12px] font-medium hover:underline">{item.symbol}</Link>
                  </td>
                  <td className="hidden truncate px-1 text-muted sm:table-cell">{item.name}</td>
                  <td className="px-1 text-right"><Num value={q?.last} currency="USD" decimals={2} /></td>
                  <td className="w-24 px-1 text-right"><Num value={q?.change_pct} change percent decimals={2} /></td>
                  <td className="w-24 py-1 pl-3 text-right"><Sparkline values={q?.closes ?? []} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function CryptoColumn() {
  const markets = useApi<CryptoMarkets>("/api/crypto/markets", MARKETS_POLL_MS);
  const [currency] = useDisplayCurrency();
  const coins = pickInOrder(markets.data?.coins, CRYPTO_LIST, (c) => c.ticker);
  const rowLink = useRowLink();

  return (
    <Panel title="Crypto" meta={markets.meta} className={SIDE_COLUMN}>
      <Note>In {currency === "PHP" ? "pesos" : "dollars"} · 24h change</Note>
      <UpdateFailed error={markets.data ? markets.error : null} />
      {!markets.data ? (
        <Pending error={markets.error} rows={7} />
      ) : (
        <table className="w-full text-[13px]">
          <tbody>
            {CRYPTO_LIST.map((ticker, i) => {
              const coin = coins[i];
              const view = coin ? coinView(coin, currency) : null;
              const link = rowLink(gp(ticker));
              return (
                <tr key={ticker} onClick={link.onClick} className={`h-8 border-b border-hairline ${link.className}`}>
                  <td className="px-1">
                    <Link href={gp(ticker)} className="font-mono text-[12px] font-medium hover:underline">{ticker}</Link>
                  </td>
                  <td className="px-1 text-right">
                    <Num value={view?.price} currency={view?.currency} decimals={priceDecimals(ticker, view?.price)} />
                  </td>
                  <td className="px-1 text-right"><Num value={view?.change24h} change percent decimals={2} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function IndicesColumn() {
  const wei = useApi<Wei>("/api/wei", WEI_POLL_MS);
  const rows = pickInOrder(wei.data?.groups.flatMap((g) => g.rows), INDEX_LIST.map((x) => x.symbol), (r) => r.symbol);
  const rowLink = useRowLink();

  return (
    <Panel title="World indices" meta={wei.meta} className={SIDE_COLUMN}>
      <Note>Day change · market now</Note>
      <UpdateFailed error={wei.data ? wei.error : null} />
      {!wei.data ? (
        <Pending error={wei.error} rows={8} />
      ) : (
        <table className="w-full text-[13px]">
          <tbody>
            {INDEX_LIST.map((index, i) => {
              const row = rows[i];
              const link = rowLink(gp(index.symbol));
              return (
                <tr key={index.symbol} onClick={link.onClick} className={`h-8 border-b border-hairline ${link.className}`}>
                  <td className="px-1">
                    <Link href={gp(index.symbol)} className="hover:underline">{index.label}</Link>
                  </td>
                  <td className="px-1 text-right"><Num value={row?.change_pct} change percent decimals={2} /></td>
                  <td className={`w-14 px-1 text-right text-[12px] ${row?.status === "open" ? "text-ink" : "text-muted"}`}>
                    {row ? (row.status === "open" ? "Open" : "Closed") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function Headlines() {
  const news = useApi<News>(`/api/news?limit=${HEADLINE_COUNT}`, NEWS_POLL_MS);

  return (
    <Panel title="Headlines" meta={news.meta} className="mt-4">
      <UpdateFailed error={news.data ? news.error : null} />
      {!news.data ? (
        <Pending error={news.error} rows={4} />
      ) : (
        <ol className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
          {news.data.items.map((item) => (
            <li key={item.url} className="border-b border-hairline py-2">
              <p className="micro-label">
                {item.source} · <span className="font-mono normal-case tracking-normal">{formatStamp(item.published)}</span>
              </p>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-serif text-[16px] leading-6 font-medium hover:underline">
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[12px]">
        <Link href="/fn/N" className="text-muted underline decoration-hairline underline-offset-2 hover:text-ink">The full news wire</Link>
      </p>
    </Panel>
  );
}
