import type { TerminalFunction } from "@/lib/registry";
import { IncomeGoal } from "./IncomeGoal";

export const GOAL: TerminalFunction = {
  mnemonic: "GOAL",
  title: "Income goal",
  description: "Your monthly income target in pesos: income now, capital needed, months to get there, and the projected path.",
  needsTicker: false,
  section: "goal",
  component: IncomeGoal,
};
