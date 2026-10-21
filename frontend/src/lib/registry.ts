// The function registry: every terminal function is registered here exactly once.
// The command palette, the section pages, and (in Phase 3) HELP are all generated
// from this list, so adding a function never means editing the palette.

import type { ComponentType } from "react";
import { CRYPTO } from "@/functions/CRYPTO";
import { DES } from "@/functions/DES";
import { GP } from "@/functions/GP";
import { HELP } from "@/functions/HELP";
import { N } from "@/functions/N";
import { WEI } from "@/functions/WEI";
import type { SectionId } from "./sections";

export type FunctionScreenProps = { ticker?: string };

export type TerminalFunction = {
  mnemonic: string;
  title: string;
  description: string;
  needsTicker: boolean;
  section: SectionId;
  component: ComponentType<FunctionScreenProps>;
};

export const FUNCTIONS: TerminalFunction[] = [WEI, CRYPTO, DES, GP, N, HELP];

export function getFunction(mnemonic: string): TerminalFunction | undefined {
  const wanted = mnemonic.toUpperCase();
  return FUNCTIONS.find((f) => f.mnemonic === wanted);
}

export function functionsIn(section: SectionId): TerminalFunction[] {
  return FUNCTIONS.filter((f) => f.section === section);
}
