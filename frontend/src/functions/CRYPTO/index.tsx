import type { TerminalFunction } from "@/lib/registry";
import { CryptoBoard } from "./CryptoBoard";

export const CRYPTO: TerminalFunction = {
  mnemonic: "CRYPTO",
  title: "Crypto board",
  description: "Top coins by market cap in USD or PHP, with 1h, 24h, and 7d change and a 7-day sparkline.",
  needsTicker: false,
  section: "markets",
  component: CryptoBoard,
};
