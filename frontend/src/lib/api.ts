// Typed client for the backend's response envelope:
//   success -> {"data": ..., "meta": {source, as_of, cached, stale}}
//   failure -> {"error": {code, message}} with a real HTTP status

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Meta = {
  source: string;
  as_of: string; // ISO UTC
  cached: boolean;
  stale: boolean;
};

export type Envelope<T> = { data: T; meta: Meta };

export class ApiError extends Error {
  constructor(
    readonly status: number, // 0 when the backend could not be reached at all
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal, cache: "no-store" });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "unreachable", `Can't reach the backend at ${API_URL}. Is it running?`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = body?.error;
    throw new ApiError(res.status, error?.code ?? "http_error", error?.message ?? `HTTP ${res.status}`);
  }
  return body as Envelope<T>;
}

// ---- Payload shapes (mirror backend/app/routers) ----

export type WeiRow = {
  symbol: string;
  name: string;
  region: string;
  currency: string | null; // null when the value isn't a price (DXY, yields)
  last: number | null;
  change: number | null;
  change_pct: number | null;
  ytd_pct: number | null;
  last_date: string | null;
  status: "open" | "closed";
};

export type Wei = { groups: { region: string; rows: WeiRow[] }[] };

export type CryptoGlobal = {
  market_cap_usd: number | null;
  market_cap_php: number | null;
  volume_24h_usd: number | null;
  volume_24h_php: number | null;
  market_cap_change_24h_pct: number | null;
  btc_dominance_pct: number | null;
  eth_dominance_pct: number | null;
  active_coins: number | null;
};
