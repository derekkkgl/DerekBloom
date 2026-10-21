import type { Metadata } from "next";
import { FunctionList } from "@/components/FunctionList";
import { PageTitle } from "@/components/PageTitle";
import { Panel } from "@/components/Panel";
import { functionsIn } from "@/lib/registry";

export const metadata: Metadata = { title: "Markets · The Daily Tape" };

export default function Markets() {
  return (
    <>
      <PageTitle title="Markets" standfirst="Stocks, ETFs, crypto, and world indices. Every screen opens from Look up." />
      <Panel title="In this section">
        <FunctionList functions={functionsIn("markets")} />
        <p className="mt-2 text-[12px] text-muted">
          Currencies, commodities, rates, and the crypto market overview arrive in Phase 5.
        </p>
      </Panel>
    </>
  );
}
