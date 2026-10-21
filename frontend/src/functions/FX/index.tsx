import type { TerminalFunction } from "@/lib/registry";
import { Currencies } from "./Currencies";

export const FX: TerminalFunction = {
  mnemonic: "FX",
  title: "World currencies",
  description: "The euro, yen, pound, franc, Aussie and Canadian dollars, yuan, and Singapore dollar against the dollar and the peso, the dollar index, and cross rates.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: Currencies,
};
