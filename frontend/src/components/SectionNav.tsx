"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, sectionFor, type SectionId } from "@/lib/sections";

/** Section links. The active one is ink with a 2px ink underline; the rest are muted. */
export function SectionLinks({ active }: { active: SectionId | null }) {
  return (
    <nav aria-label="Sections">
      <ul className="flex items-baseline gap-4 text-[13px]">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              aria-current={s.id === active ? "page" : undefined}
              className={`border-b-2 pb-0.5 ${
                s.id === active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Section links that underline the section the current URL belongs to. */
export function SectionNav() {
  return <SectionLinks active={sectionFor(usePathname())} />;
}
