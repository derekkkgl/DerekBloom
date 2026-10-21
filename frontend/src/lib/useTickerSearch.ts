"use client";

import { useEffect, useState } from "react";
import type { TickerSearch } from "./api";
import { filterMatches, searchPath } from "./search";
import { useApi } from "./useApi";

const DEBOUNCE_MS = 250; // wait for a pause in typing before asking Yahoo

/**
 * Ticker suggestions for what's typed. Your aliases and assets answer at once (BTC for "b");
 * Yahoo's matches join a moment later. Pass "" to search nothing.
 */
export function useTickerSearch(query: string, types?: string[], limit = 8) {
  const q = query.trim().toUpperCase();
  const [settled, setSettled] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(q), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const local = useApi<TickerSearch>(q ? searchPath(q, false) : null);
  const full = useApi<TickerSearch>(q && settled === q ? searchPath(q, true) : null);
  const best = full.data?.query === q ? full.data : local.data?.query === q ? local.data : null;

  return {
    results: best ? filterMatches(best.results, types, limit) : [],
    searching: Boolean(q) && full.data?.query !== q && !full.error,
    error: full.data?.error ?? full.error?.message ?? null,
  };
}
