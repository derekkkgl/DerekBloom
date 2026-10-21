"use client";

import { Pending, UpdateFailed } from "@/components/LoadState";
import { Panel } from "@/components/Panel";
import { ScreenTable } from "@/components/ScreenTable";
import type { Screen } from "@/lib/api";
import { pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const SCREEN_POLL_MS = 120_000; // screeners are cached 2 minutes

export function UsMovers({ mnemonic, title }: FunctionScreenProps) {
  const gainers = useApi<Screen>("/api/screen/gainers", SCREEN_POLL_MS);
  const losers = useApi<Screen>("/api/screen/losers", SCREEN_POLL_MS);
  const [currency] = useDisplayCurrency();
  const error = gainers.error ?? losers.error;
  const ready = gainers.data && losers.data;

  return (
    <Panel title={title} mnemonic={mnemonic} meta={gainers.meta}>
      <p className="mb-2 text-[13px] text-muted">The biggest rises and falls in US stocks today. A row opens the company&apos;s description.</p>
      <UpdateFailed error={ready ? error : null} />
      {!ready ? (
        <Pending error={error} rows={12} />
      ) : (
        <div className="grid grid-cols-1 gap-y-4 md:grid-cols-2 md:gap-x-0 [&>*]:md:px-4 [&>*:first-child]:md:pl-0 [&>*:last-child]:md:pr-0 [&>*+*]:md:border-l [&>*+*]:md:border-hairline">
          <ScreenTable rows={gainers.data!.rows} currency={currency} caption="Gainers" csvPath="/api/screen/gainers?format=csv" empty="No US stock is up more than 3% today." />
          <ScreenTable rows={losers.data!.rows} currency={currency} caption="Losers" csvPath="/api/screen/losers?format=csv" empty="No US stock is down more than 2.5% today." />
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Yahoo&apos;s screens: gainers are up over 3% and losers down over 2.5%, among US listings worth at least $2 billion and priced at $5 or
        more. Yahoo picks the stocks a few minutes behind the prices it sends, so the lists are sorted by the change shown and a stock can sit
        just inside a threshold. {pesoNote(currency, gainers.data?.usd_php)}
      </p>
    </Panel>
  );
}
