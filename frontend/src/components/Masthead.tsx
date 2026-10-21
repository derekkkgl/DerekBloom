import Link from "next/link";
import { Suspense } from "react";
import { CommandPalette } from "./CommandPalette";
import { CurrencyToggle } from "./CurrencyToggle";
import { SectionLinks, SectionNav } from "./SectionNav";

/**
 * The paper's masthead on one line: title, sections, "Look up" box, and PHP/USD toggle,
 * closed by a 3px double ink rule.
 */
export function Masthead() {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b-[3px] border-double border-ink py-3">
      <Link href="/" className="font-serif text-[22px] leading-7 font-semibold tracking-tight">
        The Daily Tape
      </Link>
      {/* The active section comes from the URL, which isn't known while prerendering
          pages like /fn/GP/NVDA, so show plain links until it is. */}
      <Suspense fallback={<SectionLinks active={null} />}>
        <SectionNav />
      </Suspense>
      <div className="ml-auto flex items-center gap-6">
        <CommandPalette />
        <CurrencyToggle />
      </div>
    </header>
  );
}
