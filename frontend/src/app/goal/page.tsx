import type { Metadata } from "next";
import { PageTitle } from "@/components/PageTitle";
import { GOAL } from "@/functions/GOAL";
import { IncomeGoal } from "@/functions/GOAL/IncomeGoal";
import { YLD } from "@/functions/YLD";
import { CashFlowYield } from "@/functions/YLD/CashFlowYield";

export const metadata: Metadata = { title: "Goal · The Daily Tape" };

export default function Goal() {
  return (
    <>
      <PageTitle title="Goal" standfirst="Progress toward your monthly passive income, in pesos." />
      <IncomeGoal mnemonic={GOAL.mnemonic} title={GOAL.title} />
      <div className="mt-6">
        <CashFlowYield mnemonic={YLD.mnemonic} title={YLD.title} />
      </div>
    </>
  );
}
