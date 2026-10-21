import type { TerminalFunction } from "@/lib/registry";
import { DefiMonitor } from "./DefiMonitor";

export const DEFI: TerminalFunction = {
  mnemonic: "DEFI",
  title: "DeFi monitor",
  description: "Total value locked in DeFi with its 1-year history, the top chains, and the top DeFi apps (DefiLlama).",
  needsTicker: false,
  section: "markets",
  group: "crypto",
  component: DefiMonitor,
};
