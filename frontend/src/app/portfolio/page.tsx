import type { Metadata } from "next";
import { PageTitle } from "@/components/PageTitle";
import { Holdings } from "@/functions/PORT/Holdings";
import { Transactions } from "@/functions/TXN/Transactions";
import { PORT } from "@/functions/PORT";
import { TXN } from "@/functions/TXN";

export const metadata: Metadata = { title: "Portfolio · The Daily Tape" };

export default function Portfolio() {
  return (
    <>
      <PageTitle title="Portfolio" standfirst="What you own, what it cost with every fee, and what it's worth in pesos." />
      <Holdings mnemonic={PORT.mnemonic} title={PORT.title} />
      <div className="mt-6">
        <Transactions mnemonic={TXN.mnemonic} title={TXN.title} />
      </div>
    </>
  );
}
