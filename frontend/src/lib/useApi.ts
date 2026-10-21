"use client";

import { useEffect, useState } from "react";
import { ApiError, apiGet, type Meta } from "./api";

export type ApiState<T> = {
  data: T | null;
  meta: Meta | null;
  error: ApiError | null;
  loading: boolean; // true only until the first answer (data or error) arrives
};

const EMPTY = { data: null, meta: null, error: null, loading: true };
const IDLE = { data: null, meta: null, error: null, loading: false };

/**
 * Fetch an API path and re-fetch it every `pollMs`. Pass null to fetch nothing (yet).
 * If a refresh fails, the last good data stays on screen next to the error,
 * so a blip never blanks the page and nothing is ever made up.
 */
export function useApi<T>(path: string | null, pollMs?: number): ApiState<T> {
  // Results are tagged with their path so a new path never shows the old path's data.
  const [state, setState] = useState<ApiState<T> & { path: string | null }>({ ...EMPTY, path });

  useEffect(() => {
    if (path === null) return;
    const url = path;
    const controller = new AbortController();

    async function load() {
      try {
        const { data, meta } = await apiGet<T>(url, controller.signal);
        setState({ data, meta, error: null, loading: false, path });
      } catch (err) {
        if (controller.signal.aborted) return;
        const error = err instanceof ApiError ? err : new ApiError(0, "client_error", String(err));
        setState((prev) => (prev.path === path ? { ...prev, error, loading: false } : { ...EMPTY, error, loading: false, path }));
      }
    }

    load();
    const timer = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [path, pollMs]);

  if (path === null) return IDLE;
  return state.path === path ? state : EMPTY;
}
