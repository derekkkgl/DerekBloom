"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

/**
 * Clicking anywhere on a table row opens `href`. The row's name cell should also hold a
 * real <Link>, which is what keyboard and screen-reader users reach with Tab.
 */
export function useRowLink() {
  const router = useRouter();
  return (href: string | null) =>
    href
      ? {
          onClick: (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest("a")) router.push(href);
          },
          className: "cursor-pointer hover:bg-ink/[0.04]",
        }
      : { className: "" };
}
