import type { ReactNode } from "react";

/** Plain note for a section that isn't wired to data yet. Never shows numbers. */
export function ComingSoon({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="max-w-prose text-[13px] leading-5">
      <p className="micro-label mb-1">Arrives in Phase {phase}</p>
      <p className="text-muted">{children}</p>
    </div>
  );
}
