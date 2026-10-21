import type { TerminalFunction } from "@/lib/registry";
import { NewsWire } from "./NewsWire";

export const N: TerminalFunction = {
  mnemonic: "N",
  title: "News wire",
  description: "Markets and crypto headlines from RSS feeds, newest first.",
  needsTicker: false,
  section: "news",
  component: NewsWire,
};
