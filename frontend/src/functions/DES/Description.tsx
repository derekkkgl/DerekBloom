"use client";

import { useState, type ReactNode } from "react";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { RangeRule } from "@/components/RangeRule";
import { Stat, StatList } from "@/components/StatList";
import { combineMeta, type ApiError, type Des, type DesCoin, type DesSecurity, type Meta, type Quote } from "@/lib/api";
import { useDisplayCurrency } from "@/lib/currency";
import { formatDate, priceDecimals } from "@/lib/format";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const DES_POLL_MS = 120_000; // profiles are cached 6h; coins also carry a live price (2 min)
const QUOTE_POLL_MS = 60_000;

export function Description({ ticker = "", mnemonic, title }: FunctionScreenProps) {
  const des = useApi<Des>(`/api/des/${encodeURIComponent(ticker)}`, DES_POLL_MS);
  const header = { mnemonic, title, ticker };

  if (!des.data) {
    return (
      <Panel {...header} meta={des.meta}>
        <Pending error={des.error} rows={8} />
      </Panel>
    );
  }
  return des.data.kind === "coin" ? (
    <CoinDes header={header} des={des.data} meta={des.meta} error={des.error} />
  ) : (
    <SecurityDes header={header} des={des.data} meta={des.meta} error={des.error} />
  );
}

type Header = { mnemonic: string; title: string; ticker: string };
type Props<T> = { header: Header; des: T; meta: Meta | null; error: ApiError | null };

// --- Stocks and ETFs ---------------------------------------------------------

function SecurityDes({ header, des, meta, error }: Props<DesSecurity>) {
  const quote = useApi<Quote>(`/api/quote/${encodeURIComponent(header.ticker)}`, QUOTE_POLL_MS);
  const q = quote.data;
  const cur = des.currency ?? undefined;
  const decimals = priceDecimals(des.symbol, q?.price);
  const fund = des.fund;
  const standfirst = fund
    ? [fund.family, fund.category, "Exchange-traded fund"]
    : [des.sector, des.industry, des.country];

  return (
    <Panel {...header} meta={combineMeta(meta, quote.meta)}>
      <UpdateFailed error={error} />
      <Masthead name={des.name ?? des.symbol} standfirst={standfirst} />
      <Hero
        price={<Num value={q?.price} decimals={decimals} currency={cur} className="text-[32px] leading-10 font-medium" />}
        change={q?.change ?? null}
        changePct={q?.change_pct ?? null}
        decimals={decimals}
        tags={[des.symbol, des.exchange, des.currency]}
        note={!q && quote.error ? `Live price not available: ${quote.error.message}` : null}
      />
      <Columns>
        <StatList title="Key stats">
          {!fund && <Stat label="Market cap"><Num value={des.market_cap} compact currency={cur} /></Stat>}
          {!fund && <Stat label="Enterprise value"><Num value={des.enterprise_value} compact currency={cur} /></Stat>}
          {fund && <Stat label="Previous close"><Num value={q?.prev_close} decimals={decimals} currency={cur} /></Stat>}
          {fund && <Stat label="Volume"><Num value={q?.volume} compact /></Stat>}
          <YearRange low={des.year_low} high={des.year_high} price={q?.price ?? null} decimals={decimals} />
          <Stat label={fund ? "Beta (3y)" : "Beta"}><Num value={des.beta} decimals={2} /></Stat>
          <Stat label={fund ? "Dividend (12m)" : "Dividend rate"}><Num value={des.dividend_rate} currency={cur} decimals={2} /></Stat>
          {!fund && <Stat label="Dividend yield"><Num value={des.dividend_yield_pct} percent decimals={2} /></Stat>}
          {!fund && <Stat label="Ex-dividend"><span className="font-mono">{formatDate(des.ex_dividend_date)}</span></Stat>}
          {!fund && <Stat label="Employees"><Num value={des.employees} decimals={0} /></Stat>}
        </StatList>

        {fund ? (
          <StatList title="Fund facts">
            <Stat label="Family">{fund.family ?? "—"}</Stat>
            <Stat label="Category">{fund.category ?? "—"}</Stat>
            <Stat label="Total assets"><Num value={fund.total_assets} compact currency={cur} /></Stat>
            <Stat label="Expense ratio"><Num value={fund.expense_ratio_pct} percent decimals={2} /></Stat>
            <Stat label="P/E (trailing)"><Num value={des.pe_trailing} decimals={1} /></Stat>
            <Stat label="Price / book"><Num value={des.price_to_book} decimals={2} /></Stat>
            <Stat label="Dividend yield"><Num value={des.dividend_yield_pct} percent decimals={2} /></Stat>
          </StatList>
        ) : (
          <StatList title="Valuation">
            <Stat label="P/E (trailing)"><Num value={des.pe_trailing} decimals={1} /></Stat>
            <Stat label="P/E (forward)"><Num value={des.pe_forward} decimals={1} /></Stat>
            <Stat label="Price / book"><Num value={des.price_to_book} decimals={2} /></Stat>
            <Stat label="Price / sales"><Num value={des.price_to_sales} decimals={2} /></Stat>
            <Stat label="EV / EBITDA"><Num value={des.ev_to_ebitda} decimals={1} /></Stat>
          </StatList>
        )}

        <Profile text={des.summary} links={des.website ? [{ label: "Website", href: des.website }] : []} />
      </Columns>
      <p className="mt-2 text-[11px] text-muted">
        Dividend yield is the dividend rate divided by the price when the profile was fetched.
      </p>
    </Panel>
  );
}

