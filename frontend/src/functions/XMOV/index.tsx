import type { TerminalFunction } from "@/lib/registry";
import { CryptoMovers } from "./CryptoMovers";

export const XMOV: TerminalFunction = {
  mnemonic: "XMOV",
  title: "Crypto movers",
  description: "Top gainers and losers among the 200 biggest coins over 24 hours or 7 days, and CoinGecko's trending coins.",
  needsTicker: false,
  section: "markets",
  group: "crypto",
  component: CryptoMovers,
};
