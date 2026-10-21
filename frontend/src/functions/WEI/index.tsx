import type { TerminalFunction } from "@/lib/registry";
import { WorldIndices } from "./WorldIndices";

export const WEI: TerminalFunction = {
  mnemonic: "WEI",
  title: "World equity indices",
  description: "Global stock indices by region with day and YTD change, plus BTC, gold, oil, the dollar, and US yields.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: WorldIndices,
};
