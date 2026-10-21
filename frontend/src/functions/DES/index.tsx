import { ComingSoon } from "@/components/ComingSoon";
import type { FunctionScreenProps, TerminalFunction } from "@/lib/registry";

function Description({ ticker }: FunctionScreenProps) {
  return <ComingSoon phase={3}>Profile and key stats for {ticker}: valuation and 52-week range for stocks, supply and all-time high for coins.</ComingSoon>;
}

export const DES: TerminalFunction = {
  mnemonic: "DES",
  title: "Description",
  description: "Profile and key stats for a stock, ETF, or coin.",
  needsTicker: true,
  section: "markets",
  component: Description,
};
