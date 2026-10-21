"use client";

import { CsvLink } from "@/components/CsvLink";
import { LineChart, type Line } from "@/components/LineChart";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Stat, StatList } from "@/components/StatList";
import { combineMeta, type DefiChains, type DefiProtocols, type DefiTvl } from "@/lib/api";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const DEFI_POLL_MS = 1_800_000; // DefiLlama answers are cached an hour

export function DefiMonitor({ mnemonic, title }: FunctionScreenProps) {
  const tvl = useApi<DefiTvl>("/api/defi/tvl?days=365", DEFI_POLL_MS);
  const [currency] = useDisplayCurrency();
  const t = tvl.data;
  const total = money(t?.tvl_usd, t?.tvl_php, currency);
  const lines: Line[] = t ? [{ label: "Total value locked (USD)", color: "#141414", data: t.history.map((p) => ({ time: p.date, value: p.value })) }] : [];

  return (
    <>
      <Panel title={title} mnemonic={mnemonic} meta={tvl.meta}>
        <p className="mb-2 text-[13px] text-muted">
          Total value locked (TVL) is the money people have deposited into DeFi apps: lending pools, exchanges that run on code, and staking. Exchanges&apos;
          own reserves are left out.
        </p>
        <UpdateFailed error={t ? tvl.error : null} />
        {!t ? (
          <Pending error={tvl.error} rows={6} />
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[220px_1fr]">
            <StatList title="All DeFi">
              <Stat label="Value locked"><Num value={total.value} compact currency={total.currency} /></Stat>
              <Stat label="Change 1d"><Num value={t.change_1d_pct} change percent decimals={2} /></Stat>
              <Stat label="Change 7d"><Num value={t.change_7d_pct} change percent decimals={2} /></Stat>
              <Stat label="Change 30d"><Num value={t.change_30d_pct} change percent decimals={2} /></Stat>
              <Stat label="As of"><span className="font-mono text-[12px]">{t.date}</span></Stat>
            </StatList>
            <div className="md:border-l md:border-hairline md:pl-4">
              <LineChart lines={lines} currency="USD" decimals={0} height={220} daily compact label="Total DeFi value locked in dollars, daily, over the last year" />
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted">The chart stays in dollars: converting past days at today&apos;s peso rate would mislead. {pesoNote(currency, t?.usd_php)}</p>
      </Panel>
      <ChainsAndProtocols />
    </>
  );
}

function Head({ labels }: { labels: [string, boolean][] }) {
  return (
    <thead>
      <tr className="border-b border-ink">
        {labels.map(([label, right]) => (
          <th key={label} scope="col" className={`micro-label px-1.5 py-1 font-normal ${right ? "text-right" : "text-left"}`}>{label}</th>
        ))}
      </tr>
    </thead>
  );
}

function ChainsAndProtocols() {
  const chains = useApi<DefiChains>("/api/defi/chains", DEFI_POLL_MS);
  const protocols = useApi<DefiProtocols>("/api/defi/protocols", DEFI_POLL_MS);
  const [currency] = useDisplayCurrency();
  const c = chains.data;
  const p = protocols.data;

  return (
    <Panel
      title="Chains and protocols"
      mnemonic="DEFI"
      meta={combineMeta(chains.meta, protocols.meta)}
      actions={
        <>
          <CsvLink path="/api/defi/chains?format=csv" label="CSV chains" />
          <CsvLink path="/api/defi/protocols?format=csv" label="CSV protocols" />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-y-4 lg:grid-cols-[2fr_3fr] lg:gap-x-0 [&>*]:lg:px-4 [&>*:first-child]:lg:pl-0 [&>*:last-child]:lg:pr-0 [&>*+*]:lg:border-l [&>*+*]:lg:border-hairline">
        <div className="min-w-0">
          <UpdateFailed error={c ? chains.error : null} />
          {!c ? (
            <Pending error={chains.error} rows={10} />
          ) : (
            <table className="w-full text-[13px]">
              <caption className="micro-label pb-1 text-left">Top chains by value locked</caption>
              <Head labels={[["#", true], ["Chain", false], ["TVL", true], ["Share", true]]} />
              <tbody>
                {c.chains.map((chain) => {
                  const value = money(chain.tvl_usd, chain.tvl_php, currency);
                  return (
                    <tr key={chain.name ?? chain.rank} className="h-7 border-b border-hairline">
                      <td className="px-1.5 text-right"><Num value={chain.rank} decimals={0} className="text-muted" /></td>
                      <td className="px-1.5">
                        {chain.name}
                        {chain.token && <span className="ml-2 font-mono text-[12px] text-muted">{chain.token}</span>}
                      </td>
                      <td className="px-1.5 text-right"><Num value={value.value} compact currency={value.currency} /></td>
                      <td className="px-1.5 text-right"><Num value={chain.share_pct} percent decimals={1} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <UpdateFailed error={p ? protocols.error : null} />
          {!p ? (
            <Pending error={protocols.error} rows={12} />
          ) : (
            <table className="w-full min-w-[520px] text-[13px]">
              <caption className="micro-label pb-1 text-left">Top DeFi apps by value locked</caption>
              <Head labels={[["#", true], ["Protocol", false], ["Type", false], ["Chains", true], ["TVL", true], ["1d", true], ["7d", true]]} />
              <tbody>
                {p.protocols.map((proto) => {
                  const value = money(proto.tvl_usd, proto.tvl_php, currency);
                  return (
                    <tr key={proto.name ?? proto.rank} className="h-7 border-b border-hairline">
                      <td className="px-1.5 text-right"><Num value={proto.rank} decimals={0} className="text-muted" /></td>
                      <td className="max-w-[180px] truncate px-1.5">
                        {proto.name}
                        {proto.symbol && <span className="ml-2 font-mono text-[12px] text-muted">{proto.symbol}</span>}
                      </td>
                      <td className="whitespace-nowrap px-1.5 text-muted">{proto.category}</td>
                      <td className="px-1.5 text-right"><Num value={proto.chain_count} decimals={0} /></td>
                      <td className="px-1.5 text-right"><Num value={value.value} compact currency={value.currency} /></td>
                      <td className="px-1.5 text-right"><Num value={proto.change_1d_pct} change percent decimals={2} /></td>
                      <td className="px-1.5 text-right"><Num value={proto.change_7d_pct} change percent decimals={2} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted">From DefiLlama. {pesoNote(currency, c?.usd_php ?? p?.usd_php)}</p>
    </Panel>
  );
}
