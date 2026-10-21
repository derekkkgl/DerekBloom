"use client";

import { CsvLink } from "@/components/CsvLink";
import { Pending, UpdateFailed } from "@/components/LoadState";
import { Panel } from "@/components/Panel";
import { ScreenTable } from "@/components/ScreenTable";
import type { Screen } from "@/lib/api";
import { pesoNote } from "@/lib/crypto";
import { useDisplayCurrency } from "@/lib/currency";
import type { FunctionScreenProps } from "@/lib/registry";
import { useApi } from "@/lib/useApi";

const SCREEN_POLL_MS = 120_000; // screeners are cached 2 minutes

export function MostActive({ mnemonic, title }: FunctionScreenProps) {
  const screen = useApi<Screen>("/api/screen/most-active", SCREEN_POLL_MS);
  const [currency] = useDisplayCurrency();
  const s = screen.data;

  return (
    <Panel title={title} mnemonic={mnemonic} meta={screen.meta} actions={<CsvLink path="/api/screen/most-active?format=csv" />}>
      <p className="mb-2 text-[13px] text-muted">
        Where the trading is today. Relative volume is today&apos;s shares traded against the 3-month daily average: 3× means three times a normal day.
      </p>
      <UpdateFailed error={s ? screen.error : null} />
      {!s ? (
        <Pending error={screen.error} rows={12} />
      ) : (
        <ScreenTable rows={s.rows} currency={currency} volume caption="By shares traded today" empty="Yahoo's screen is empty right now." />
      )}
      <p className="mt-2 text-[11px] text-muted">
        Yahoo&apos;s most-actives screen: US listings worth at least $2 billion with over 5 million shares traded in the latest session. Soon
        after the New York open few stocks have reached that, so the list starts short and fills up. {pesoNote(currency, s?.usd_php)}
      </p>
    </Panel>
  );
}
