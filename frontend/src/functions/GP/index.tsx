import { ComingSoon } from "@/components/ComingSoon";
import type { FunctionScreenProps, TerminalFunction } from "@/lib/registry";

function PriceChart({ ticker }: FunctionScreenProps) {
  return <ComingSoon phase={3}>A candlestick chart of {ticker} with volume and 20, 50, and 200-day moving averages.</ComingSoon>;
}

export const GP: TerminalFunction = {
  mnemonic: "GP",
  title: "Price chart",
  description: "Candlestick chart with volume and 20, 50, and 200-day moving averages.",
  needsTicker: true,
  section: "markets",
  component: PriceChart,
};
