import type { TerminalFunction } from "@/lib/registry";
import { Directory } from "./Directory";

export const HELP: TerminalFunction = {
  mnemonic: "HELP",
  title: "Function directory",
  description: "Every function, how to type it, and the keyboard shortcuts.",
  needsTicker: false,
  section: "home",
  component: Directory,
};
