import type { TerminalFunction } from "@/lib/registry";
import { UsMovers } from "./UsMovers";

export const MOV: TerminalFunction = {
  mnemonic: "MOV",
  title: "Top gainers and losers",
  description: "The US stocks that rose and fell the most today, among companies worth at least $2 billion.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: UsMovers,
};
