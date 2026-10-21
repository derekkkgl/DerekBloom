import type { Metadata } from "next";
import { FunctionList } from "@/components/FunctionList";
import { PageTitle } from "@/components/PageTitle";
import { Panel } from "@/components/Panel";
import { functionsIn, functionsInGroup, MARKET_GROUPS } from "@/lib/registry";

export const metadata: Metadata = { title: "Markets · The Daily Tape" };

// Still to come in Phase 5, shown as plain text (never numbers) under their group.
const COMING: Record<string, string> = {
  rates: "The US yield curve, Fed funds and Treasury rates, and the economic calendar arrive in Phase 5c.",
};

export default function Markets() {
  const anyTicker = functionsIn("markets").filter((f) => !f.group);
  return (
    <>
      <PageTitle title="Markets" standfirst="Stocks, ETFs, crypto, and world indices. Every screen opens from Look up." />
      {MARKET_GROUPS.map((group) => {
        const functions = functionsInGroup(group.id);
        return (
          <Panel key={group.id} title={group.title}>
            {functions.length > 0 && <FunctionList functions={functions} />}
            {COMING[group.id] && <p className="mt-2 text-[12px] text-muted">{COMING[group.id]}</p>}
          </Panel>
        );
      })}
      <Panel title="Any stock, ETF, or coin">
        <FunctionList functions={anyTicker} />
      </Panel>
    </>
  );
}
