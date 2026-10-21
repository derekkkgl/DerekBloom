import type { ReactNode } from "react";

/** A ruled column of label / value rows, as used beside charts and on DES. */
export function StatList({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && <h3 className="micro-label border-b border-ink pb-1">{title}</h3>}
      <dl className="text-[13px]">{children}</dl>
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-baseline justify-between gap-3 border-b border-hairline py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
