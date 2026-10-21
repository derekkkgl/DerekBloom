"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { CommitInput } from "@/components/CommitInput";
import { CsvLink } from "@/components/CsvLink";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { apiSend, type CashCurrency, type Portfolio, type Slice } from "@/lib/api";
import { commandHref } from "@/lib/command";
import { useDisplayCurrency } from "@/lib/currency";
import { formatDate, moneyDecimals, priceDecimals, unitDecimals } from "@/lib/format";
import { announcePortfolioChange, barWidth, CASH_CURRENCIES, onPortfolioChange } from "@/lib/portfolio";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";
import { useRowLink } from "@/lib/useRowLink";

const PORTFOLIO_POLL_MS = 60_000; // backend caches the Yahoo prices for 60s

const HEADINGS: [string, boolean][] = [
  ["Asset", false],
  ["Units", true],
  ["Avg cost", true],
  ["Price", true],
  ["Value", true],
  ["P&L", true],
  ["P&L %", true],
  ["Day", true],
  ["Weight", true],
];

export function Holdings({ mnemonic, title }: FunctionScreenProps) {
  const [currency] = useDisplayCurrency();
  const port = useApi<Portfolio>(`/api/portfolio?currency=${currency}`, PORTFOLIO_POLL_MS);
  const reload = port.reload;
  useEffect(() => onPortfolioChange(reload), [reload]);

  const p = port.data;
  return (
    <Panel title={title} mnemonic={mnemonic} meta={port.meta} actions={<CsvLink path={`/api/portfolio?format=csv&currency=${currency}`} />}>
      <UpdateFailed error={p ? port.error : null} />
      {!p ? (
        <Pending error={port.error} rows={8} />
      ) : (
        <>
          <Totals p={p} />
          <HoldingsTable p={p} />
          <Allocation p={p} />
          <Accounts p={p} />
          <Notes p={p} />
        </>
      )}
    </Panel>
  );
}

// --- Hero totals ---------------------------------------------------------------

function Figure({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="micro-label">{label}</p>
      <div className="text-[26px] leading-9 font-medium">{children}</div>
      {note && <div className="text-[13px]">{note}</div>}
    </div>
  );
}

function Totals({ p }: { p: Portfolio }) {
  const t = p.totals;
  const cur = p.currency;
  const d = moneyDecimals(cur);
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink pt-2 pb-3 md:grid-cols-5">
      <Figure label="Value" note={t.cash ? <span className="text-muted">incl. <Num value={t.cash} decimals={d} currency={cur} /> cash</span> : null}>
        <Num value={t.value} decimals={d} currency={cur} />
      </Figure>
      <Figure label="Cost">
        <Num value={t.cost} decimals={d} currency={cur} />
      </Figure>
      <Figure label="Unrealized P&L" note={<Num value={t.unrealized_pct} change percent decimals={2} />}>
        <Num value={t.unrealized} change decimals={d} currency={cur} />
      </Figure>
      <Figure label="Today" note={<Num value={t.day_change_pct} change percent decimals={2} />}>
        <Num value={t.day_change} change decimals={d} currency={cur} />
      </Figure>
      <Figure label="Realized" note={t.dividends ? <span className="text-muted">plus <Num value={t.dividends} decimals={d} currency={cur} /> dividends</span> : null}>
        <Num value={t.realized} change decimals={d} currency={cur} />
      </Figure>
    </div>
  );
}

// --- Holdings ------------------------------------------------------------------

