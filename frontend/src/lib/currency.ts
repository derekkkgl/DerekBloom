"use client";

import { useStoredString } from "./storage";

// The masthead's PHP/USD toggle. Phase 2 applies it to USD-priced tape items;
// Phase 4 extends it to every price and total.

export type DisplayCurrency = "USD" | "PHP";

export function useDisplayCurrency(): [DisplayCurrency, (value: DisplayCurrency) => void] {
  const [value, set] = useStoredString("dailytape:currency", "USD");
  return [value === "PHP" ? "PHP" : "USD", set];
}
