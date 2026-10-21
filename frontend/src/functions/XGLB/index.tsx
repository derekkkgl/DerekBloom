import type { TerminalFunction } from "@/lib/registry";
import { GlobalCrypto } from "./GlobalCrypto";

export const XGLB: TerminalFunction = {
  mnemonic: "XGLB",
  title: "Global crypto overview",
  description: "Total crypto market cap and volume, Bitcoin, Ether, and stablecoin shares, stablecoin supply, and the Fear & Greed Index with a year of history.",
  needsTicker: false,
  section: "markets",
  group: "crypto",
  component: GlobalCrypto,
};
