import type { TerminalFunction } from "@/lib/registry";
import { PriceChart } from "./PriceChart";

export const GP: TerminalFunction = {
  mnemonic: "GP",
  title: "Price chart",
  description: "Candlestick chart with volume and 20, 50, and 200-bar moving averages, from one day to the full history.",
  needsTicker: true,
  section: "markets",
  component: PriceChart,
};
