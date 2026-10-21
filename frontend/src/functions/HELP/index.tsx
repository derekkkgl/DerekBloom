import { ComingSoon } from "@/components/ComingSoon";
import type { TerminalFunction } from "@/lib/registry";

function Directory() {
  return <ComingSoon phase={3}>A directory of every function with its syntax and keyboard shortcuts, generated from the registry.</ComingSoon>;
}

export const HELP: TerminalFunction = {
  mnemonic: "HELP",
  title: "Function directory",
  description: "Every function, how to type it, and the keyboard shortcuts.",
  needsTicker: false,
  section: "home",
  component: Directory,
};
