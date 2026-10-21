import type { ApiError } from "@/lib/api";

/** Grey bars standing in for rows while the first answer loads. Never fake numbers. */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-label="Loading" role="status" className="space-y-2 py-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3 bg-hairline" style={{ width: `${100 - ((i * 13) % 35)}%` }} />
      ))}
    </div>
  );
}

/** The backend's own error message, shown when there is nothing to display. */
export function ErrorNote({ error }: { error: ApiError }) {
  return (
    <p role="alert" className="max-w-prose text-[13px] leading-5">
      <span className="micro-label mr-2 text-ink">Not available</span>
      <span className="text-muted">{error.message}</span>
    </p>
  );
}

/** First load: skeleton, or the error if the first request failed. */
export function Pending({ error, rows }: { error: ApiError | null; rows?: number }) {
  return error ? <ErrorNote error={error} /> : <Skeleton rows={rows} />;
}

/** A refresh failed but older data is still on screen: say so in one quiet line. */
export function UpdateFailed({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <p role="status" className="micro-label mb-1 normal-case tracking-normal text-ink">
      Update failed, showing the last good data: {error.message}
    </p>
  );
}
