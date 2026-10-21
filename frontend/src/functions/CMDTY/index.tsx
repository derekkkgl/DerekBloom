import type { TerminalFunction } from "@/lib/registry";
import { CommodityBoard } from "./CommodityBoard";

export const CMDTY: TerminalFunction = {
  mnemonic: "CMDTY",
  title: "Commodities",
  description: "Gold, silver, crude oil, natural gas, copper, and wheat futures with day and year-to-date change.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: CommodityBoard,
};
