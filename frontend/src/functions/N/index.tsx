import { ComingSoon } from "@/components/ComingSoon";
import type { TerminalFunction } from "@/lib/registry";

function NewsWire() {
  return <ComingSoon phase={3}>Markets and crypto headlines from CNBC, MarketWatch, CoinDesk, Cointelegraph, and Decrypt, newest first.</ComingSoon>;
}

export const N: TerminalFunction = {
  mnemonic: "N",
  title: "News wire",
  description: "Markets and crypto headlines from RSS feeds, newest first.",
  needsTicker: false,
  section: "news",
  component: NewsWire,
};
