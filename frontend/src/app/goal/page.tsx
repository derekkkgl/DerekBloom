import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";
import { PageTitle } from "@/components/PageTitle";
import { Panel } from "@/components/Panel";

export const metadata: Metadata = { title: "Goal · The Daily Tape" };

export default function Goal() {
  return (
    <>
      <PageTitle title="Goal" standfirst="Progress toward your monthly passive income target." />
      <Panel title="Income goal" mnemonic="GOAL">
        <ComingSoon phase={4}>
          Your monthly income target (₱2,000 to start), what your holdings yield today, the capital still needed, and
          how many months it takes at your monthly contribution.
        </ComingSoon>
      </Panel>
      <Panel title="Cash-flow yield" mnemonic="YLD" className="mt-4">
        <ComingSoon phase={4}>Expected yearly income from each holding: dividends, plus staking or interest you enter.</ComingSoon>
      </Panel>
    </>
  );
}
