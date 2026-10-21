import type { TerminalFunction } from "@/lib/registry";
import { Description } from "./Description";

export const DES: TerminalFunction = {
  mnemonic: "DES",
  title: "Description",
  description: "Profile and key stats: valuation and 52-week range for stocks, fund facts for ETFs, supply and all-time high for coins.",
  needsTicker: true,
  section: "markets",
  component: Description,
};
