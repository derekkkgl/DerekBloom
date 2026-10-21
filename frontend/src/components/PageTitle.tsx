/** A section's serif headline with an optional one-line standfirst under it. */
export function PageTitle({ title, standfirst }: { title: string; standfirst?: string }) {
  return (
    <div className="mb-4">
      <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-tight">{title}</h1>
      {standfirst && <p className="mt-0.5 text-[13px] text-muted">{standfirst}</p>}
    </div>
  );
}
