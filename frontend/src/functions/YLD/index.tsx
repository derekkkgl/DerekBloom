import type { TerminalFunction } from "@/lib/registry";
import { CashFlowYield } from "./CashFlowYield";

export const YLD: TerminalFunction = {
  mnemonic: "YLD",
  title: "Cash-flow yield",
  description: "Yearly income from each holding in pesos: dividends after withholding, staking rewards, or a rate you set.",
  needsTicker: false,
  section: "goal",
  component: CashFlowYield,
};
