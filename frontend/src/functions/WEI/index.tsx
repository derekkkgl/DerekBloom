import { ComingSoon } from "@/components/ComingSoon";
import type { TerminalFunction } from "@/lib/registry";

function WorldIndices() {
  return <ComingSoon phase={3}>The world board: Americas, Europe, and Asia-Pacific indices with day and year-to-date change and whether each market is open.</ComingSoon>;
}

export const WEI: TerminalFunction = {
  mnemonic: "WEI",
  title: "World equity indices",
  description: "Global stock indices by region with day and YTD change, plus BTC, gold, oil, the dollar, and US yields.",
  needsTicker: false,
  section: "markets",
  component: WorldIndices,
};
