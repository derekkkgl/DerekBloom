import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";
import { PageTitle } from "@/components/PageTitle";
import { Panel } from "@/components/Panel";

export const metadata: Metadata = { title: "Portfolio · The Daily Tape" };

export default function Portfolio() {
  return (
    <>
      <PageTitle title="Portfolio" standfirst="What you own, what it cost, and what it's worth in pesos." />
      <Panel title="Holdings" mnemonic="PORT">
        <ComingSoon phase={4}>
          Holdings built from your transactions, with cost basis that includes trading fees, spreads, and FX costs,
          plus value and profit or loss in PHP.
        </ComingSoon>
      </Panel>
      <Panel title="Transactions" mnemonic="TXN" className="mt-4">
        <ComingSoon phase={4}>Buys, sells, dividends, deposits, and transfers, with CSV import from exchange and broker exports.</ComingSoon>
      </Panel>
    </>
  );
}
