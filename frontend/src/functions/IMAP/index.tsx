import type { TerminalFunction } from "@/lib/registry";
import { EtfHeatMap } from "./EtfHeatMap";

export const IMAP: TerminalFunction = {
  mnemonic: "IMAP",
  title: "ETF heat map",
  description: "US sector ETFs sized by S&P 500 weight, world ETFs by fund size, and your Home list, all tinted by today's move.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: EtfHeatMap,
};
