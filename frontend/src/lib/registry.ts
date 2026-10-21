// The function registry: every terminal function is registered here exactly once.
// The command palette, the section pages, and HELP are all generated
// from this list, so adding a function never means editing the palette.
//
// Each function folder has index.tsx (this entry, safe to read on the server) and a
// client component for the screen itself.

import type { ComponentType } from "react";
import { CRYPTO } from "@/functions/CRYPTO";
import { DES } from "@/functions/DES";
import { GP } from "@/functions/GP";
import { HELP } from "@/functions/HELP";
import { N } from "@/functions/N";
import { WEI } from "@/functions/WEI";
import type { SectionId } from "./sections";

/** What every screen receives. Screens draw their own Panel, so they get its header text too. */
export type FunctionScreenProps = { ticker?: string; mnemonic: string; title: string };

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
