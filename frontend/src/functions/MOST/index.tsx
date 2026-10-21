import type { TerminalFunction } from "@/lib/registry";
import { MostActive } from "./MostActive";

export const MOST: TerminalFunction = {
  mnemonic: "MOST",
  title: "Most active US stocks",
  description: "Up to 25 US stocks with the most shares traded today, with volume against their 3-month average.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: MostActive,
};
