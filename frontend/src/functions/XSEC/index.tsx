import type { TerminalFunction } from "@/lib/registry";
import { CryptoSectors } from "./CryptoSectors";

export const XSEC: TerminalFunction = {
  mnemonic: "XSEC",
  title: "Crypto sectors",
  description: "Layer 1, DeFi, AI, memes, RWA and other sectors as a heat map of 24-hour change, with the top 100 categories in a table.",
  needsTicker: false,
  section: "markets",
  group: "crypto",
  component: CryptoSectors,
};
