import type { TerminalFunction } from "@/lib/registry";
import { WorldMap } from "./WorldMap";

export const WMAP: TerminalFunction = {
  mnemonic: "WMAP",
  title: "World market map",
  description: "Two dozen national stock indices as squares on a world map, tinted by today's move, with a table by region.",
  needsTicker: false,
  section: "markets",
  group: "world",
  component: WorldMap,
};
