import type { TerminalFunction } from "@/lib/registry";
import { Holdings } from "./Holdings";

export const PORT: TerminalFunction = {
  mnemonic: "PORT",
  title: "Portfolio",
  description: "Your holdings at average cost with fees, value and P&L in PHP or USD, allocation, cash, and FX cost per account.",
  needsTicker: false,
  section: "portfolio",
  component: Holdings,
};
