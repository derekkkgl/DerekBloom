"use client";

import { useStoredString } from "./storage";

// The masthead's PHP/USD toggle. It applies only where a peso price is real: USD-priced
// tape items, the CRYPTO board, coin DES, Home's crypto column, and GP (each candle at its
// own day's USD/PHP rate, never today's). Phase 4 extends it to portfolio totals.

export type DisplayCurrency = "USD" | "PHP";

export function useDisplayCurrency(): [DisplayCurrency, (value: DisplayCurrency) => void] {
  const [value, set] = useStoredString("dailytape:currency", "USD");
  return [value === "PHP" ? "PHP" : "USD", set];
}
