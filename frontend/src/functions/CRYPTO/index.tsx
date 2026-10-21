import { ComingSoon } from "@/components/ComingSoon";
import type { TerminalFunction } from "@/lib/registry";

function CryptoBoard() {
  return <ComingSoon phase={3}>The top coins by market cap, priced in USD and PHP, with 1h, 24h, and 7-day change and a 7-day sparkline.</ComingSoon>;
}

export const CRYPTO: TerminalFunction = {
  mnemonic: "CRYPTO",
  title: "Crypto board",
  description: "Top coins by market cap in USD and PHP, with 1h, 24h, and 7d change and a 7-day sparkline.",
  needsTicker: false,
  section: "markets",
  component: CryptoBoard,
};
