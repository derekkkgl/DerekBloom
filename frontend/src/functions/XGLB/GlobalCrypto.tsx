"use client";

import { LineChart, type Line } from "@/components/LineChart";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Num } from "@/components/Num";
import { Panel } from "@/components/Panel";
import { Stat, StatList } from "@/components/StatList";
import { combineMeta, type CryptoGlobal, type FearGreed, type Stablecoins } from "@/lib/api";
import { money, pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const GLOBAL_POLL_MS = 300_000; // CoinGecko's global numbers are cached 5 minutes
const DAILY_POLL_MS = 1_800_000; // stablecoin supply and Fear & Greed change about once a day

const COLUMNS =
  "grid grid-cols-1 gap-y-4 md:grid-cols-3 md:gap-x-0 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline";

export function GlobalCrypto({ mnemonic, title }: FunctionScreenProps) {
  const global = useApi<CryptoGlobal>("/api/crypto/global", GLOBAL_POLL_MS);
  const stables = useApi<Stablecoins>("/api/crypto/stablecoins", DAILY_POLL_MS);
  const [currency] = useDisplayCurrency();

  const g = global.data;
  const s = stables.data;
  const cap = money(g?.market_cap_usd, g?.market_cap_php, currency);
  const volume = money(g?.volume_24h_usd, g?.volume_24h_php, currency);
  const supply = money(s?.supply_usd, s?.supply_php, currency);
  // Stablecoin share: DefiLlama's supply over CoinGecko's total cap, both in dollars.
  const stableShare = g?.market_cap_usd && s ? (s.supply_usd / g.market_cap_usd) * 100 : null;
  const rest =
    g?.btc_dominance_pct != null && g.eth_dominance_pct != null && stableShare !== null
      ? 100 - g.btc_dominance_pct - g.eth_dominance_pct - stableShare
      : null;

  return (
    <>
      <Panel title={title} mnemonic={mnemonic} meta={combineMeta(global.meta, stables.meta)}>
        <p className="mb-2 text-[13px] text-muted">
          The whole crypto market at a glance: its size, how much traded, and how much of it is Bitcoin, Ether, and dollar stablecoins.
        </p>
        <UpdateFailed error={g ? global.error : null} />
        <UpdateFailed error={s ? stables.error : null} />
        <div className={COLUMNS}>
          {/* CoinGecko and DefiLlama fail on their own: one source down never hides the other. */}
          {!g ? (
            <div className="md:col-span-2">
              <Pending error={global.error} rows={4} />
            </div>
          ) : (
            <>
              <StatList title="Market">
                <Stat label="Total market cap"><Num value={cap.value} compact currency={cap.currency} /></Stat>
                <Stat label="Change 24h"><Num value={g.market_cap_change_24h_pct} change percent decimals={2} /></Stat>
                <Stat label="Volume 24h">
                  <Num value={volume.value} compact currency={volume.currency} />
                  {g.volume_unreliable && <span className="ml-1 text-[12px] text-muted">see note</span>}
                </Stat>
                <Stat label="Coins tracked"><Num value={g.active_coins} decimals={0} /></Stat>
              </StatList>
              <StatList title="Share of market cap">
                <Stat label="Bitcoin"><Num value={g.btc_dominance_pct} percent decimals={1} /></Stat>
                <Stat label="Ether"><Num value={g.eth_dominance_pct} percent decimals={1} /></Stat>
                <Stat label="Stablecoins"><Num value={stableShare} percent decimals={1} /></Stat>
                <Stat label="Everything else"><Num value={rest} percent decimals={1} /></Stat>
              </StatList>
            </>
          )}
          <StatList title="Stablecoin supply">
            {!s ? (
              <Pending error={stables.error} rows={3} />
            ) : (
              <>
                <Stat label="Total supply"><Num value={supply.value} compact currency={supply.currency} /></Stat>
                <Stat label="Change 7d"><Num value={s.change_7d_pct} change percent decimals={2} /></Stat>
                <Stat label="Change 30d"><Num value={s.change_30d_pct} change percent decimals={2} /></Stat>
                <Stat label="As of"><span className="font-mono text-[12px]">{s.date}</span></Stat>
              </>
            )}
          </StatList>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Market cap, volume, and Bitcoin and Ether shares from CoinGecko (peso figures are CoinGecko&apos;s own). Stablecoin supply from DefiLlama: every
          stablecoin, valued in dollars.{" "}
          {g?.volume_unreliable && "CoinGecko's 24-hour volume is larger than the whole market cap right now, which can't be right, so it isn't shown. "}
          {pesoNote(currency, s?.usd_php)}
        </p>
      </Panel>
      <FearGreedPanel />
    </>
  );
}

function FearGreedPanel() {
  const fng = useApi<FearGreed>("/api/crypto/fear-greed?days=365", DAILY_POLL_MS);
  const f = fng.data;
  const lines: Line[] = f ? [{ label: "Fear & Greed", color: "#141414", data: f.history.map((p) => ({ time: p.date, value: p.value })) }] : [];

  return (
    <Panel title="Fear & Greed Index" mnemonic="XGLB" meta={fng.meta}>
      <UpdateFailed error={f ? fng.error : null} />
      {!f ? (
        <Pending error={fng.error} rows={6} />
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[220px_1fr]">
          <StatList title="Reading">
            <Stat label="Today">
              <Num value={f.value} decimals={0} /> <span className="ml-1 text-[12px]">{f.label}</span>
            </Stat>
            <Stat label="Yesterday"><Num value={f.yesterday} decimals={0} /></Stat>
            <Stat label="A week ago"><Num value={f.week_ago} decimals={0} /></Stat>
            <Stat label="A month ago"><Num value={f.month_ago} decimals={0} /></Stat>
          </StatList>
          <div className="md:border-l md:border-hairline md:pl-4">
            <LineChart lines={lines} decimals={0} height={200} daily label="Crypto Fear and Greed Index, daily, over the last year" />
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        0 is extreme fear, 100 is extreme greed. It blends Bitcoin&apos;s volatility, volume, social media, dominance, and search trends, and is published once a day.
        Data: <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer" className="underline decoration-hairline underline-offset-2 hover:decoration-ink">alternative.me Crypto Fear &amp; Greed Index</a>.
      </p>
    </Panel>
  );
}