// --- Coins -------------------------------------------------------------------

function CoinDes({ header, des, meta, error }: Props<DesCoin>) {
  const [wanted] = useDisplayCurrency();
  const php = wanted === "PHP" && des.price_php !== null;
  const cur = php ? "PHP" : "USD";
  const pick = <T,>(usd: T, peso: T) => (php ? peso : usd);
  const price = pick(des.price_usd, des.price_php);
  const decimals = priceDecimals(des.symbol, price);
  const symbol = des.symbol ?? "";
  const max = des.max_supply;

  return (
    <Panel {...header} meta={meta}>
      <UpdateFailed error={error} />
      <Masthead name={des.name ?? symbol} standfirst={[des.rank ? `Rank #${des.rank} by market cap` : null, ...des.categories]} />
      <Hero
        price={<Num value={price} decimals={decimals} currency={cur} className="text-[32px] leading-10 font-medium" />}
        change={null}
        changePct={pick(des.change_24h_pct, des.change_24h_pct_php)}
        changeLabel="24h"
        decimals={decimals}
        tags={[symbol, "CoinGecko", cur]}
        note={null}
      />
      <Columns>
        <StatList title="Key stats">
          <Stat label="Market cap"><Num value={pick(des.market_cap_usd, des.market_cap_php)} compact currency={cur} /></Stat>
          <Stat label="Fully diluted value"><Num value={pick(des.fdv_usd, des.fdv_php)} compact currency={cur} /></Stat>
          <Stat label="24h volume"><Num value={pick(des.volume_usd, des.volume_php)} compact currency={cur} /></Stat>
          <Stat label="Rank"><Num value={des.rank} decimals={0} /></Stat>
          <Stat label="Launched"><span className="font-mono">{formatDate(des.genesis_date)}</span></Stat>
        </StatList>

        <StatList title="Supply and all-time high">
          <Stat label="Circulating"><Supply value={des.circulating_supply} symbol={symbol} /></Stat>
          <Stat label="Total"><Supply value={des.total_supply} symbol={symbol} /></Stat>
          <Stat label="Max">{max === null ? <span className="text-muted">No cap set</span> : <Supply value={max} symbol={symbol} />}</Stat>
          {max !== null && des.circulating_supply !== null && (
            <Stat label="Share of max issued"><Num value={(des.circulating_supply / max) * 100} percent decimals={1} /></Stat>
          )}
          <Stat label="All-time high"><Num value={pick(des.ath_usd, des.ath_php)} decimals={decimals} currency={cur} /></Stat>
          <Stat label="Reached"><span className="font-mono">{formatDate(pick(des.ath_date_usd, des.ath_date_php))}</span></Stat>
          <Stat label="From all-time high"><Num value={pick(des.from_ath_pct_usd, des.from_ath_pct_php)} change percent decimals={1} /></Stat>
        </StatList>

        <Profile
          text={des.summary}
          links={[
            { label: "Website", href: des.links.homepage },
            { label: "Whitepaper", href: des.links.whitepaper },
            { label: "Explorer", href: des.links.explorer },
            { label: "Source code", href: des.links.source },
          ]}
        />
      </Columns>
      {php && <p className="mt-2 text-[11px] text-muted">Peso figures and the peso all-time high come straight from CoinGecko.</p>}
    </Panel>
  );
}

