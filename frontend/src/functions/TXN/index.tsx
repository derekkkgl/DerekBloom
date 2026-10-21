import type { TerminalFunction } from "@/lib/registry";
import { Transactions } from "./Transactions";

export const TXN: TerminalFunction = {
  mnemonic: "TXN",
  title: "Transactions",
  description: "Add, edit, and delete deposits, buys, sells, dividends, rewards, and transfers, with fees and the pesos you sent.",
  needsTicker: false,
  section: "portfolio",
  component: Transactions,
};