function HoldingsTable({ p }: { p: Portfolio }) {
  const rowLink = useRowLink();
  const cur = p.currency;
  const d = moneyDecimals(cur);
  const priced = p.holdings.filter((h) => h.value !== null);
  // A column's total, or null (shown as —) when no row has a number in it.
  const sum = (pick: (h: (typeof priced)[number]) => number | null) => {
    const known = priced.map(pick).filter((v): v is number => v !== null);
    return known.length ? known.reduce((acc, v) => acc + v, 0) : null;
  };
  const totalPnl = sum((h) => h.pnl);
  const totalCost = sum((h) => h.cost);

  if (p.holdings.length === 0) {
    return <p className="border-t border-ink py-2 text-[13px] text-muted">No holdings yet. Add your first buy in TXN below.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-t border-ink border-b">
            {HEADINGS.map(([label, right]) => (
              <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.holdings.map((h) => {
            const href = commandHref({ mnemonic: "DES", ticker: h.asset });
            const link = rowLink(href);
            return (
              <tr key={h.asset} onClick={link.onClick} className={`h-7 border-b border-hairline ${link.className}`}>
                <td className="px-1.5">
                  <Link href={href} className="font-mono text-[12px] font-medium hover:underline">
                    {h.asset}
                  </Link>
                  <span className="ml-2 text-muted">{h.name}</span>
                </td>
                <td className="px-1.5 text-right"><Num value={h.units} decimals={unitDecimals(h.units)} /></td>
                <td className="px-1.5 text-right">
                  <Num value={h.avg_cost} decimals={priceDecimals(h.asset, h.avg_cost)} currency={cur} />
                </td>
                <td className="px-1.5 text-right"><Num value={h.price} decimals={priceDecimals(h.asset, h.price)} currency={cur} /></td>
                <td className="px-1.5 text-right"><Num value={h.value} decimals={d} currency={cur} /></td>
                <td className="px-1.5 text-right"><Num value={h.pnl} change decimals={d} currency={cur} /></td>
                <td className="px-1.5 text-right"><Num value={h.pnl_pct} change percent decimals={2} /></td>
                <td className="px-1.5 text-right"><Num value={h.day_change} change decimals={d} currency={cur} /></td>
                <td className="px-1.5 text-right"><Num value={h.weight_pct} percent decimals={1} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="h-7 border-t border-ink font-medium">
            <th scope="row" className="px-1.5 text-left text-[13px] font-medium">Holdings</th>
            <td colSpan={3} />
            <td className="px-1.5 text-right"><Num value={p.totals.holdings_value} decimals={d} currency={cur} /></td>
            <td className="px-1.5 text-right"><Num value={totalPnl} change decimals={d} currency={cur} /></td>
            <td className="px-1.5 text-right"><Num value={totalPnl !== null && totalCost ? (totalPnl / totalCost) * 100 : null} change percent decimals={2} /></td>
            <td className="px-1.5 text-right"><Num value={p.totals.day_change} change decimals={d} currency={cur} /></td>
            <td className="px-1.5 text-right"><Num value={sum((h) => h.weight_pct)} percent decimals={1} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// --- Allocation ------------------------------------------------------------------

function Allocation({ p }: { p: Portfolio }) {
  if (p.totals.value <= 0) return null;
  const groups: [string, Slice[]][] = [
    ["By asset class", p.allocation.class],
    ["By region", p.allocation.region],
    ["By currency", p.allocation.currency],
  ];
  return (
    <div className="mt-4 grid grid-cols-1 gap-y-4 md:grid-cols-3 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline">
      {groups.map(([label, slices]) => (
        <div key={label}>
          <h3 className="micro-label border-b border-ink pb-1">{label}</h3>
          <table className="w-full text-[13px]">
            <tbody>
              {slices.map((s) => (
                <tr key={s.label} className="h-6 border-b border-hairline">
                  <td className="w-[40%] truncate pr-2">{s.label}</td>
                  <td className="w-16 pr-3 text-right"><Num value={s.pct} percent decimals={1} /></td>
                  <td aria-hidden="true">
                    <div className="h-1 bg-ink" style={{ width: barWidth(s.pct) }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// --- Accounts and cash --------------------------------------------------------

function Accounts({ p }: { p: Portfolio }) {
  const cashOf = (account: number, currency: CashCurrency) =>
    p.cash.find((c) => c.account_id === account && c.currency === currency)?.amount ?? null;

  async function setCash(account: number, currency: CashCurrency, amount: number | null) {
    await apiSend("PUT", `/api/accounts/${account}/cash`, { currency, amount: amount ?? 0 });
    announcePortfolioChange();
  }

  return (
    <div className="mt-4">
      <h3 className="micro-label border-b border-ink pb-1">Cash</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[13px]">
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="micro-label px-1.5 py-1 text-left font-normal">Account</th>
              {CASH_CURRENCIES.map((c) => (
                <th key={c} scope="col" className="micro-label w-28 px-1.5 py-1 text-right font-normal">Cash {c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.accounts.map((a) => (
              <tr key={a.account_id} className="h-8 border-b border-hairline">
                <th scope="row" className="px-1.5 text-left font-normal">{a.account}</th>
                {CASH_CURRENCIES.map((c) => (
                  <td key={c} className="px-1.5 align-middle">
                    <CommitInput
                      label={`${a.account} cash in ${c}`}
                      value={cashOf(a.account_id, c)}
                      decimals={2}
                      allowBlank
                      onCommit={(amount) => setCash(a.account_id, c, amount)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Cash is what you type here, per account; buys and sells don&apos;t change it.
      </p>
    </div>
  );
}

// --- Footnotes -------------------------------------------------------------------

function Notes({ p }: { p: Portfolio }) {
  return (
    <div className="mt-3 space-y-0.5 text-[11px] text-muted">
      <p>
        {p.currency === "PHP"
          ? <>Values in pesos at USD/PHP <Num value={p.usd_php} decimals={3} /> (Yahoo, {formatDate(p.usd_php_date)}). Costs include trading fees and use USD/PHP on each trade date, so P&amp;L includes the peso&apos;s move.</>
          : <>Values in dollars. A Coins.ph buy&apos;s dollar cost uses USD/PHP on its own trade date.</>}{" "}
        Prices are Yahoo&apos;s latest close; crypto is valued at Yahoo&apos;s USD price.
      </p>
      {p.warnings.map((w) => (
        <p key={w} role="status" className="text-ink">{w}</p>
      ))}
    </div>
  );
}