function Supply({ value, symbol }: { value: number | null; symbol: string }) {
  return (
    <span className="whitespace-nowrap">
      <Num value={value} compact /> {value !== null && <span className="font-mono text-[11px] text-muted">{symbol}</span>}
    </span>
  );
}

// --- Shared layout -----------------------------------------------------------

function Masthead({ name, standfirst }: { name: string; standfirst: (string | null)[] }) {
  const line = standfirst.filter(Boolean).join(" · ");
  return (
    <div className="pb-2">
      <h1 className="font-serif text-[22px] leading-7 font-semibold">{name}</h1>
      {line && <p className="text-[13px] text-muted">{line}</p>}
    </div>
  );
}

function Hero(props: {
  price: ReactNode;
  change: number | null;
  changePct: number | null;
  changeLabel?: string;
  decimals: number;
  tags: (string | null)[];
  note: string | null;
}) {
  return (
    <div className="border-t border-ink pt-2 pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6">
        <div className="flex items-baseline gap-3">
          {props.price}
          {props.change !== null && <Num value={props.change} change decimals={props.decimals} className="text-[15px]" />}
          <Num value={props.changePct} change percent decimals={2} className="text-[15px]" />
          {props.changeLabel && <span className="micro-label">{props.changeLabel}</span>}
        </div>
        <p className="font-mono text-[11px] text-muted">{props.tags.filter(Boolean).join(" · ")}</p>
      </div>
      {props.note && <p className="text-[12px] text-muted">{props.note}</p>}
    </div>
  );
}

function Columns({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-y-4 md:grid-cols-3 md:gap-x-0 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline">
      {children}
    </div>
  );
}

function YearRange({ low, high, price, decimals }: { low: number | null; high: number | null; price: number | null; decimals: number }) {
  return (
    <div className="border-b border-hairline py-1.5 text-[13px]">
      <p className="mb-1 text-muted">52-week range</p>
      <RangeRule low={low} high={high} value={price} format={{ decimals }} label="52-week range" />
    </div>
  );
}

const PROFILE_LINES = 12;

function Profile({ text, links }: { text: string | null; links: { label: string; href: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const shown = links.filter((l): l is { label: string; href: string } => Boolean(l.href));
  const long = (text?.length ?? 0) > 700;

  return (
    <div>
      <h3 className="micro-label border-b border-ink pb-1">Profile</h3>
      {text ? (
        <p className="pt-1.5 text-[13px] leading-5" style={long && !open ? { display: "-webkit-box", WebkitLineClamp: PROFILE_LINES, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>
          {text}
        </p>
      ) : (
        <p className="pt-1.5 text-[13px] text-muted">No description from the source.</p>
      )}
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] text-muted underline decoration-hairline underline-offset-2 hover:text-ink">
          {open ? "Show less" : "Read more"}
        </button>
      )}
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 text-[12px]">
          {shown.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-2 hover:decoration-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

