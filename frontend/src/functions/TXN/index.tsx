import type { TerminalFunction } from "@/lib/registry";
import { Transactions } from "./Transactions";

export const TXN: TerminalFunction = {
  mnemonic: "TXN",
  title: "Transactions",
  description: "Add, edit, and delete buys, sells, dividends, rewards, transfers, and deposits, with fees.",
  needsTicker: false,
  section: "portfolio",
  component: Transactions,
};
