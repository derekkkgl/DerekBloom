"use client";

import { useCallback, useSyncExternalStore } from "react";

// Small per-browser preferences (PHP/USD choice, command history) kept in localStorage.
// Every component reading the same key stays in sync, and the server render uses the
// fallback so the first paint never mismatches.

const CHANGE_EVENT = "dailytape:storage";

// Used when localStorage is blocked (private mode): choices then last until reload.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** A string value saved in localStorage under `key`, with `fallback` until one is saved. */
export function useStoredString(key: string, fallback: string): [string, (value: string) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const set = useCallback(
    (value: string) => {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage unavailable: the in-memory copy above still works until reload.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [raw ?? fallback, set];
}
