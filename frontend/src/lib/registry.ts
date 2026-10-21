// The function registry: every terminal function is registered here exactly once.
// The command palette, the section pages, and HELP are all generated
// from this list, so adding a function never means editing the palette.
//
// Each function folder has index.tsx (this entry, safe to read on the server) and a
// client component for the screen itself.

import type { ComponentType } from "react";
import { CRYPTO } from "@/functions/CRYPTO";
import { DEFI } from "@/functions/DEFI";
import { DES } from "@/functions/DES";
import { GOAL } from "@/functions/GOAL";
import { GP } from "@/functions/GP";
import { HELP } from "@/functions/HELP";
import { N } from "@/functions/N";
import { PORT } from "@/functions/PORT";
import { TXN } from "@/functions/TXN";
import { WEI } from "@/functions/WEI";
import { XGLB } from "@/functions/XGLB";
import { XMOV } from "@/functions/XMOV";
import { XSEC } from "@/functions/XSEC";
import { YLD } from "@/functions/YLD";
import type { SectionId } from "./sections";

/** What every screen receives. Screens draw their own Panel, so they get its header text too. */
export type FunctionScreenProps = { ticker?: string; mnemonic: string; title: string };

/** Sub-sections of the Markets page, in page order. */
export const MARKET_GROUPS = [
  { id: "crypto", title: "Crypto" },
  { id: "world", title: "World markets" },
  { id: "rates", title: "Rates and economy" },
] as const;

export type MarketGroup = (typeof MARKET_GROUPS)[number]["id"];

export type TerminalFunction = {
  mnemonic: string;
  title: string;
  description: string;
  needsTicker: boolean;
  section: SectionId;
  /** Where it sits on the Markets page. Only used by functions in the markets section. */
  group?: MarketGroup;
  component: ComponentType<FunctionScreenProps>;
};

export const FUNCTIONS: TerminalFunction[] = [WEI, CRYPTO, XGLB, XMOV, XSEC, DEFI, DES, GP, PORT, TXN, GOAL, YLD, N, HELP];

export function getFunction(mnemonic: string): TerminalFunction | undefined {
  const wanted = mnemonic.toUpperCase();
  return FUNCTIONS.find((f) => f.mnemonic === wanted);
}

export function functionsIn(section: SectionId): TerminalFunction[] {
  return FUNCTIONS.filter((f) => f.section === section);
}

export function functionsInGroup(group: MarketGroup): TerminalFunction[] {
  return FUNCTIONS.filter((f) => f.section === "markets" && f.group === group);
}
