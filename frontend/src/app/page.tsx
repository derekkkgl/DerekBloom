import { ComingSoon } from "@/components/ComingSoon";
import { Panel } from "@/components/Panel";

// The front page: US stocks and ETFs lead, crypto and world indices beside them,
// headlines across the bottom. Wired to live data in Phase 3.
export default function Home() {
  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-[2fr_1fr_1fr]">
        <Panel title="US stocks and ETFs">
          <ComingSoon phase={3}>
            Prices and day change for AAPL, NVDA, VOO, QQQ and the rest of your list, with a quick look at each chart.
          </ComingSoon>
        </Panel>
        <Panel title="Crypto" className="md:border-l md:border-l-hairline md:pl-6">
          <ComingSoon phase={3}>BTC, ETH, XRP and the other top coins in USD and PHP, with 24-hour change.</ComingSoon>
        </Panel>
        <Panel title="World indices" className="md:border-l md:border-l-hairline md:pl-6">
          <ComingSoon phase={3}>The major indices of the Americas, Europe, and Asia, and which markets are open now.</ComingSoon>
        </Panel>
      </div>
      <Panel title="Headlines" className="mt-4">
        <ComingSoon phase={3}>The latest markets and crypto stories from RSS, newest first.</ComingSoon>
      </Panel>
    </>
  );
}
