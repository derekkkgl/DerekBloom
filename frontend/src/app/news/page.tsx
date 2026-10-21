import type { Metadata } from "next";
import { FunctionList } from "@/components/FunctionList";
import { PageTitle } from "@/components/PageTitle";
import { Panel } from "@/components/Panel";
import { functionsIn } from "@/lib/registry";

export const metadata: Metadata = { title: "News · The Daily Tape" };

export default function News() {
  return (
    <>
      <PageTitle title="News" standfirst="Markets and crypto headlines, deduplicated, newest first." />
      <Panel title="In this section">
        <FunctionList functions={functionsIn("news")} />
        <p className="mt-2 text-[12px] text-muted">The news wire arrives in Phase 3. News for a single ticker (CN) follows in Phase 6.</p>
      </Panel>
    </>
  );
}
